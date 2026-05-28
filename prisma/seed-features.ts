/* eslint-disable @typescript-eslint/no-explicit-any */
// Seed de datos para las HERRAMIENTAS nuevas de esta sesión:
//  · Herramientas + Préstamos de herramientas (/herramientas)
//  · Cotizaciones por proveedor → matriz Histórico de Compras (/compras/historico)
//  · Inventario no catalogado + movimientos + bajas (/stock/no-catalogados)
//  · Estados de Recursos + ubicación de OT → Despachos por OT (/despachos)
//  · trabajo_externo en Planificación + filas para Dashboard Programación
//  · nombre en Compras (editor tipo Excel / contabilidad)
//
// NO modifica el esquema → no requiere migración. Es sólo data de prueba.
// Idempotente: usa upsert / guardas por conteo, se puede correr varias veces.
import { PrismaClient, TipoMovimientoInventario } from "@prisma/client";

const prisma = new PrismaClient();

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const pickN = <T>(a: T[], n: number): T[] => {
  const c = [...a]; const o: T[] = [];
  for (let i = 0; i < Math.min(n, a.length); i++) o.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return o;
};
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDec = (min: number, max: number, d = 2) => Number((Math.random() * (max - min) + min).toFixed(d));
const daysAgo = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return x; };
const daysFromNow = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return x; };

async function main() {
  console.log("🌱 Seed de herramientas nuevas...\n");

  const proveedores = await prisma.proveedor.findMany({ where: { activo: true } });
  const trabajadores = await prisma.trabajador.findMany({ where: { activo: true } });
  const ubicaciones = await prisma.ubicacion.findMany({ where: { activo: true } });
  const ots = await prisma.ordenTrabajo.findMany({ select: { id: true, ot: true } });
  const materiales = await prisma.material.findMany({ where: { activo: true }, take: 400 });

  console.log(`📊 ${proveedores.length} prov · ${trabajadores.length} trab · ${ubicaciones.length} ubic · ${ots.length} OTs · ${materiales.length} mat\n`);

  // ── 1. HERRAMIENTAS ───────────────────────────────────────────
  console.log("🔧 Herramientas...");
  const HERR = [
    "Torquímetro 3/4\"", "Llave de impacto neumática", "Prensa hidráulica 50T",
    "Puente grúa 5T", "Calibrador pie de rey digital", "Micrómetro 0-300mm",
    "Gata hidráulica 20T", "Juego de extractores", "Soplete oxicorte",
    "Pulidora angular 7\"", "Bomba de prueba hidráulica", "Multímetro Fluke",
  ];
  const herramientas = [];
  for (let i = 0; i < HERR.length; i++) {
    const codigo = `HRR-${String(i + 1).padStart(3, "0")}`;
    const stock = randInt(2, 8);
    const h = await prisma.herramienta.upsert({
      where: { codigo },
      update: { nombre: HERR[i], stock },
      create: { codigo, nombre: HERR[i], stock, asignadas: 0, estado: "Disponible" },
    });
    herramientas.push(h);
  }
  console.log(`   ✓ ${herramientas.length} herramientas`);

  // ── 2. PRÉSTAMOS DE HERRAMIENTAS ──────────────────────────────
  console.log("📋 Préstamos...");
  const prestamosExist = await prisma.prestamoHerramienta.count();
  if (prestamosExist === 0) {
    let creados = 0;
    const asignadasPorHerr = new Map<number, number>();
    for (let i = 0; i < 22; i++) {
      const h = pick(herramientas);
      const t = trabajadores.length ? pick(trabajadores) : null;
      const ot = ots.length ? pick(ots) : null;
      const cant = randInt(1, 2);
      // 60% devuelta, 25% prestada vigente, 15% vencida (sin devolver, prevista pasada)
      const r = Math.random();
      const estado = r < 0.6 ? "DEVUELTA" : "PRESTADA";
      const fechaEntrega = daysAgo(randInt(2, 45));
      const vencida = estado === "PRESTADA" && r >= 0.85;
      await prisma.prestamoHerramienta.create({
        data: {
          herramienta_id: h.id,
          cantidad: cant,
          prestado_a: t?.nombre ?? pick(["Taller Mecánico", "Área Hidráulica", "Soldadura"]),
          trabajador_id: t?.trabajador_id ?? null,
          ot_id: ot?.id ?? null,
          fecha_entrega: fechaEntrega,
          fecha_devolucion_prevista: vencida ? daysAgo(randInt(1, 10)) : daysFromNow(randInt(3, 20)),
          fecha_devolucion_real: estado === "DEVUELTA" ? daysAgo(randInt(0, 30)) : null,
          estado,
          observaciones: estado === "DEVUELTA" ? "Devuelta en buen estado" : vencida ? "Préstamo vencido" : null,
          usuario_entrega: "admin",
          usuario_recibe: estado === "DEVUELTA" ? "admin" : null,
        },
      });
      if (estado === "PRESTADA") asignadasPorHerr.set(h.id, (asignadasPorHerr.get(h.id) ?? 0) + cant);
      creados++;
    }
    for (const [hid, asig] of asignadasPorHerr) {
      const h = herramientas.find((x) => x.id === hid)!;
      await prisma.herramienta.update({
        where: { id: hid },
        data: { asignadas: asig, estado: asig >= h.stock ? "Agotada" : "Disponible" },
      });
    }
    console.log(`   ✓ ${creados} préstamos (vigentes/devueltos/vencidos)`);
  } else {
    console.log(`   ↷ ya existen ${prestamosExist} préstamos, omitido`);
  }

  // ── 3. COTIZACIONES POR PROVEEDOR (matriz histórico) ──────────
  console.log("💲 Cotizaciones por proveedor...");
  // Materiales que ya tienen precio de OC (para que la matriz combine OC + override)
  const matsConOC = await prisma.compraDetalle.findMany({
    select: { material_id: true }, distinct: ["material_id"], take: 40,
  });
  const matIdsConOC = matsConOC.map((m) => m.material_id);
  const matsParaCotizar = pickN(materiales, 35).map((m) => m.material_id);
  const matObjetivo = [...new Set([...matIdsConOC.slice(0, 20), ...matsParaCotizar])];
  let cotiz = 0;
  for (const matId of matObjetivo) {
    // 2 a 4 proveedores cotizan ese material (override editable en la matriz)
    const provs = pickN(proveedores, randInt(2, Math.min(4, proveedores.length)));
    for (const p of provs) {
      await prisma.cotizacionProveedor.upsert({
        where: { material_id_proveedor_id: { material_id: matId, proveedor_id: p.id } },
        update: { precio_unitario: randDec(40, 1500, 4) },
        create: {
          material_id: matId,
          proveedor_id: p.id,
          precio_unitario: randDec(40, 1500, 4),
          moneda_codigo: pick(["USD", "USD", "SOL"]),
          observaciones: "Cotización manual de prueba",
          usuario: "Logistica",
        },
      });
      cotiz++;
    }
  }
  console.log(`   ✓ ${cotiz} cotizaciones sobre ${matObjetivo.length} materiales`);

  // ── 4. INVENTARIO NO CATALOGADO + MOVIMIENTOS + BAJAS ─────────
  console.log("📦 Inventario no catalogado...");
  const NOCAT = [
    "Trapo industrial (kg)", "Guantes de nitrilo (par)", "Lija al agua #400",
    "Cinta teflón", "Disco de corte 7\"", "Brocha 3\"", "Wype blanco (kg)",
    "Silicona automotriz", "Soldadura 6011 (kg)", "Manguera hidráulica suelta (m)",
    "Espray penetrante", "Estopa (kg)", "Abrazadera genérica", "Tornillería surtida",
  ];
  let noCatCount = 0;
  for (let i = 0; i < NOCAT.length; i++) {
    const codigo = `NC-${String(i + 1).padStart(4, "0")}`;
    const stockInicial = randInt(5, 120);
    const ubic = ubicaciones.length ? pick(ubicaciones) : null;
    // 2 dados de baja (activo:false) para probar la baja
    const dadoBaja = i >= NOCAT.length - 2;
    const m = await prisma.materialNoCatalogado.upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        descripcion: NOCAT[i],
        unidad_medida: pick(["UNIDAD", "KG", "METRO", "PAR"]),
        stock_actual: stockInicial,
        ubicacion_codigo: ubic?.codigo ?? null,
        observaciones: dadoBaja ? "Dado de baja (prueba)" : "Material no catalogado de prueba",
        activo: !dadoBaja,
      },
    });
    // Movimiento de stock inicial (AJUSTE) + entradas/salidas
    const yaTieneMovs = await prisma.movimientoNoCatalogado.count({ where: { material_no_cat_id: m.id } });
    if (yaTieneMovs === 0) {
      await prisma.movimientoNoCatalogado.create({
        data: {
          material_no_cat_id: m.id, tipo_movimiento: TipoMovimientoInventario.AJUSTE,
          cantidad: stockInicial, motivo: "Stock inicial", usuario: "admin",
          fecha_movimiento: daysAgo(randInt(20, 60)),
        },
      });
      for (let k = 0; k < randInt(1, 3); k++) {
        await prisma.movimientoNoCatalogado.create({
          data: {
            material_no_cat_id: m.id, tipo_movimiento: TipoMovimientoInventario.ENTRADA,
            cantidad: randInt(5, 30), motivo: "Compra menor", documento_referencia: `BOL-${randInt(100, 999)}`,
            usuario: "admin", fecha_movimiento: daysAgo(randInt(5, 25)),
          },
        });
      }
      for (let k = 0; k < randInt(1, 4); k++) {
        await prisma.movimientoNoCatalogado.create({
          data: {
            material_no_cat_id: m.id, tipo_movimiento: TipoMovimientoInventario.SALIDA,
            cantidad: randInt(1, 10), motivo: "Consumo en taller", documento_referencia: ots.length ? (pick(ots).ot != null ? String(pick(ots).ot) : null) : null,
            usuario: "admin", fecha_movimiento: daysAgo(randInt(0, 15)),
          },
        });
      }
    }
    noCatCount++;
  }
  console.log(`   ✓ ${noCatCount} no catalogados (2 dados de baja) + movimientos`);

  // ── 5. DESPACHOS POR OT: estados de recursos + ubicación ──────
  console.log("🚚 Estados de recursos + ubicación en OTs...");
  const estadosRec = ["Recursos en recepción", "Recursos incompletos", "Recursos completos", "En cotización"];
  let otUpd = 0;
  for (let i = 0; i < ots.length; i++) {
    const estado = estadosRec[i % estadosRec.length];
    const ponerUbic = estado === "Recursos completos" || estado === "Recursos en recepción";
    await prisma.ordenTrabajo.update({
      where: { id: ots[i].id },
      data: {
        recursos_status_codigo: estado,
        ubicacion_codigo: ponerUbic && ubicaciones.length ? pick(ubicaciones).codigo : null,
      },
    });
    otUpd++;
  }
  console.log(`   ✓ ${otUpd} OTs con estado de recursos + ubicación`);

  // ── 6. PLANIFICACIÓN: trabajo_externo + filas Dashboard ───────
  console.log("🗓️  Planificación (trabajo externo + filas dashboard)...");
  const planifIds = (await prisma.planificacionOT.findMany({ select: { id: true } })).map((p) => p.id);
  for (const id of pickN(planifIds, Math.floor(planifIds.length * 0.35))) {
    await prisma.planificacionOT.update({ where: { id }, data: { trabajo_externo: true } });
  }
  // Filas de planificación para OTs sin planificar → Dashboard Programación con data
  const opsTpl = [
    { c: "CILINDRO", o: "DESARME", d: "Desarme y limpieza de cilindro" },
    { c: "CILINDRO", o: "EVALUACION", d: "Evaluación dimensional" },
    { c: "VASTAGO", o: "CROMADO", d: "Rectificado y cromado de vástago" },
    { c: "VASTAGO", o: "RECTIFICADO", d: "Rectificado de vástago" },
    { c: "CAMISA", o: "BRUÑIDO", d: "Bruñido de camisa" },
    { c: "EMBOLO", o: "MAQUINADO", d: "Maquinado de émbolo" },
    { c: "CILINDRO", o: "ARMADO", d: "Armado final y prueba hidráulica" },
  ];
  const otsSinPlanif = (await prisma.ordenTrabajo.findMany({
    where: { planificaciones: { none: {} } }, select: { id: true }, take: 10,
  })).map((o) => o.id);
  let planifNuevas = 0;
  for (const otId of otsSinPlanif) {
    const ops = pickN(opsTpl, randInt(3, opsTpl.length));
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      await prisma.planificacionOT.create({
        data: {
          ot_id: otId, componente: op.c, operacion_codigo: op.o, descripcion: op.d,
          orden: k + 1, horas_estimadas: randDec(2, 16, 1),
          estado: pick(["abierto", "abierto", "programado", "realizado"]),
          tecnico: trabajadores.length ? pick(trabajadores).nombre : null,
          semana_plan: `2026-W${String(randInt(18, 24)).padStart(2, "0")}`,
          trabajo_externo: Math.random() < 0.3,
          qty_personal: randInt(1, 3),
        },
      });
      planifNuevas++;
    }
  }
  console.log(`   ✓ trabajo_externo marcado + ${planifNuevas} filas de planificación nuevas`);

  // ── 7. NOMBRE en Compras (editor tipo Excel / contabilidad) ───
  console.log("📝 Nombre en compras...");
  const comprasSinNombre = await prisma.compra.findMany({
    where: { nombre: null }, select: { id: true, numero_po: true },
  });
  for (const c of comprasSinNombre) {
    await prisma.compra.update({
      where: { id: c.id },
      data: { nombre: `Compra de repuestos ${c.numero_po}` },
    });
  }
  console.log(`   ✓ ${comprasSinNombre.length} compras con nombre`);

  console.log("\n✅ Seed de herramientas nuevas completo");
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

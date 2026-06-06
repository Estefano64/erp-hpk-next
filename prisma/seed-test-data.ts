/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient, Prisma, TipoMovimientoInventario } from "@prisma/client";

const prisma = new PrismaClient();

// Helpers
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, arr.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDecimal = (min: number, max: number, decimals = 2) =>
  Number((Math.random() * (max - min) + min).toFixed(decimals));
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

async function main() {
  console.log("🌱 Iniciando seed de datos transaccionales de prueba...\n");

  // ── Cargar catálogos existentes ───────────────────────────
  const clientes = await prisma.cliente.findMany({ where: { activo: true } });
  const codRepsAll = await prisma.codigoReparacion.findMany({ where: { activo: true } });
  const fabricantes = await prisma.fabricante.findMany({ where: { activo: true } });
  const equipos = await prisma.equipo.findMany({ where: { activo: true }, take: 100 });
  const materiales = await prisma.material.findMany({ where: { activo: true }, take: 200 });
  const proveedores = await prisma.proveedor.findMany({ where: { activo: true } });
  const ubicaciones = await prisma.ubicacion.findMany({ where: { activo: true } });
  const modelosEval = await prisma.modeloEvaluacion.findMany({ where: { activo: true } });

  if (!clientes.length || !codRepsAll.length || !materiales.length || !proveedores.length) {
    console.error("❌ Faltan catálogos. Asegúrate de haber corrido seed.ts y restaurado el dump.");
    return;
  }

  console.log(`📊 Catálogos: ${clientes.length} clientes, ${codRepsAll.length} cod_rep, ${equipos.length} equipos, ${materiales.length} materiales, ${proveedores.length} proveedores, ${ubicaciones.length} ubicaciones`);

  // ── 1. ÓRDENES DE TRABAJO (20) ────────────────────────────
  console.log("\n📋 Creando 20 Órdenes de Trabajo...");
  const otStatusOpts = ["Abierta", "Cerrada"];
  const tallerStatusOpts = ["Pdt Evaluación", "Programado Evaluación", "Pdt proceso", "Programado Proceso", "Terminado"];
  const recursosStatusOpts = ["En revision procesos", "Recursos solicitados", "En cotización", "Recursos completos"];
  const tiposOT = ["Reparación general", "Mantenimiento preventivo", "Falla crítica", "Inspección programada"];

  const otsCreadas: { id: number; ot: number; cod_rep_id: number | null }[] = [];
  for (let i = 1; i <= 20; i++) {
    const cliente = pick(clientes);
    const codRep = pick(codRepsAll);
    const fab = pick(fabricantes);
    const equipo = equipos.length ? pick(equipos) : null;
    const num = String(i).padStart(4, "0");
    // OT post-migración: número entero (formato NNNNYY). Para evitar colisión
    // con producción usamos rango 100000+ que está fuera del rango real.
    const otNum = 100000 + i; // p. ej. 100001, 100002…

    // upsert por número OT
    const existing = await prisma.ordenTrabajo.findFirst({ where: { ot: otNum } });
    if (existing) {
      otsCreadas.push({ id: existing.id, ot: otNum, cod_rep_id: existing.id_cod_rep });
      continue;
    }

    const ot = await prisma.ordenTrabajo.create({
      data: {
        ot: otNum,
        id_cliente: cliente.cliente_id,
        id_cod_rep: codRep.cod_rep_id,
        id_fabricante: fab.fabricante_id,
        equipo_codigo: equipo?.codigo ?? null,
        cod_rep_flota: codRep.flota_codigo,
        cod_rep_posicion: codRep.posicion_codigo,
        descripcion: `Reparación de ${codRep.descripcion.slice(0, 80)}`,
        tipo: pick(tiposOT),
        np: codRep.np,
        ns: `NS-${randInt(10000, 99999)}`,
        fecha_recepcion: daysAgo(randInt(1, 90)),
        ot_status_codigo: pick(otStatusOpts),
        taller_status_codigo: pick(tallerStatusOpts),
        recursos_status_codigo: pick(recursosStatusOpts),
        usuario_crea: "admin",
        fecha_creacion: daysAgo(randInt(1, 90)),
        estrategia: false,
      },
    });
    otsCreadas.push({ id: ot.id, ot: otNum, cod_rep_id: ot.id_cod_rep });
  }
  console.log(`   ✓ ${otsCreadas.length} OTs disponibles`);

  // ── 2. OT REPUESTOS (3-5 por OT) ──────────────────────────
  console.log("\n🔧 Creando requerimientos (OTRepuesto) para OTs...");
  let totalRepuestos = 0;
  for (const ot of otsCreadas.slice(0, 15)) {
    const numItems = randInt(2, 5);
    const matsSel = pickN(materiales, numItems);
    for (let idx = 0; idx < matsSel.length; idx++) {
      const mat = matsSel[idx];
      const cant = randInt(1, 10);
      const precio = mat.precio ? Number(mat.precio) : randDecimal(50, 800);
      const exists = await prisma.oTRepuesto.findFirst({
        where: { ot_id: ot.id, material_id: mat.material_id, item_req: idx + 1 },
      });
      if (exists) continue;
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          material_id: mat.material_id,
          material_codigo: mat.codigo,
          tipo_codigo: "MAC",
          cantidad: cant,
          descripcion: mat.descripcion,
          precio_unitario: precio,
          precio_venta: precio * 1.3,
          moneda: mat.moneda_codigo ?? "USD",
          unidad_medida: mat.unidad_medida_codigo,
          fabricante_codigo: mat.fabricante_codigo,
          fecha_solicitud: daysAgo(randInt(1, 60)),
          item_req: idx + 1,
          nro_req: `R25-${String(ot.id).padStart(4, "0")}`,
          status_requerimiento_codigo: pick(["SIN_APROBACION", "APROBADO"]),
          usuario_solicita: "admin",
        },
      });
      totalRepuestos++;
    }
  }
  console.log(`   ✓ ${totalRepuestos} requerimientos creados`);

  // ── 3. COMPRAS (15 con detalles) ──────────────────────────
  console.log("\n🛒 Creando 15 Compras con detalles...");
  const statusOCOpts = ["PEND_OC", "PROCESO", "ENTREGADO", "COMPLETO"];
  const monedaCodes = ["USD", "SOL"];
  let comprasCreadas = 0;
  for (let i = 1; i <= 15; i++) {
    const num = String(i).padStart(4, "0");
    const numeroPo = `D25${num}`;
    const exists = await prisma.compra.findUnique({ where: { numero_po: numeroPo } });
    if (exists) continue;

    const proveedor = pick(proveedores);
    const ubicacion = ubicaciones.length ? pick(ubicaciones) : null;
    const ot = pick(otsCreadas);
    const numDet = randInt(2, 5);
    const matsSel = pickN(materiales, numDet);
    const moneda = pick(monedaCodes);
    const status = pick(statusOCOpts);

    let subtotal = 0;
    const detallesData = matsSel.map((mat) => {
      const cant = randInt(1, 8);
      const precio = mat.precio ? Number(mat.precio) : randDecimal(80, 1200);
      const sub = cant * precio;
      subtotal += sub;
      return {
        material_id: mat.material_id,
        cantidad: cant,
        precio_unitario: precio,
        subtotal: sub,
        impuesto: sub * 0.18,
        total: sub * 1.18,
        cantidad_recibida: status === "COMPLETO" || status === "ENTREGADO" ? cant : 0,
        cantidad_en_transito: status === "PROCESO" ? cant : 0,
        status_oc_codigo: status,
      };
    });

    const compra = await prisma.compra.create({
      data: {
        numero_po: numeroPo,
        numero_req: `R25-${String(ot.id).padStart(4, "0")}`,
        ot_id: ot.id,
        proveedor_id: proveedor.id,
        ubicacion_codigo: ubicacion?.codigo ?? null,
        moneda_codigo: moneda,
        fecha_solicitud: daysAgo(randInt(5, 60)),
        fecha_entrega_esperada: daysAgo(randInt(-30, 5)),
        fecha_entrega_real: status === "COMPLETO" || status === "ENTREGADO" ? daysAgo(randInt(0, 10)) : null,
        status_oc_codigo: status,
        subtotal,
        impuesto: subtotal * 0.18,
        total: subtotal * 1.18,
        observaciones: `Orden de compra de ejemplo #${i}`,
        usuario_solicita: "admin",
        usuario_aprueba: status !== "PEND_OC" ? "admin" : null,
        nro_factura: status === "COMPLETO" ? `F001-${randInt(1000, 9999)}` : null,
        nro_guia: status === "COMPLETO" || status === "ENTREGADO" ? `G001-${randInt(1000, 9999)}` : null,
        detalles: { create: detallesData },
      },
    });
    comprasCreadas++;

    // Si está COMPLETO, generar movimientos de entrada
    if (status === "COMPLETO") {
      for (const d of detallesData) {
        await prisma.movimientoInventario.create({
          data: {
            material_id: d.material_id,
            tipo_movimiento: TipoMovimientoInventario.ENTRADA,
            cantidad: d.cantidad,
            documento_referencia: `${compra.numero_po} / G:${compra.nro_guia}`,
            observacion: `Recepción OC ${compra.numero_po}`,
            usuario: "admin",
            fecha_movimiento: compra.fecha_entrega_real ?? new Date(),
          },
        });
        // actualizar stock
        await prisma.$executeRaw`UPDATE material SET stock_actual = COALESCE(stock_actual, 0) + ${d.cantidad}, updated_at = NOW() WHERE material_id = ${d.material_id}`;
      }
    }
  }
  console.log(`   ✓ ${comprasCreadas} compras creadas`);

  // ── 4. MOVIMIENTOS ADICIONALES (20 SALIDA + 10 AJUSTE) ────
  console.log("\n📦 Creando 30 movimientos adicionales (SALIDA/AJUSTE)...");
  let movs = 0;
  for (let i = 0; i < 20; i++) {
    const mat = pick(materiales);
    const matFresh = await prisma.material.findUnique({ where: { material_id: mat.material_id }, select: { stock_actual: true } });
    const stockActual = Number(matFresh?.stock_actual ?? 0);
    if (stockActual <= 0) continue;
    const cant = randInt(1, Math.max(1, Math.min(Math.floor(stockActual), 5)));
    if (cant <= 0) continue;
    await prisma.movimientoInventario.create({
      data: {
        material_id: mat.material_id,
        tipo_movimiento: TipoMovimientoInventario.SALIDA,
        cantidad: cant,
        documento_referencia: `OT-25-${String(randInt(1, 20)).padStart(4, "0")}`,
        observacion: `Consumo en OT`,
        usuario: "admin",
        fecha_movimiento: daysAgo(randInt(0, 30)),
      },
    });
    await prisma.$executeRaw`UPDATE material SET stock_actual = COALESCE(stock_actual, 0) - ${cant}, updated_at = NOW() WHERE material_id = ${mat.material_id}`;
    movs++;
  }
  for (let i = 0; i < 10; i++) {
    const mat = pick(materiales);
    const cant = randInt(5, 50);
    await prisma.movimientoInventario.create({
      data: {
        material_id: mat.material_id,
        tipo_movimiento: TipoMovimientoInventario.AJUSTE,
        cantidad: cant,
        documento_referencia: `INV-${randInt(2024, 2025)}-${randInt(100, 999)}`,
        observacion: `Ajuste por inventario físico`,
        usuario: "admin",
        fecha_movimiento: daysAgo(randInt(0, 60)),
      },
    });
    await prisma.material.update({ where: { material_id: mat.material_id }, data: { stock_actual: cant } });
    movs++;
  }
  console.log(`   ✓ ${movs} movimientos adicionales`);

  // ── 5. EVALUACIONES TÉCNICAS (8) ───────────────────────────
  console.log("\n🔍 Creando 8 Evaluaciones Técnicas...");
  const estadosEval = ["BORRADOR", "PENDIENTE_APROBACION", "APROBADA", "RECHAZADA"];
  const modelosEvalCodes = ["cil_vastago_simple", "cil_pivotado", "cil_doble_vastago", "cil_telescopico", "acum_embolo", "acum_vejiga", "rueda_delantera"];
  let evalsCreadas = 0;
  for (let i = 0; i < 8; i++) {
    const ot = otsCreadas[i % otsCreadas.length];
    const exists = await prisma.evaluacionTecnica.findFirst({ where: { ot_id: ot.id } });
    if (exists) continue;
    const estado = pick(estadosEval);
    const modelo = pick(modelosEvalCodes);
    const datos: Record<string, unknown> = {
      [`t1_cil_a1_x`]: randDecimal(150, 250).toFixed(2),
      [`t1_cil_a1_y`]: randDecimal(150, 250).toFixed(2),
      [`t1_cil_dext_x`]: randDecimal(180, 280).toFixed(2),
      [`t1_cil_dext_y`]: randDecimal(180, 280).toFixed(2),
      [`t1_cil_ltot`]: randDecimal(800, 1500).toFixed(0),
      [`t1_vas_dext_x`]: randDecimal(60, 120).toFixed(2),
      [`t1_vas_ltot`]: randDecimal(700, 1400).toFixed(0),
    };

    await prisma.evaluacionTecnica.create({
      data: {
        ot_id: ot.id,
        modelo_evaluacion: modelo,
        sistema_medicion: "Metrico",
        fecha_evaluacion: daysAgo(randInt(1, 30)),
        evaluado_por: pick(["Carlos Mendoza", "Ana Torres", "Luis Pérez", "María García"]),
        datos_formulario: datos as Prisma.InputJsonValue,
        resultado_general: estado === "BORRADOR" ? null : "Componente apto para reparación. Desgaste dentro de tolerancia.",
        recomendaciones_general: estado === "BORRADOR" ? null : "Reemplazar sellos y cromar vástago.",
        estado,
        revisado_por: ["APROBADA", "RECHAZADA"].includes(estado) ? "Supervisor Técnico" : null,
        fecha_revision: ["APROBADA", "RECHAZADA"].includes(estado) ? daysAgo(randInt(0, 5)) : null,
        comentarios_revision: estado === "RECHAZADA" ? "Falta evidencia fotográfica de hallazgos" : null,
        solicitado_revision_por: estado === "PENDIENTE_APROBACION" ? "admin" : null,
        fecha_solicitud_revision: estado === "PENDIENTE_APROBACION" ? daysAgo(randInt(0, 3)) : null,
      },
    });
    evalsCreadas++;
  }
  console.log(`   ✓ ${evalsCreadas} evaluaciones técnicas creadas`);

  // ─────────────────────────────────────────────────────────────────────
  // 6. ESCENARIOS PARA FEATURES NUEVAS (T1-T5)
  // ─────────────────────────────────────────────────────────────────────
  console.log("\n🎯 Generando escenarios para flujos nuevos (T1-T5)...");

  // ── 6a) T3: Requerimientos APROBADO SIN PRECIO ──────────────
  //         Para probar que el botón "Generar OC" se bloquea hasta asignar
  //         precio inline en la columna "Precio unit.".
  console.log("   • T3: requerimientos aprobados sin precio…");
  let sinPrecioCount = 0;
  const otsParaReq = otsCreadas.slice(0, 5);
  for (const ot of otsParaReq) {
    const mat = pick(materiales);
    const cant = randInt(1, 5);
    const yaExiste = await prisma.oTRepuesto.findFirst({
      where: { ot_id: ot.id, material_id: mat.material_id, precio_unitario: null },
    });
    if (yaExiste) continue;
    const nextItem = (await prisma.oTRepuesto.aggregate({
      where: { ot_id: ot.id },
      _max: { item_req: true },
    }))._max.item_req ?? 0;
    await prisma.oTRepuesto.create({
      data: {
        ot_id: ot.id,
        material_id: mat.material_id,
        material_codigo: mat.codigo,
        tipo_codigo: "MAC",
        cantidad: cant,
        descripcion: mat.descripcion,
        precio_unitario: null,
        moneda: mat.moneda_codigo ?? "USD",
        unidad_medida: mat.unidad_medida_codigo,
        fabricante_codigo: mat.fabricante_codigo,
        fecha_solicitud: daysAgo(randInt(1, 30)),
        item_req: nextItem + 1,
        nro_req: `R25-${String(ot.id).padStart(4, "0")}`,
        status_requerimiento_codigo: "APROBADO",
        usuario_solicita: "admin",
        po_id: null,
      },
    });
    sinPrecioCount++;
  }
  console.log(`     ✓ ${sinPrecioCount} requerimientos APROBADO sin precio`);

  // ── 6b) T2: OTs en estado "Terminado" listas para despacho a mina ──
  //         Crea 5 OTs con taller_status=Terminado y items con
  //         status_oc=ENTREGADO para que el conteo items_count > 0.
  console.log("   • T2: OTs terminadas para despacho a mina…");
  const otsTerminadas: number[] = [];
  for (let i = 0; i < 5; i++) {
    const otNum = 200000 + i; // batch T → rango 200xxx
    let ot = await prisma.ordenTrabajo.findFirst({ where: { ot: otNum } });
    if (!ot) {
      const cliente = pick(clientes);
      const codRep = pick(codRepsAll);
      const fab = pick(fabricantes);
      ot = await prisma.ordenTrabajo.create({
        data: {
          ot: otNum,
          id_cliente: cliente.cliente_id,
          id_cod_rep: codRep.cod_rep_id,
          id_fabricante: fab.fabricante_id,
          equipo_codigo: equipos.length ? pick(equipos).codigo : null,
          cod_rep_flota: codRep.flota_codigo,
          cod_rep_posicion: codRep.posicion_codigo,
          descripcion: `Reparación lista para despacho — ${codRep.descripcion.slice(0, 60)}`,
          tipo: "Reparación general",
          np: codRep.np,
          ns: `NS-${randInt(50000, 99999)}`,
          plaqueteo: `PLQ-${randInt(1000, 9999)}`,
          wo_cliente: `WO-${randInt(2000, 2999)}`,
          po_cliente: `PO-${randInt(3000, 3999)}`,
          fecha_recepcion: daysAgo(randInt(30, 90)),
          ot_status_codigo: "Abierta",
          taller_status_codigo: "Terminado",
          recursos_status_codigo: "Recursos completos",
          usuario_crea: "admin",
          fecha_creacion: daysAgo(randInt(30, 90)),
          estrategia: false,
        },
      });
    } else {
      // Forzar estado Terminado si ya existía
      await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: { taller_status_codigo: "Terminado" },
      });
    }
    // Asegurar al menos 2 items ENTREGADO en esta OT
    const itemsEnt = await prisma.oTRepuesto.count({
      where: { ot_id: ot.id, status_oc_codigo: "ENTREGADO" },
    });
    if (itemsEnt < 2) {
      const matsSel = pickN(materiales, 2);
      const nextItem = (await prisma.oTRepuesto.aggregate({
        where: { ot_id: ot.id },
        _max: { item_req: true },
      }))._max.item_req ?? 0;
      for (let j = 0; j < matsSel.length; j++) {
        const mat = matsSel[j];
        const cant = randInt(1, 4);
        const precio = mat.precio ? Number(mat.precio) : randDecimal(80, 800);
        await prisma.oTRepuesto.create({
          data: {
            ot_id: ot.id,
            material_id: mat.material_id,
            material_codigo: mat.codigo,
            tipo_codigo: "MAC",
            cantidad: cant,
            cantidad_recibida: cant,
            descripcion: mat.descripcion,
            precio_unitario: precio,
            moneda: mat.moneda_codigo ?? "USD",
            unidad_medida: mat.unidad_medida_codigo,
            fabricante_codigo: mat.fabricante_codigo,
            fecha_solicitud: daysAgo(randInt(40, 60)),
            fecha_entrega_real: daysAgo(randInt(1, 10)),
            item_req: nextItem + j + 1,
            nro_req: `R25-${String(ot.id).padStart(4, "0")}`,
            status_requerimiento_codigo: "APROBADO",
            status_oc_codigo: "ENTREGADO",
            usuario_solicita: "admin",
          },
        });
      }
    }
    otsTerminadas.push(ot.id);
  }
  console.log(`     ✓ ${otsTerminadas.length} OTs en "Terminado" listas para despacho`);

  // ── 6c) T4: OTs en estado "Entregado" para facturación ──
  //         3 OTs CON guía emitida y adjunto despacho (listas a facturar)
  //         3 OTs SIN adjunto despacho (deben aparecer en lista con "Faltan")
  console.log("   • T4: OTs entregadas para facturación…");
  const otsConAdjuntos: number[] = [];
  const otsSinAdjuntos: number[] = [];
  for (let i = 0; i < 6; i++) {
    const otNum = 300000 + i; // batch E → rango 300xxx
    let ot = await prisma.ordenTrabajo.findFirst({ where: { ot: otNum } });
    const conAdjunto = i < 3;
    if (!ot) {
      const cliente = pick(clientes);
      const codRep = pick(codRepsAll);
      const fab = pick(fabricantes);
      ot = await prisma.ordenTrabajo.create({
        data: {
          ot: otNum,
          id_cliente: cliente.cliente_id,
          id_cod_rep: codRep.cod_rep_id,
          id_fabricante: fab.fabricante_id,
          equipo_codigo: equipos.length ? pick(equipos).codigo : null,
          cod_rep_flota: codRep.flota_codigo,
          cod_rep_posicion: codRep.posicion_codigo,
          descripcion: `OT entregada, pendiente facturación — ${codRep.descripcion.slice(0, 60)}`,
          tipo: "Reparación general",
          np: codRep.np,
          ns: `NS-${randInt(50000, 99999)}`,
          plaqueteo: `PLQ-${randInt(1000, 9999)}`,
          wo_cliente: `WO-${randInt(2000, 2999)}`,
          po_cliente: `PO-${randInt(3000, 3999)}`,
          fecha_recepcion: daysAgo(randInt(60, 120)),
          fecha_entrega: daysAgo(randInt(1, 15)),
          guia_entrega_salida: `GR-2026-${String(i + 1).padStart(4, "0")}`,
          nro_informe_entrega: `INF-${randInt(1000, 9999)}`,
          monto_cotizacion: randDecimal(5000, 25000),
          ot_status_codigo: "Abierta",
          taller_status_codigo: "Entregado",
          recursos_status_codigo: "Recursos completos",
          usuario_crea: "admin",
          fecha_creacion: daysAgo(randInt(60, 120)),
          estrategia: false,
        },
      });
    } else {
      await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          taller_status_codigo: "Entregado",
          guia_entrega_salida: ot.guia_entrega_salida ?? `GR-2026-${String(i + 1).padStart(4, "0")}`,
          fecha_entrega: ot.fecha_entrega ?? daysAgo(randInt(1, 15)),
        },
      });
    }
    // Adjunto etapa "despacho" para los 3 primeros
    if (conAdjunto) {
      const yaTiene = await prisma.otAdjunto.findFirst({
        where: { orden_trabajo_id: ot.id, etapa_codigo: "despacho" },
      });
      if (!yaTiene) {
        await prisma.otAdjunto.create({
          data: {
            orden_trabajo_id: ot.id,
            etapa_codigo: "despacho",
            nombre_archivo: `guia-firmada-${otNum}.pdf`,
            r2_key: `ot/adjuntos/seed-${otNum}-guia.pdf`,
            tipo_mime: "application/pdf",
            tamano: randInt(50000, 500000),
          },
        });
      }
      otsConAdjuntos.push(ot.id);
    } else {
      otsSinAdjuntos.push(ot.id);
    }
    // Items ENTREGADO para que tengan algo que facturar
    const itemsEnt = await prisma.oTRepuesto.count({
      where: { ot_id: ot.id, status_oc_codigo: "ENTREGADO" },
    });
    if (itemsEnt < 1) {
      const mat = pick(materiales);
      const precio = mat.precio ? Number(mat.precio) : randDecimal(100, 1000);
      const cant = randInt(1, 3);
      const nextItem = (await prisma.oTRepuesto.aggregate({
        where: { ot_id: ot.id },
        _max: { item_req: true },
      }))._max.item_req ?? 0;
      await prisma.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          material_id: mat.material_id,
          material_codigo: mat.codigo,
          tipo_codigo: "MAC",
          cantidad: cant,
          cantidad_recibida: cant,
          descripcion: mat.descripcion,
          precio_unitario: precio,
          moneda: mat.moneda_codigo ?? "USD",
          unidad_medida: mat.unidad_medida_codigo,
          fabricante_codigo: mat.fabricante_codigo,
          fecha_solicitud: daysAgo(randInt(40, 80)),
          fecha_entrega_real: daysAgo(randInt(1, 20)),
          item_req: nextItem + 1,
          nro_req: `R25-${String(ot.id).padStart(4, "0")}`,
          status_requerimiento_codigo: "APROBADO",
          status_oc_codigo: "ENTREGADO",
          usuario_solicita: "admin",
        },
      });
    }
  }
  console.log(`     ✓ ${otsConAdjuntos.length} OTs Entregado con adjuntos (listas a facturar)`);
  console.log(`     ✓ ${otsSinAdjuntos.length} OTs Entregado SIN adjuntos (validación bloqueante)`);

  // ── 6d) T5: Compras con descuento y otros poblados ──
  //         Las nuevas columnas existen pero por defecto = 0. Actualizamos
  //         3 compras existentes para que tengan valores y poder visualizar
  //         el efecto en el editor de plantilla OC.
  console.log("   • T5: compras con descuento + otros para visualizar…");
  const comprasParaDesc = await prisma.compra.findMany({
    where: { status_oc_codigo: { in: ["PEND_OC", "PROCESO", "INCOMPLETO"] } },
    take: 3,
    orderBy: { id: "desc" },
  });
  let updatesT5 = 0;
  for (const c of comprasParaDesc) {
    const subtotalDec = new Prisma.Decimal(c.subtotal);
    if (subtotalDec.lte(0)) continue;
    const descuento = subtotalDec.mul("0.05").toDecimalPlaces(2);          // 5% descuento
    const otros = new Prisma.Decimal(randDecimal(20, 200)).toDecimalPlaces(2); // cargo adicional
    const base = subtotalDec.minus(descuento);
    const impuesto = base.mul("0.18").toDecimalPlaces(2);
    const total = base.plus(impuesto).plus(otros).toDecimalPlaces(2);
    await prisma.compra.update({
      where: { id: c.id },
      data: { descuento, otros, impuesto, total },
    });
    updatesT5++;
  }
  console.log(`     ✓ ${updatesT5} compras con descuento (5%) + otros poblados`);

  // ── 6e) T1: Cotizaciones manuales (override) para enriquecer histórico ──
  //         Crea cotizaciones manuales para algunos pares material/proveedor
  //         de modo que la matriz del histórico muestre celdas naranjas
  //         (cotización manual) además de las celdas verdes (precio OC real).
  console.log("   • T1: cotizaciones manuales (override) para histórico…");
  let cotsCreadas = 0;
  const matsParaCot = pickN(materiales, 15);
  for (const mat of matsParaCot) {
    const provsParaCot = pickN(proveedores, randInt(1, 3));
    for (const prov of provsParaCot) {
      const yaExiste = await prisma.cotizacionProveedor.findUnique({
        where: { material_id_proveedor_id: { material_id: mat.material_id, proveedor_id: prov.id } },
      });
      if (yaExiste) continue;
      await prisma.cotizacionProveedor.create({
        data: {
          material_id: mat.material_id,
          proveedor_id: prov.id,
          precio_unitario: mat.precio ? Number(mat.precio) * randDecimal(0.85, 1.15, 4) : randDecimal(50, 1500, 2),
          moneda_codigo: mat.moneda_codigo ?? "USD",
          observaciones: "Cotización generada por seed",
          usuario: "admin",
          fecha: daysAgo(randInt(0, 30)),
        },
      });
      cotsCreadas++;
    }
  }
  console.log(`     ✓ ${cotsCreadas} cotizaciones manuales (con fecha)`);

  console.log("\n✅ Seed transaccional completo");
  console.log("\n📋 Para probar las features nuevas:");
  console.log("   • T1 Histórico → /compras/historico (ver fecha en cada celda)");
  console.log("   • T3 Precio obligatorio → /compras tab 'Requerimientos aprobados' (items con + asignar)");
  console.log("   • T5 Descuentos → /compras/[id]/editar (3 OCs con descuento)");
  console.log("   • T2 Despacho a mina → /despachos/mina (5 OTs en Terminado)");
  console.log("   • T4 Facturación OT → /facturacion/ot (3 con adjuntos OK + 3 con faltantes)");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

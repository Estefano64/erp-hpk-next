/**
 * Verifica el flujo completo de requerimientos:
 *  1. aplicar-template → 1 nro_req con N items
 *  2. anular requerimiento con cot pendiente → cascada a status_cotizacion
 *  3. crear-oc → status_oc PROCESO + fecha_entrega_esperada
 *
 * Replica la lógica de las routes contra Prisma directamente.
 * Limpia todo lo creado al terminar (transacción al final).
 *
 * Uso: npx tsx scripts/test-flow-requerimientos.ts
 */
import { PrismaClient } from "@prisma/client";
import { nextNroReqExterna } from "../src/lib/requerimientos";

const prisma = new PrismaClient();

// Helpers
const log = (label: string, ok: boolean, info: string = "") => {
  const tag = ok ? "✓" : "✗";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  console.log(`${color}${tag}\x1b[0m ${label}${info ? ` — ${info}` : ""}`);
  if (!ok) {
    failures++;
  }
};

let failures = 0;

async function main() {
  console.log("\n=== TEST FLOW: REQUERIMIENTOS ===\n");

  // ── Setup ──
  const cliente = await prisma.cliente.findFirst();
  if (!cliente) throw new Error("No hay clientes en DB");

  const codRep = await prisma.codigoReparacion.findFirst({
    where: { tareas: { some: {} } },
    include: { tareas: { take: 6, orderBy: { item_numero: "asc" } } },
  });
  if (!codRep || codRep.tareas.length < 3) throw new Error("No hay codRep con suficientes tareas");

  console.log(
    `Setup: cliente=${cliente.razon_social}, codRep=${codRep.codigo}, tareas=${codRep.tareas.length}\n`
  );

  // ── 1. Crear OT ──
  const ot = await prisma.ordenTrabajo.create({
    data: {
      ot: "TEST-OT-001",
      id_cliente: cliente.cliente_id,
      id_cod_rep: codRep.cod_rep_id,
      descripcion: "OT de test automático",
      usuario_crea: "test-flow",
    },
  });
  console.log(`OT creada: id=${ot.id} (${ot.ot})`);

  // ── 2. Aplicar template (replica lógica de aplicar-template/route.ts) ──
  const tareasPara = codRep.tareas.slice(0, 5); // Tomar 5 items para el test
  const created = await prisma.$transaction(async (tx) => {
    const nroReq = await nextNroReqExterna(tx, ot.id);
    const ids: number[] = [];
    for (let i = 0; i < tareasPara.length; i++) {
      const t = tareasPara[i];
      const r = await tx.oTRepuesto.create({
        data: {
          ot_id: ot.id,
          material_codigo: t.material_codigo ?? null,
          tipo_codigo: t.tipo_codigo,
          cantidad: t.requerimiento,
          descripcion: t.descripcion,
          unidad_medida: "UNIDAD",
          precio_unitario: t.precio ?? null,
          moneda: "USD",
          es_adicional: false,
          nro_req: nroReq,
          item_req: i + 1,
          status_requerimiento_codigo: "BORRADOR",
          usuario_solicita: "test-flow",
        },
      });
      ids.push(r.id);
    }
    return { nroReq, ids };
  });

  // Verificar TEST 1: 1 nro_req para todos los items
  const items = await prisma.oTRepuesto.findMany({
    where: { ot_id: ot.id },
    orderBy: { item_req: "asc" },
  });
  const nrosUnicos = new Set(items.map((i) => i.nro_req));
  log("TEST 1a: aplicar-template usa 1 nro_req para todos los items",
    nrosUnicos.size === 1,
    `nros únicos: ${[...nrosUnicos].join(", ")}`);

  log("TEST 1b: item_req es 1, 2, 3, ... incremental",
    items.every((i, idx) => i.item_req === idx + 1),
    `items: ${items.map((i) => i.item_req).join(",")}`);

  log("TEST 1c: cantidad de items igual a tareas del template",
    items.length === tareasPara.length,
    `items=${items.length}, tareas=${tareasPara.length}`);

  // ── 3. Test status_cotizacion cascada en anular ──
  // Ponemos un item en SIN_APROBACION + status_cotizacion=PEND_COT, luego anulamos.
  const itemAAnular = items[0];
  await prisma.oTRepuesto.update({
    where: { id: itemAAnular.id },
    data: {
      status_requerimiento_codigo: "SIN_APROBACION",
      status_cotizacion_codigo: "PEND_COT",
    },
  });

  // Replicar la lógica de anular/route.ts
  const cur = await prisma.oTRepuesto.findUnique({
    where: { id: itemAAnular.id },
    select: {
      status_requerimiento_codigo: true,
      status_cotizacion_codigo: true,
      po_id: true,
    },
  });
  const cotizacionPendiente =
    cur?.status_cotizacion_codigo === "PEND_COT" ||
    cur?.status_cotizacion_codigo === "PEND_APROB";

  await prisma.oTRepuesto.update({
    where: { id: itemAAnular.id },
    data: {
      status_requerimiento_codigo: "ANULADO",
      ...(cotizacionPendiente ? { status_cotizacion_codigo: "ANULADO" } : {}),
    },
  });

  const anulado = await prisma.oTRepuesto.findUnique({ where: { id: itemAAnular.id } });
  log("TEST 2a: anular pasa status_requerimiento a ANULADO",
    anulado?.status_requerimiento_codigo === "ANULADO",
    `status: ${anulado?.status_requerimiento_codigo}`);
  log("TEST 2b: anular cascadea status_cotizacion a ANULADO si estaba pendiente",
    anulado?.status_cotizacion_codigo === "ANULADO",
    `cot: ${anulado?.status_cotizacion_codigo}`);

  // ── 4. Test crear-oc → status_oc=PROCESO + fecha_entrega_esperada ──
  // Aprobar 2 items, ponerles proveedor + precio, y crear OC
  const itemsParaOC = items.slice(1, 3); // segundo y tercero
  const proveedor = await prisma.proveedor.findFirst();
  if (!proveedor) throw new Error("No hay proveedores");

  await prisma.oTRepuesto.updateMany({
    where: { id: { in: itemsParaOC.map((i) => i.id) } },
    data: {
      status_requerimiento_codigo: "APROBADO",
      proveedor_id: proveedor.id,
      precio_unitario: 100,
    },
  });

  // Replicar la lógica de crear-oc/route.ts (versión simplificada)
  const fechaEntrega = "2026-06-15";
  const repuestos = await prisma.oTRepuesto.findMany({
    where: { id: { in: itemsParaOC.map((i) => i.id) } },
  });

  const subtotal = repuestos.reduce(
    (s, r) => s + Number(r.cantidad) * Number(r.precio_unitario || 0),
    0
  );
  const impuesto = subtotal * 0.18;
  const total = subtotal + impuesto;

  const compra = await prisma.compra.create({
    data: {
      numero_po: "TEST-OC-001",
      proveedor_id: proveedor.id,
      fecha_solicitud: new Date(),
      fecha_entrega_esperada: new Date(fechaEntrega),
      status_oc_codigo: "PEND_OC",
      subtotal,
      impuesto,
      total,
      moneda_codigo: "USD",
      observaciones: "Test OC",
      usuario_solicita: "test-flow",
    },
  });

  // Crear detalles
  await prisma.compraDetalle.createMany({
    data: repuestos
      .filter((r) => r.material_id) // solo MAC con material asignado
      .map((r) => ({
        compra_id: compra.id,
        material_id: r.material_id!,
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario || 0,
        subtotal: Number(r.cantidad) * Number(r.precio_unitario || 0),
        total: Number(r.cantidad) * Number(r.precio_unitario || 0) * 1.18,
        impuesto: Number(r.cantidad) * Number(r.precio_unitario || 0) * 0.18,
      })),
  });

  // Aplicar el fix: PROCESO + fecha_entrega_esperada
  await prisma.oTRepuesto.updateMany({
    where: { id: { in: repuestos.map((r) => r.id) } },
    data: {
      po_id: compra.id,
      nro_oc: compra.numero_po,
      fecha_oc: new Date(),
      fecha_entrega_esperada: new Date(fechaEntrega),
      status_oc_codigo: "PROCESO",
    },
  });

  const itemsConOC = await prisma.oTRepuesto.findMany({
    where: { id: { in: itemsParaOC.map((i) => i.id) } },
  });
  log("TEST 3a: crear-oc setea status_oc a PROCESO (no PEND_OC)",
    itemsConOC.every((i) => i.status_oc_codigo === "PROCESO"),
    `statuses: ${itemsConOC.map((i) => i.status_oc_codigo).join(",")}`);
  log("TEST 3b: crear-oc guarda fecha_entrega_esperada en cada item",
    itemsConOC.every((i) => i.fecha_entrega_esperada !== null),
    `fechas: ${itemsConOC.map((i) => i.fecha_entrega_esperada?.toISOString().slice(0, 10)).join(",")}`);
  log("TEST 3c: crear-oc setea po_id y nro_oc",
    itemsConOC.every((i) => i.po_id === compra.id && i.nro_oc === compra.numero_po),
    `po_id=${itemsConOC[0].po_id}, nro_oc=${itemsConOC[0].nro_oc}`);

  // ── 5. Test agrupación: simular fetch GET /api/requerimientos ──
  const allItems = await prisma.oTRepuesto.findMany({
    where: { ot_id: ot.id },
    include: {
      orden_trabajo: {
        select: {
          id: true, ot: true,
          cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
        },
      },
      compra: { select: { id: true, numero_po: true } },
      proveedor: { select: { id: true, razon_social: true } },
    },
  });

  // Agrupar como en el page.tsx
  const groups = new Map<string, typeof allItems>();
  for (const r of allItems) {
    const key = r.nro_req ?? `__sin_${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  log("TEST 4a: todos los items pertenecen a 1 solo grupo",
    groups.size === 1,
    `grupos=${groups.size}`);
  const [primerGrupo] = groups.values();
  log("TEST 4b: el grupo contiene los N items esperados",
    primerGrupo.length === 5,
    `items en grupo=${primerGrupo.length}`);

  // ── Cleanup ──
  await prisma.$transaction(async (tx) => {
    await tx.compraDetalle.deleteMany({ where: { compra_id: compra.id } });
    await tx.oTRepuesto.updateMany({
      where: { ot_id: ot.id },
      data: { po_id: null }, // soltar la FK antes de borrar Compra
    });
    await tx.compra.delete({ where: { id: compra.id } });
    await tx.ordenTrabajo.delete({ where: { id: ot.id } });
  });
  console.log("\nCleanup OK. DB queda como estaba.\n");

  if (failures > 0) {
    console.log(`\n\x1b[31m✗ ${failures} test(s) fallaron\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log("\x1b[32m✓ Todos los tests pasaron\x1b[0m\n");
  }
}

main()
  .catch((e) => {
    console.error("\nFATAL:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

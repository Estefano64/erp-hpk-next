// scripts/count-state-pre-deploy.ts
// SOLO LECTURA. Cuenta entidades clave en Railway para dimensionar la migración
// pre-deploy: cuántas OT internas, requerimientos, OCs, recepciones tenemos.

import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=".repeat(60));
  console.log("ESTADO ACTUAL DE LA BD (Railway) — SOLO LECTURA");
  console.log("=".repeat(60));

  // OT externas por tipo
  const otExt = await prisma.ordenTrabajo.groupBy({
    by: ["tipo_codigo"],
    _count: { _all: true },
  });
  console.log("\n📋 OT EXTERNAS por tipo_codigo:");
  for (const r of otExt) {
    console.log(`   ${r.tipo_codigo ?? "(null)"}: ${r._count._all}`);
  }
  const otExtTotal = await prisma.ordenTrabajo.count();
  console.log(`   TOTAL: ${otExtTotal}`);

  // OT internas
  const otIntTotal = await prisma.ordenTrabajoInterna.count();
  const otIntActivas = await prisma.ordenTrabajoInterna.count({ where: { activo: true } });
  console.log(`\n🔧 OT INTERNAS:`);
  console.log(`   Total: ${otIntTotal}  (activas: ${otIntActivas})`);

  if (otIntTotal > 0) {
    const sample = await prisma.ordenTrabajoInterna.findMany({
      select: { id: true, ot: true, descripcion: true, fecha_creacion: true, activo: true },
      orderBy: { id: "asc" },
      take: 20,
    });
    console.log(`   Primeras ${sample.length}:`);
    for (const o of sample) {
      const fecha = o.fecha_creacion?.toISOString().slice(0, 10) ?? "—";
      const desc = (o.descripcion ?? "").slice(0, 40);
      console.log(`     id=${o.id}  ot=${o.ot}  ${fecha}  activo=${o.activo}  "${desc}"`);
    }
  }

  // Requerimientos
  const reqsTotal = await prisma.oTRepuesto.count();
  const reqsExt = await prisma.oTRepuesto.count({ where: { ot_id: { not: null } } });
  const reqsInt = await prisma.oTRepuesto.count({ where: { orden_trabajo_interna_id: { not: null } } });
  const reqsHuerfanos = await prisma.oTRepuesto.count({ where: { ot_id: null, orden_trabajo_interna_id: null } });
  console.log(`\n📦 REQUERIMIENTOS (OTRepuesto):`);
  console.log(`   Total: ${reqsTotal}`);
  console.log(`   - de OT externa: ${reqsExt}`);
  console.log(`   - de OT interna: ${reqsInt}`);
  console.log(`   - huérfanos:     ${reqsHuerfanos}`);

  const reqsPorStatus = await prisma.oTRepuesto.groupBy({
    by: ["status_requerimiento_codigo"],
    _count: { _all: true },
  });
  console.log(`   Por status_requerimiento_codigo:`);
  for (const r of reqsPorStatus) {
    console.log(`     ${r.status_requerimiento_codigo ?? "(null)"}: ${r._count._all}`);
  }

  // Compras
  const ocsTotal = await prisma.compra.count();
  const ocsPorStatus = await prisma.compra.groupBy({
    by: ["status_oc_codigo"],
    _count: { _all: true },
  });
  console.log(`\n🛒 ÓRDENES DE COMPRA:`);
  console.log(`   Total: ${ocsTotal}`);
  for (const r of ocsPorStatus) {
    console.log(`     ${r.status_oc_codigo ?? "(null)"}: ${r._count._all}`);
  }

  // Movimientos inventario
  const movs = await prisma.movimientoInventario.count();
  console.log(`\n📊 MOVIMIENTOS INVENTARIO: ${movs}`);

  // Historial OT
  const histTotal = await prisma.oTHistorial.count();
  console.log(`\n📜 HISTORIAL OT: ${histTotal}`);

  console.log("\n" + "=".repeat(60));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

// scripts/reset-pre-deploy.ts
// Borra datos de prueba (reqs, OCs, movimientos, OT internas) para presentar
// al cliente con una BD limpia. Las OT externas históricas (BDU) y los
// catálogos NO se tocan.
//
// Por defecto corre en modo DRY-RUN (solo cuenta). Para borrar de verdad:
//   npx tsx scripts/reset-pre-deploy.ts --apply
//
// Apunta a la BD del DATABASE_URL. Verificar que sea local antes de --apply.

import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "(sin DATABASE_URL)";
  const esLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log("=".repeat(64));
  console.log(`RESET PRE-DEPLOY ${APPLY ? "[APPLY]" : "[DRY-RUN]"}`);
  console.log(`DB: ${dbUrl.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`Local: ${esLocal ? "SÍ" : "NO (Railway u otro remoto)"}`);
  console.log("=".repeat(64));

  if (APPLY && !esLocal) {
    console.error("\n⛔ Negado: --apply contra BD remota. Apunta a localhost o usa otra ruta.\n");
    process.exit(2);
  }

  // ── Conteos antes ─────────────────────────────────────────────
  const [reqs, ocs, ocDetalles, movs, adjuntos, otHistorial, otInternas, otInternasReqs, otInternasHist, otInternasAdj] = await Promise.all([
    prisma.oTRepuesto.count(),
    prisma.compra.count(),
    prisma.compraDetalle.count(),
    prisma.movimientoInventario.count(),
    prisma.oTRepuestoAdjunto.count(),
    prisma.oTHistorial.count(),
    prisma.ordenTrabajoInterna.count(),
    prisma.oTRepuesto.count({ where: { orden_trabajo_interna_id: { not: null } } }),
    prisma.oTHistorial.count({ where: { orden_trabajo_interna_id: { not: null } } }),
    prisma.otAdjunto.count({ where: { orden_trabajo_interna_id: { not: null } } }),
  ]);

  console.log("\nA borrar:");
  console.log(`   Requerimientos (todos):                 ${reqs}`);
  console.log(`   OT Repuesto Adjuntos:                   ${adjuntos}`);
  console.log(`   Compras (OCs):                          ${ocs}`);
  console.log(`   Compra detalles:                        ${ocDetalles}`);
  console.log(`   Movimientos inventario:                 ${movs}`);
  console.log(`   OT internas (todas — se reinicia OI):   ${otInternas}`);
  console.log(`     ├─ Sus requerimientos: ${otInternasReqs}`);
  console.log(`     ├─ Su historial:       ${otInternasHist}`);
  console.log(`     └─ Sus adjuntos:       ${otInternasAdj}`);
  console.log(`   OT Historial (entradas de creación de reqs/OCs huérfanas): se conservan las de OT externas`);
  void otHistorial;

  console.log("\nSe MANTIENE:");
  console.log("   OT externas (REP/BIE/SER) + adjuntos + historial");
  console.log("   Catálogos (clientes, proveedores, materiales, etc.)");
  console.log("   Usuarios, trabajadores, configuración");

  if (!APPLY) {
    console.log("\n(DRY-RUN — no se borró nada. Re-ejecutar con --apply para aplicar.)");
    await prisma.$disconnect();
    return;
  }

  console.log("\n🔥 Aplicando...");
  await prisma.$transaction(async (tx) => {
    // 1. OT Repuesto Adjuntos (FK → OTRepuesto)
    await tx.oTRepuestoAdjunto.deleteMany({});
    console.log("   ✓ OT Repuesto Adjuntos borrados");

    // 2. Movimientos inventario (FK → Material) — borra todo histórico de stock
    await tx.movimientoInventario.deleteMany({});
    console.log("   ✓ Movimientos inventario borrados");

    // 3. Compra detalles (FK → Compra)
    await tx.compraDetalle.deleteMany({});
    console.log("   ✓ Compra detalles borrados");

    // 4. OT Repuestos (FK → Compra via po_id) — limpia primero el po_id
    //    para evitar FK constraint al borrar compras.
    await tx.oTRepuesto.updateMany({ data: { po_id: null } });
    await tx.oTRepuesto.deleteMany({});
    console.log("   ✓ Requerimientos borrados");

    // 5. Compras
    await tx.compra.deleteMany({});
    console.log("   ✓ Compras borradas");

    // 6. OT Internas — cascada borra sus adjuntos/historial/repuestos (los
    //    repuestos ya fueron borrados arriba, pero la cascada no se queja).
    await tx.ordenTrabajoInterna.deleteMany({});
    console.log("   ✓ OT internas borradas");

    // 7. Stock de materiales: lo reseteamos a 0 (los movimientos se fueron).
    await tx.material.updateMany({ data: { stock_actual: 0 } });
    console.log("   ✓ Stock de materiales reseteado a 0");
  });

  console.log("\n✅ Reset completado. Listo para deploy al cliente.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

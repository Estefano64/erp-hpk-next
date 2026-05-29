// scripts/delete-all-compras.ts
//
// ⚠️ DESTRUCTIVO. Borra TODAS las Compras (Órdenes de Compra) en Railway.
// Antes de borrar las Compras desvincula los OTRepuesto que apuntan a ellas
// (set po_id=null, status_oc_codigo=null, nro_oc=null, item_oc=null) — los
// OTRepuestos NO se borran, solo se desligan.
//
// Uso:
//   npx tsx scripts/delete-all-compras.ts            (DRY-RUN — muestra qué borraría)
//   npx tsx scripts/delete-all-compras.ts --apply    (ejecuta el borrado en transacción)

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}\n`);

  const compras = await prisma.compra.findMany({
    select: { id: true, numero_po: true, status_oc_codigo: true, total: true, moneda_codigo: true },
    orderBy: { id: "asc" },
  });
  console.log(`A borrar ${compras.length} compras:`);
  for (const c of compras) {
    console.log(`  • id=${c.id}  ${c.numero_po}  [${c.status_oc_codigo}]  ${c.moneda_codigo ?? ""} ${c.total}`);
  }

  const detalles = await prisma.compraDetalle.count();
  console.log(`\nCompraDetalle a borrar: ${detalles}`);

  const reps = await prisma.oTRepuesto.findMany({
    where: { po_id: { not: null } },
    select: { id: true, nro_req: true, po_id: true, nro_oc: true },
  });
  console.log(`OTRepuesto a desvincular: ${reps.length}`);
  for (const r of reps) {
    console.log(`  • id=${r.id}  nro_req=${r.nro_req}  → po_id=${r.po_id} (${r.nro_oc})`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/delete-all-compras.ts --apply`);
    return;
  }

  console.log(`\n🔴 Ejecutando borrado en transacción...`);
  await prisma.$transaction(async (tx) => {
    // 1. Desvincular OTRepuesto (po_id, nro_oc, item_oc, status_oc_codigo).
    const upd = await tx.oTRepuesto.updateMany({
      where: { po_id: { not: null } },
      data: { po_id: null, nro_oc: null, item_oc: null, status_oc_codigo: null },
    });
    console.log(`  ✓ ${upd.count} OTRepuesto desvinculados`);

    // 2. Borrar CompraDetalle.
    const det = await tx.compraDetalle.deleteMany({});
    console.log(`  ✓ ${det.count} CompraDetalle borrados`);

    // 3. Borrar Compras.
    const com = await tx.compra.deleteMany({});
    console.log(`  ✓ ${com.count} Compras borradas`);
  });

  // 4. Verificar.
  const restantes = await prisma.compra.count();
  const detRest = await prisma.compraDetalle.count();
  const repCon = await prisma.oTRepuesto.count({ where: { po_id: { not: null } } });
  console.log(`\n✅ Final: ${restantes} Compras, ${detRest} CompraDetalle, ${repCon} OTRepuestos con po_id`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

/**
 * Script de fix: vincula OTRepuestos existentes con Compras existentes.
 * Esto hace que el modal de "Items de la OC" se llene correctamente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔗 Vinculando OTRepuestos a Compras existentes...\n");

  // Obtener compras que NO tienen ot_repuestos vinculados
  const compras = await prisma.compra.findMany({
    where: { ot_id: { not: null } },
    include: { _count: { select: { ot_repuestos: true } } },
    orderBy: { id: "asc" },
  });

  let linkedTotal = 0;
  let comprasConItems = 0;

  for (const compra of compras) {
    if (compra._count.ot_repuestos > 0) continue; // ya tiene items

    // Buscar repuestos de la misma OT que aún no están en una PO
    const repuestosLibres = await prisma.oTRepuesto.findMany({
      where: { ot_id: compra.ot_id!, po_id: null },
      take: 5,
    });

    if (repuestosLibres.length === 0) continue;

    const ids = repuestosLibres.map((r) => r.id);
    await prisma.oTRepuesto.updateMany({
      where: { id: { in: ids } },
      data: {
        po_id: compra.id,
        nro_oc: compra.numero_po,
        fecha_oc: compra.fecha_solicitud,
        proveedor_id: compra.proveedor_id,
        status_oc_codigo: compra.status_oc_codigo,
      },
    });

    linkedTotal += repuestosLibres.length;
    comprasConItems++;
    console.log(`   ✓ Compra ${compra.numero_po}: vinculados ${repuestosLibres.length} repuestos`);
  }

  console.log(`\n✅ ${linkedTotal} OTRepuestos vinculados a ${comprasConItems} compras`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

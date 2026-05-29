// scripts/inspect-compras-borrado.ts
// SOLO LECTURA. Cuenta cuántas Compras hay en Railway y cuántos
// registros relacionados se verían afectados si las borramos.
// NO borra nada — solo reporta el blast radius.

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const total = await prisma.compra.count();
  console.log(`Total Compras: ${total}\n`);

  // Por estado.
  const porEstado = await prisma.compra.groupBy({
    by: ["status_oc_codigo"],
    _count: { _all: true },
  });
  console.log("Por status_oc_codigo:");
  porEstado.sort((a, b) => b._count._all - a._count._all).forEach((r) =>
    console.log(`  ${String(r._count._all).padStart(5)}  ${r.status_oc_codigo ?? "(null)"}`),
  );

  // Detalles directos.
  const detalles = await prisma.compraDetalle.count();
  console.log(`\nCompraDetalle (líneas de OC): ${detalles}`);

  // OT-repuestos vinculados a una OC (po_id != null).
  const repCon = await prisma.oTRepuesto.count({ where: { po_id: { not: null } } });
  const repTotal = await prisma.oTRepuesto.count();
  console.log(`OTRepuesto vinculados a una OC: ${repCon}/${repTotal}`);

  // Archivos R2 (guía/factura) que quedarían huérfanos.
  const conGuia = await prisma.compra.count({ where: { guia_key: { not: null } } });
  const conFact = await prisma.compra.count({ where: { factura_key: { not: null } } });
  console.log(`Compras con guía subida a R2: ${conGuia}`);
  console.log(`Compras con factura subida a R2: ${conFact}`);

  // Compras con OT asociada vs sueltas.
  const conOT = await prisma.compra.count({ where: { ot_id: { not: null } } });
  const sinOT = await prisma.compra.count({ where: { ot_id: null } });
  console.log(`\nCompras vinculadas a OT: ${conOT}`);
  console.log(`Compras "sueltas" (sin OT): ${sinOT}`);

  // Rango de fechas.
  const min = await prisma.compra.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true, numero_po: true } });
  const max = await prisma.compra.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, numero_po: true } });
  console.log(`\nPrimera OC creada: ${min?.createdAt.toISOString()} (${min?.numero_po})`);
  console.log(`Última OC creada:  ${max?.createdAt.toISOString()} (${max?.numero_po})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

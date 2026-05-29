import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  // Buscar los 7 proveedores del Excel (CAT, KOM, SEAL SOURCE, HERCULES, MEM, DYNAMIC, BC BEARING)
  const provs = await prisma.proveedor.findMany({
    select: { id: true, razon_social: true, nombre_comercial: true, ruc: true },
    orderBy: { razon_social: "asc" },
  });
  console.log(`Total proveedores en Railway: ${provs.length}\n`);

  const buscar = ["CAT", "CATERPILLAR", "KOM", "KOMATSU", "SEAL", "HERCULES", "MEM", "MACHEN", "DYNAMIC", "BC", "BEARING"];
  for (const term of buscar) {
    const hits = provs.filter(
      (p) =>
        p.razon_social?.toUpperCase().includes(term) ||
        p.nombre_comercial?.toUpperCase().includes(term),
    );
    if (hits.length > 0) {
      console.log(`🔍 "${term}":`);
      hits.forEach((h) =>
        console.log(`   id=${h.id} | RS="${h.razon_social}" | NC="${h.nombre_comercial}" | RUC=${h.ruc}`),
      );
    } else {
      console.log(`❌ "${term}": no match`);
    }
  }

  // Contar materiales con `np` (número de parte) — el campo de match.
  const conNp = await prisma.material.count({ where: { np: { not: null } } });
  const totalMat = await prisma.material.count();
  console.log(`\nMateriales con NP: ${conNp}/${totalMat}`);

  // Cotizaciones existentes
  const cotsActuales = await prisma.cotizacionProveedor.count();
  console.log(`Cotizaciones actuales: ${cotsActuales}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

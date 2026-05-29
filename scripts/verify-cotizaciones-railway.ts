import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const totalMat = await prisma.material.count();
  const nocat = await prisma.material.count({ where: { clasificacion_codigo: "NOCAT" } });
  const totalCot = await prisma.cotizacionProveedor.count();
  console.log(`Materiales totales:        ${totalMat}`);
  console.log(`Materiales NOCAT:          ${nocat}`);
  console.log(`Cotizaciones totales:      ${totalCot}`);

  const cotsPorProv = await prisma.cotizacionProveedor.groupBy({
    by: ["proveedor_id"],
    _count: { _all: true },
    orderBy: { _count: { proveedor_id: "desc" } },
  });
  console.log(`\n--- Cotizaciones por proveedor ---`);
  for (const c of cotsPorProv) {
    const p = await prisma.proveedor.findUnique({
      where: { id: c.proveedor_id },
      select: { razon_social: true, nombre_comercial: true, ruc: true },
    });
    console.log(`  id=${c.proveedor_id} | ${p?.nombre_comercial ?? p?.razon_social} (RUC ${p?.ruc}): ${c._count._all} cotizaciones`);
  }

  console.log(`\n--- Spot-checks (5 muestras) ---`);
  const samples = await prisma.cotizacionProveedor.findMany({
    take: 5,
    where: { observaciones: { contains: "cotizaciones.xlsx" } },
    include: {
      material: { select: { codigo: true, descripcion: true, np: true, clasificacion_codigo: true } },
      proveedor: { select: { nombre_comercial: true, razon_social: true } },
    },
    orderBy: { id: "desc" },
  });
  for (const s of samples) {
    console.log(`  Mat ${s.material.codigo} (${s.material.clasificacion_codigo}) NP=${s.material.np} | ${s.proveedor.nombre_comercial} | ${s.precio_unitario} ${s.moneda_codigo}`);
    console.log(`    "${s.material.descripcion}"`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

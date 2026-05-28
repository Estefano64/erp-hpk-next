import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";

const prisma = new PrismaClient({
  datasources: { db: { url: RAILWAY_URL } },
});

async function main() {
  const [plantas, areas, cats, clas, ums, fabs, monedas] = await Promise.all([
    prisma.planta.findMany({ select: { codigo: true, nombre: true } }),
    prisma.area.findMany({ select: { codigo: true, nombre: true } }),
    prisma.categoria.findMany({ select: { codigo: true, nombre: true } }),
    prisma.clasificacion.findMany({ select: { codigo: true, nombre: true } }),
    prisma.unidadMedida.findMany({ select: { codigo: true, nombre: true, abreviatura: true } }),
    prisma.fabricante.findMany({ select: { codigo: true, nombre: true } }),
    prisma.moneda.findMany({ select: { codigo: true } }),
  ]);
  console.log("PLANTAS:", JSON.stringify(plantas, null, 2));
  console.log("AREAS:", JSON.stringify(areas, null, 2));
  console.log("CATEGORIAS:", JSON.stringify(cats, null, 2));
  console.log("CLASIFICACIONES:", JSON.stringify(clas, null, 2));
  console.log("UMs:", JSON.stringify(ums, null, 2));
  console.log("FABRICANTES (top 30):", JSON.stringify(fabs.slice(0, 30), null, 2));
  console.log(`Total fabricantes: ${fabs.length}`);
  console.log("MONEDAS:", JSON.stringify(monedas, null, 2));

  const materiales = await prisma.material.count();
  console.log(`\nTotal materiales en DB: ${materiales}`);

  const ejemplo = await prisma.material.findFirst({
    select: {
      codigo: true,
      planta_codigo: true,
      area_codigo: true,
      categoria_codigo: true,
      clasificacion_codigo: true,
      unidad_medida_codigo: true,
    },
  });
  console.log("Ejemplo material:", ejemplo);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

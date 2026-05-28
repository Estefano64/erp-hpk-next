import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const totalAhora = await prisma.material.count();
  const nocat = await prisma.material.count({ where: { clasificacion_codigo: "NOCAT" } });
  const conStock = await prisma.material.count({ where: { stock_actual: { gt: 0 } } });
  const conPrecio = await prisma.material.count({ where: { precio: { gt: 0 } } });

  console.log(`Total materiales en Railway:    ${totalAhora}`);
  console.log(`Con clasificación NOCAT:        ${nocat}`);
  console.log(`Con stock_actual > 0:           ${conStock}`);
  console.log(`Con precio > 0:                 ${conPrecio}`);

  console.log("\n--- Muestras (codigos puntuales) ---");
  for (const codigo of ["000001", "000004", "000800", "000835", "000900", "001052"]) {
    const m = await prisma.material.findUnique({
      where: { codigo },
      select: {
        codigo: true, descripcion: true, stock_actual: true, punto_reposicion: true,
        stock_maximo: true, precio: true, moneda_codigo: true, clasificacion_codigo: true,
        np: true, fabricante_codigo: true, unidad_medida_codigo: true,
      },
    });
    console.log(JSON.stringify(m, null, 2));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const provs = await prisma.proveedor.findMany({
    select: { id: true, razon_social: true, nombre_comercial: true, ruc: true },
    orderBy: { id: "asc" },
  });
  console.log(JSON.stringify(provs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());

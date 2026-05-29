import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const total = await prisma.ordenTrabajo.count();
  const conPlaqueteo = await prisma.ordenTrabajo.count({ where: { plaqueteo: { not: null } } });
  const en19 = await prisma.ordenTrabajo.findMany({
    where: { ot: { not: null } },
    select: { ot: true },
  });
  const en19Count = en19.filter((o) => o.ot != null && o.ot % 100 === 19).length;
  console.log(`Total OTs:                          ${total}`);
  console.log(`Con plaqueteo:                      ${conPlaqueteo}`);
  console.log(`OTs ending in 19:                   ${en19Count}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

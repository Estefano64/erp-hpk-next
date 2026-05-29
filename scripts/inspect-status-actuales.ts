import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const total = await prisma.ordenTrabajo.count();
  console.log(`Total OTs en Railway: ${total}\n`);

  const otStatus = await prisma.ordenTrabajo.groupBy({
    by: ["ot_status_codigo"],
    _count: { _all: true },
  });
  console.log(`📋 ot_status_codigo:`);
  for (const r of otStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${String(r._count._all).padStart(5)}  ${r.ot_status_codigo ?? "(null)"}`);
  }

  const tallerStatus = await prisma.ordenTrabajo.groupBy({
    by: ["taller_status_codigo"],
    _count: { _all: true },
  });
  console.log(`\n📋 taller_status_codigo:`);
  for (const r of tallerStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${String(r._count._all).padStart(5)}  ${r.taller_status_codigo ?? "(null)"}`);
  }

  const recursosStatus = await prisma.ordenTrabajo.groupBy({
    by: ["recursos_status_codigo"],
    _count: { _all: true },
  });
  console.log(`\n📋 recursos_status_codigo:`);
  for (const r of recursosStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${String(r._count._all).padStart(5)}  ${r.recursos_status_codigo ?? "(null)"}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

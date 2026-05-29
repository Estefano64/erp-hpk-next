import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const [recursosStatus, otStatus, tallerStatus, tipoReparacion, garantia, tipoOt, atencionRep] = await Promise.all([
    prisma.recursosStatus.findMany({ select: { codigo: true, nombre: true } }),
    prisma.otStatus.findMany({ select: { codigo: true, nombre: true } }),
    prisma.tallerStatus.findMany({ select: { codigo: true, nombre: true } }),
    prisma.tipoReparacion.findMany({ select: { codigo: true, nombre: true } }),
    prisma.garantia.findMany({ select: { codigo: true, nombre: true } }),
    prisma.tipoOT.findMany({ select: { codigo: true, nombre: true } }),
    prisma.atencionReparacion.findMany({ select: { codigo: true, nombre: true } }),
  ]);
  const log = (label: string, rows: { codigo: string; nombre: string }[]) => {
    console.log(`\n📋 ${label}:`);
    rows.forEach((r) => console.log(`   ${r.codigo.padEnd(25)}  ${r.nombre}`));
  };
  log("RecursosStatus", recursosStatus);
  log("OtStatus", otStatus);
  log("TallerStatus", tallerStatus);
  log("TipoReparacion", tipoReparacion);
  log("Garantia", garantia);
  log("TipoOt", tipoOt);
  log("AtencionReparacion", atencionRep);
}
main().catch(console.error).finally(() => prisma.$disconnect());

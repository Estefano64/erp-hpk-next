import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const total = await prisma.ordenTrabajo.count();
  const tipoNull = await prisma.ordenTrabajo.count({ where: { tipo_codigo: null } });
  const recursosNull = await prisma.ordenTrabajo.count({ where: { recursos_status_codigo: null } });
  const garantiaNull = await prisma.ordenTrabajo.count({ where: { garantia_codigo: null } });
  const garantiaSi = await prisma.ordenTrabajo.count({ where: { garantia_codigo: "Si" } });
  const usuarioNull = await prisma.ordenTrabajo.count({ where: { usuario_crea: null } });
  const flotaGuion = await prisma.ordenTrabajo.count({ where: { cod_rep_flota: "-" } });
  const conFlotaValida = await prisma.ordenTrabajo.count({
    where: { AND: [{ cod_rep_flota: { not: null } }, { NOT: { cod_rep_flota: "-" } }] },
  });
  console.log(`✅ Estado post-cleanup en Railway:`);
  console.log(`   Total OTs:                             ${total}`);
  console.log(`   tipo_codigo = null:                    ${tipoNull}`);
  console.log(`   recursos_status_codigo = null:         ${recursosNull}`);
  console.log(`   garantia_codigo = null (vacío):        ${garantiaNull}`);
  console.log(`   garantia_codigo = "Si" (del Excel):    ${garantiaSi}`);
  console.log(`   usuario_crea = null:                   ${usuarioNull}`);
  console.log(`   cod_rep_flota = "-" (basura):          ${flotaGuion}`);
  console.log(`   cod_rep_flota con valor real:          ${conFlotaValida}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

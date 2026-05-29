import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const total = await prisma.ordenTrabajo.count();
  const conPo = await prisma.ordenTrabajo.count({ where: { po_cliente: { not: null } } });
  const conWo = await prisma.ordenTrabajo.count({ where: { wo_cliente: { not: null } } });
  const conRecursos = await prisma.ordenTrabajo.count({ where: { recursos_status_codigo: { not: null } } });
  const conGarantia = await prisma.ordenTrabajo.count({ where: { garantia_codigo: { not: null } } });
  const garantiaSi = await prisma.ordenTrabajo.count({ where: { garantia_codigo: "Si" } });
  const garantiaNo = await prisma.ordenTrabajo.count({ where: { garantia_codigo: "No" } });

  const camposBorrados = [
    "fecha_evaluacion", "evaluador", "nro_informe_evaluacion",
    "fecha_cotizacion", "nro_cotizacion",
    "fecha_aprobacion", "fecha_entrega", "cumplimiento",
    "nro_factura", "fecha_facturacion", "dias_en_taller",
    "ns", "plaqueteo", "base_metalica_codigo",
  ];

  console.log(`✅ Estado FINAL en Railway:\n`);
  console.log(`   Total OTs:                             ${total}\n`);
  console.log(`   ── Campos que DEBEN tener datos (de BDU) ──`);
  console.log(`   po_cliente:                            ${conPo} OTs (BDU lo tiene en 94%)`);
  console.log(`   wo_cliente:                            ${conWo} OTs (BDU lo tiene en 88%)`);
  console.log(`   recursos_status_codigo:                ${conRecursos} OTs (BDU 100%)`);
  console.log(`   garantia_codigo:                       ${conGarantia} OTs (BDU 100%)`);
  console.log(`     ├ "Si":                              ${garantiaSi}`);
  console.log(`     └ "No":                              ${garantiaNo}\n`);

  console.log(`   ── Campos que DEBEN estar vacíos (no están en BDU) ──`);
  for (const k of camposBorrados) {
    const c = await prisma.ordenTrabajo.count({ where: { [k]: { not: null } } as never });
    const ok = c === 0 ? "✓" : `⚠ ${c} OTs todavía tienen dato (= OTs nuevas, no se tocaron)`;
    console.log(`   ${k.padEnd(35)} ${ok}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

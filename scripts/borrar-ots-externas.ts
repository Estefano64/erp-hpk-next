// Borra TODAS las OTs externas de Railway + dependientes + archivos físicos
// en Cloudflare R2.
//
// ⚠️ DESTRUCTIVO. No hay rollback excepto desde backup de Railway.
//
// Cascadas automáticas vía Prisma onDelete (no hace falta borrarlas a mano):
//   - OTRepuesto, OTRepuestoAdjunto
//   - OtAdjunto (rows BD; archivos R2 los borramos manualmente abajo)
//   - OTHistorial
//   - PlanificacionOT
//   - EvaluacionTecnica
//
// PrestamoHerramienta: tiene onDelete SetNull (queda con ot_id=null, no se borra).
// Compra: tiene onDelete Restrict (bloquea si hay compras → validamos antes).
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/borrar-ots-externas.ts            # dry-run
//   DATABASE_URL="..." npx tsx scripts/borrar-ots-externas.ts --apply
import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Cliente R2 (mismo patrón que src/lib/r2.ts pero inline para el script).
function getR2(): { client: S3Client; bucket: string } {
  const bucket = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Faltan variables R2_* en el entorno. Asegurate que .env tenga R2_BUCKET_NAME, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  }
  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY (destructivo)" : "🟡 DRY-RUN"}`);

  // ── 1. Validar que no haya compras bloqueantes ───────────────────────
  const compras = await prisma.compra.count({
    where: { ot_id: { not: null } },
  });
  if (compras > 0) {
    console.error(`\n❌ Hay ${compras} Compra(s) con ot_id != null. La FK es Restrict y bloquea el delete.`);
    console.error("   Resolvé las compras antes (borralas o desvinculá su ot_id).");
    return;
  }

  // ── 2. Contar lo que se va a afectar ─────────────────────────────────
  const totalOTs = await prisma.ordenTrabajo.count();
  console.log(`\nOTs externas a borrar: ${totalOTs}`);

  if (totalOTs === 0) {
    console.log("Nada para borrar.");
    return;
  }

  // ── 3. Recolectar TODAS las r2_key vinculadas ────────────────────────
  // OtAdjunto vinculados a OTs externas
  const otAdjuntos = await prisma.otAdjunto.findMany({
    where: { orden_trabajo_id: { not: null } },
    select: { id: true, r2_key: true, nombre_archivo: true },
  });
  // OTRepuestoAdjunto cuyos OTRepuesto son de OT externa
  const reqAdjuntos = await prisma.oTRepuestoAdjunto.findMany({
    where: { ot_repuesto: { ot_id: { not: null } } },
    select: { id: true, r2_key: true, nombre_archivo: true },
  });
  // EvaluacionTecnica con informe_key (todas son de OT externa)
  const evals = await prisma.evaluacionTecnica.findMany({
    where: { informe_key: { not: null } },
    select: { id: true, informe_key: true },
  });

  const r2Keys: string[] = [
    ...otAdjuntos.map((a) => a.r2_key),
    ...reqAdjuntos.map((a) => a.r2_key),
    ...evals.map((e) => e.informe_key!).filter(Boolean),
  ];

  console.log(`\n📁 Archivos en Cloudflare R2 a borrar: ${r2Keys.length}`);
  console.log(`   - OtAdjunto (etapas OT):     ${otAdjuntos.length}`);
  console.log(`   - OTRepuestoAdjunto (reqs):  ${reqAdjuntos.length}`);
  console.log(`   - EvaluacionTecnica informe: ${evals.length}`);

  if (r2Keys.length > 0 && r2Keys.length <= 10) {
    console.log(`\nKeys que se borrarían de R2:`);
    for (const k of r2Keys) console.log(`  ${k}`);
  } else if (r2Keys.length > 10) {
    console.log(`\nPrimeras 5 keys de R2:`);
    for (const k of r2Keys.slice(0, 5)) console.log(`  ${k}`);
    console.log(`  ... y ${r2Keys.length - 5} más`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN: no se aplicó nada. Para aplicar, corré con --apply`);
    return;
  }

  // ── 4. Borrar archivos R2 primero ─────────────────────────────────────
  console.log(`\n🔴 Borrando ${r2Keys.length} archivos de R2...`);
  const { client, bucket } = getR2();
  let r2Ok = 0;
  let r2Err = 0;
  for (const key of r2Keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      r2Ok++;
    } catch (e) {
      r2Err++;
      console.error(`  ✗ R2 delete ${key}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`  R2 borrados: ${r2Ok}, errores: ${r2Err}`);

  // ── 5. Borrar OTs (cascade limpia los hijos) ─────────────────────────
  console.log(`\n🔴 Borrando ${totalOTs} OTs externas (con cascade)...`);
  const deleted = await prisma.ordenTrabajo.deleteMany();
  console.log(`  ✓ ${deleted.count} OTs borradas (y todas sus dependencias por cascade).`);

  // ── 6. Verificación final ─────────────────────────────────────────────
  const remainingOTs = await prisma.ordenTrabajo.count();
  const remainingRepuestos = await prisma.oTRepuesto.count({ where: { ot_id: { not: null } } });
  const remainingAdjuntos = await prisma.otAdjunto.count({ where: { orden_trabajo_id: { not: null } } });
  console.log(`\n✓ Verificación post-cleanup:`);
  console.log(`  - OTs externas restantes:                ${remainingOTs}`);
  console.log(`  - OTRepuesto con ot_id (externos):       ${remainingRepuestos}`);
  console.log(`  - OtAdjunto vinculado a OT externa:      ${remainingAdjuntos}`);

  // OT internas siguen ahí (no se tocaron).
  const internas = await prisma.ordenTrabajoInterna.count();
  console.log(`  - OTs internas (no tocadas):             ${internas}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

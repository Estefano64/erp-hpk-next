// scripts/reset-ots-railway.ts
//
// Borra TODAS las OTs (externas + internas) de Railway junto con sus archivos
// en Cloudflare R2. NO toca: compras sin OT, catálogos maestros, usuarios.
//
// Uso:
//   DRY_RUN=1 npx tsx scripts/reset-ots-railway.ts   → solo plan, sin borrar
//   npx tsx scripts/reset-ots-railway.ts             → ejecuta de verdad
//
// Orden:
//   1. Recolecta r2_key de ot_adjunto + ot_repuesto_adjunto + compra (guia/factura
//      donde ot_id != null) + evaluacion_tecnica (informe_key).
//   2. Borra esos objects de R2 (best-effort, log de fallos).
//   3. Borra orden_trabajo_interna → cascade limpia adjuntos/historial.
//   4. Borra orden_trabajo → cascade limpia tareas/repuestos/adjuntos/historial/eval.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const DRY_RUN = process.env.DRY_RUN === "1";

const dbUrl = process.env.RAILWAY_DATABASE_URL;
if (!dbUrl) {
  console.error("Falta RAILWAY_DATABASE_URL en .env");
  process.exit(1);
}

const R2_BUCKET = process.env.R2_BUCKET_NAME!;
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function deleteR2(key: string): Promise<boolean> {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    console.warn(`  ⚠ no se pudo borrar de R2: ${key} — ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  console.log(`Target: railway${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  // 1. Recolectar todos los r2_key vinculados a OTs.
  const adjOT = await prisma.otAdjunto.findMany({ select: { r2_key: true } });
  const adjReq = await prisma.oTRepuestoAdjunto.findMany({ select: { r2_key: true } });
  const evals = await prisma.evaluacionTecnica.findMany({
    where: { informe_key: { not: null } },
    select: { informe_key: true },
  });
  const comprasOT = await prisma.compra.findMany({
    where: { ot_id: { not: null } },
    select: { guia_key: true, factura_key: true },
  });

  const r2Keys = [
    ...adjOT.map((a) => a.r2_key),
    ...adjReq.map((a) => a.r2_key),
    ...evals.map((e) => e.informe_key).filter((k): k is string => !!k),
    ...comprasOT.flatMap((c) => [c.guia_key, c.factura_key].filter((k): k is string => !!k)),
  ];

  console.log(`Archivos en R2 a borrar: ${r2Keys.length}`);
  for (const k of r2Keys) console.log(`  - ${k}`);

  // 2. Conteo de filas BD antes de borrar.
  const [otExt, otInt] = await Promise.all([
    prisma.ordenTrabajo.count(),
    prisma.ordenTrabajoInterna.count(),
  ]);
  console.log(`\nOTs externas a borrar: ${otExt}`);
  console.log(`OTs internas a borrar: ${otInt}`);
  console.log(`(cascade limpia automáticamente: planificacion, ot_repuesto, ot_adjunto, ot_historial, evaluacion_tecnica)`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no se borra nada.");
    await prisma.$disconnect();
    return;
  }

  // 3. Borrar R2 first (best-effort, no abortamos si falla alguno).
  console.log("\nBorrando archivos de R2…");
  let okR2 = 0;
  let failR2 = 0;
  for (const k of r2Keys) {
    const ok = await deleteR2(k);
    if (ok) okR2++; else failR2++;
  }
  console.log(`  R2: ${okR2} borrados, ${failR2} fallidos.`);

  // 4. Borrar BD. Internas primero (no hay dependencias inversas), después externas.
  console.log("\nBorrando OTs internas…");
  const delInt = await prisma.ordenTrabajoInterna.deleteMany();
  console.log(`  ${delInt.count} OTs internas borradas.`);

  console.log("\nBorrando OTs externas…");
  const delExt = await prisma.ordenTrabajo.deleteMany();
  console.log(`  ${delExt.count} OTs externas borradas.`);

  // 5. Resumen final.
  const finales = {
    ordenTrabajo: await prisma.ordenTrabajo.count(),
    ordenTrabajoInterna: await prisma.ordenTrabajoInterna.count(),
    planificacionOT: await prisma.planificacionOT.count(),
    otRepuesto: await prisma.oTRepuesto.count(),
    otAdjunto: await prisma.otAdjunto.count(),
    otHistorial: await prisma.oTHistorial.count(),
    evaluacionTecnica: await prisma.evaluacionTecnica.count(),
  };
  console.log("\n=== Estado final ===");
  console.log(JSON.stringify(finales, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

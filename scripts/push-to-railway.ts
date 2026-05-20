// scripts/push-to-railway.ts
//
// ⚠️  DESTRUCTIVO en Railway: vacía la BD remota y la reemplaza con los datos
// de tu BD local. Útil cuando trabajaste local con datos de prueba y querés
// reflejarlos en producción.
//
// Uso:
//   npx tsx scripts/push-to-railway.ts
//
// Requiere en .env:
//   DATABASE_URL          → BD local (debe ser localhost por seguridad)
//   RAILWAY_DATABASE_URL  → DATABASE_PUBLIC_URL del Postgres de Railway

import "dotenv/config";
import { spawnSync } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const PGBIN = process.env.PGBIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const PG_DUMP = join(PGBIN, "pg_dump.exe");
const PSQL = join(PGBIN, "psql.exe");

function cleanUrl(url: string): string {
  return url.replace(/\?.*$/, "");
}

async function conteosCon(url: string) {
  const prisma = new PrismaClient({ datasourceUrl: cleanUrl(url) });
  try {
    const rows = await prisma.$queryRawUnsafe<{ relname: string; n_live_tup: bigint }[]>(`
      SELECT relname, n_live_tup
      FROM pg_stat_user_tables
      WHERE schemaname='public' AND n_live_tup > 0
      ORDER BY n_live_tup DESC
      LIMIT 15
    `);
    return rows.map((r) => ({ tabla: r.relname, filas: Number(r.n_live_tup) }));
  } finally {
    await prisma.$disconnect();
  }
}

async function truncateTodoEnRemoto(url: string) {
  const prisma = new PrismaClient({ datasourceUrl: cleanUrl(url) });
  try {
    await prisma.$executeRawUnsafe(`
      DO $do$
      DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END
      $do$;
    `);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const local = process.env.DATABASE_URL;
  const remote = process.env.RAILWAY_DATABASE_URL;

  if (!local) throw new Error("DATABASE_URL no configurado en .env");
  if (!remote) throw new Error("RAILWAY_DATABASE_URL no configurado en .env");

  // Safety: el ORIGEN debe ser localhost para evitar copiar prod sobre prod por error.
  if (!/localhost|127\.0\.0\.1/i.test(local)) {
    throw new Error(`DATABASE_URL no apunta a localhost. Abortando por seguridad. (origen: ${local})`);
  }
  // Safety extra: el destino (Railway) no puede ser localhost.
  if (/localhost|127\.0\.0\.1/i.test(remote)) {
    throw new Error(`RAILWAY_DATABASE_URL apunta a localhost — eso no es Railway. Abortando.`);
  }

  const mask = (url: string) => url.replace(/:[^:@/]+@/, ":****@");
  console.log(`Origen (LOCAL):    ${mask(local)}`);
  console.log(`Destino (RAILWAY): ${mask(remote)}`);
  console.log("");

  console.log("Conteos REMOTOS (Railway) antes:");
  console.table(await conteosCon(remote));

  const tmpFile = join(tmpdir(), `local-push-${Date.now()}.sql`);

  console.log("\n[1/3] pg_dump desde local...");
  const dump = spawnSync(
    PG_DUMP,
    [
      cleanUrl(local),
      "--data-only",
      "--disable-triggers",
      "--no-owner",
      "--no-acl",
      "--exclude-table=_prisma_migrations",
      "-f", tmpFile,
    ],
    { stdio: "inherit" },
  );
  if (dump.status !== 0) {
    throw new Error(`pg_dump falló (exit ${dump.status})`);
  }

  console.log("\n[2/3] Vaciando tablas REMOTAS (Railway) — excepto _prisma_migrations...");
  await truncateTodoEnRemoto(remote);

  console.log("\n[3/3] Aplicando dump a Railway...");
  const restore = spawnSync(
    PSQL,
    [cleanUrl(remote), "-v", "ON_ERROR_STOP=1", "-f", tmpFile],
    { stdio: "inherit" },
  );
  if (restore.status !== 0) {
    throw new Error(`psql restore falló (exit ${restore.status}). El dump quedó en ${tmpFile}`);
  }

  try { unlinkSync(tmpFile); } catch { /* no-op */ }

  console.log("\nConteos REMOTOS (Railway) después:");
  console.table(await conteosCon(remote));

  console.log("\n✓ Push completo. Railway ahora refleja los datos locales.");
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

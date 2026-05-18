// scripts/pull-from-railway.ts
//
// Sincroniza la BD local con los datos de Railway (producción).
//
// Uso:
//   npx tsx scripts/pull-from-railway.ts
//
// Requiere en .env:
//   DATABASE_URL          → BD local (debe ser localhost por seguridad)
//   RAILWAY_DATABASE_URL  → DATABASE_PUBLIC_URL del Postgres de Railway
//
// Qué hace:
//   1. pg_dump de Railway (--data-only, excluye _prisma_migrations)
//   2. TRUNCATE de todas las tablas locales (excepto _prisma_migrations)
//   3. psql import del dump a local
//
// Asume Postgres 18 instalado en Windows en la ruta default.
// Override con: PGBIN="C:\\ruta\\custom\\bin" npx tsx scripts/pull-from-railway.ts

import "dotenv/config";
import { spawnSync } from "child_process";
import { unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { prisma } from "../src/lib/prisma";

const PGBIN = process.env.PGBIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const PG_DUMP = join(PGBIN, "pg_dump.exe");
const PSQL = join(PGBIN, "psql.exe");

// psql rechaza parámetros desconocidos como ?schema=public (Prisma-specific). Los limpiamos.
function cleanUrl(url: string): string {
  return url.replace(/\?.*$/, "");
}

async function main() {
  const local = process.env.DATABASE_URL;
  const remote = process.env.RAILWAY_DATABASE_URL;

  if (!local) throw new Error("DATABASE_URL no configurado en .env");
  if (!remote) throw new Error("RAILWAY_DATABASE_URL no configurado en .env");

  // Safety: solo aceptamos localhost como destino — nunca sobreescribir una BD remota por accidente.
  if (!/localhost|127\.0\.0\.1/i.test(local)) {
    throw new Error(`DATABASE_URL no apunta a localhost (es ${local}). Abortando por seguridad.`);
  }

  const mask = (url: string) => url.replace(/:[^:@/]+@/, ":****@");
  console.log(`Origen (Railway): ${mask(remote)}`);
  console.log(`Destino (local):  ${mask(local)}`);
  console.log("");

  // Conteos previos (para que veas la diferencia)
  const before = await tablasYConteos();
  console.log("Conteos LOCALES antes:");
  console.table(before);

  const tmpFile = join(tmpdir(), `railway-pull-${Date.now()}.sql`);

  console.log("\n[1/3] pg_dump desde Railway...");
  const dump = spawnSync(
    PG_DUMP,
    [
      cleanUrl(remote),
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
    throw new Error(`pg_dump falló (exit ${dump.status}). Verificá que ${PG_DUMP} exista.`);
  }

  console.log("\n[2/3] Vaciando tablas locales (excepto _prisma_migrations)...");
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

  console.log("\n[3/3] Aplicando dump a local...");
  const restore = spawnSync(
    PSQL,
    [cleanUrl(local), "-v", "ON_ERROR_STOP=1", "-f", tmpFile],
    { stdio: "inherit" },
  );
  if (restore.status !== 0) {
    throw new Error(`psql restore falló (exit ${restore.status}). El dump quedó en ${tmpFile} si querés inspeccionar.`);
  }

  try { unlinkSync(tmpFile); } catch { /* no-op */ }

  const after = await tablasYConteos();
  console.log("\nConteos LOCALES después:");
  console.table(after);

  console.log("\n✓ Pull completo.");
}

async function tablasYConteos() {
  const rows = await prisma.$queryRawUnsafe<{ relname: string; n_live_tup: bigint }[]>(`
    SELECT relname, n_live_tup
    FROM pg_stat_user_tables
    WHERE schemaname='public' AND n_live_tup > 0
    ORDER BY n_live_tup DESC
    LIMIT 15
  `);
  return rows.map((r) => ({ tabla: r.relname, filas: Number(r.n_live_tup) }));
}

main()
  .catch((e) => { console.error("ERROR:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());

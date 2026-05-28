// Read-only: verifica el backfill multi-rol en la BD de Railway.
// Uso: npx tsx scripts/verify-roles.ts
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Lee RAILWAY_DATABASE_URL del .env sin depender de dotenv.
const env = readFileSync(".env", "utf8");
const m = env.match(/^RAILWAY_DATABASE_URL=(.+)$/m);
if (!m) { console.error("No hay RAILWAY_DATABASE_URL en .env"); process.exit(1); }
const url = m[1].trim().replace(/^["']|["']$/g, "");

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nombre: true, roles: true, activo: true },
    orderBy: { id: "asc" },
  });

  console.log(`\n=== ${usuarios.length} cuentas en Railway ===\n`);
  for (const u of usuarios) {
    const rolesTxt = u.roles.length ? u.roles.join(", ") : "(sin roles)";
    console.log(`#${String(u.id).padStart(3)} ${u.activo ? " " : "✗"} ${u.nombre.padEnd(28)} [${rolesTxt}]`);
  }

  // Distribución por rol
  const dist: Record<string, number> = {};
  let sinRoles = 0;
  for (const u of usuarios) {
    if (!u.roles.length) sinRoles++;
    for (const r of u.roles) dist[r] = (dist[r] ?? 0) + 1;
  }
  console.log("\n=== Distribución por rol ===");
  for (const [r, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(24)} ${n}`);
  }
  if (sinRoles) console.log(`  ⚠️  ${sinRoles} cuenta(s) SIN roles`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

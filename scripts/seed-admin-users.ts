// scripts/seed-admin-users.ts
//
// Crea / actualiza los usuarios admin del ERP.
//
// Uso:
//   npx tsx scripts/seed-admin-users.ts                  → contra DB local (DATABASE_URL)
//   TARGET=railway npx tsx scripts/seed-admin-users.ts   → contra Railway (RAILWAY_DATABASE_URL)
//   DRY_RUN=1 ... → solo muestra el plan, no escribe
//
// Idempotente: usa upsert por codigoEmpleado. Si el usuario ya existe, se
// sobrescriben rol/email/dni/password. Si no existe, lo crea.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const GENERIC_PASSWORD = "HPK2026";

const url =
  TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) {
  console.error(`Falta ${TARGET === "railway" ? "RAILWAY_DATABASE_URL" : "DATABASE_URL"} en .env`);
  process.exit(1);
}

interface AdminUser {
  // codigoEmpleado actual en la BD (para encontrar la fila existente). Si no
  // existe aún se usa también como código nuevo (caso CREATE).
  currentCodigo: string;
  // codigoEmpleado destino. Convención: el DNI es el codigoEmpleado. Los que
  // no tienen DNI conocido (Carlos Viña, Diego Jaime Monge) quedan "huérfanos
  // de código" → mantienen su USR-XXX y solo pueden loguear con email.
  newCodigo: string;
  nombre: string;
  email: string;
  dni: string | null;
}

const USERS: AdminUser[] = [
  { currentCodigo: "USR-001", newCodigo: "41375843", nombre: "Antonio Zumaeta Mendoza", email: "mantenimiento@hpkinv.com", dni: "41375843" },
  { currentCodigo: "USR-002", newCodigo: "USR-002", nombre: "Carlos Viña Miranda", email: "gerente.operaciones@hpkinv.com", dni: null },
  { currentCodigo: "USR-003", newCodigo: "USR-003", nombre: "Diego Jaime Monge", email: "compras@hpkinv.com", dni: null },
  { currentCodigo: "USR-004", newCodigo: "71502466", nombre: "Juan Diego Muñoz Manrique", email: "operaciones@hpkinv.com", dni: "71502466" },
  { currentCodigo: "USR-005", newCodigo: "77687152", nombre: "Miriam Ccanahuire", email: "logistica@hpkinv.com", dni: "77687152" },
  { currentCodigo: "73116071", newCodigo: "73116071", nombre: "Juan Vera Canales", email: "planeamiento@hpkinv.com", dni: "73116071" },
  { currentCodigo: "41916808", newCodigo: "41916808", nombre: "Luis Huerta Cornejo", email: "superv.taller@hpkinv.com", dni: "41916808" },
];

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN — sin escritura)" : ""}`);
  const hashed = await bcrypt.hash(GENERIC_PASSWORD, 10);

  // Pre-fetch del estado actual para reportar qué se actualiza vs crea.
  const todosCodigos = [...new Set(USERS.flatMap((u) => [u.currentCodigo, u.newCodigo]))];
  const existentes = await prisma.usuario.findMany({
    where: { codigoEmpleado: { in: todosCodigos } },
    select: { codigoEmpleado: true, email: true, rol: true, dni: true, nombre: true },
  });
  const existMap = new Map(existentes.map((e) => [e.codigoEmpleado, e]));

  for (const u of USERS) {
    const prev = existMap.get(u.currentCodigo);
    if (prev) {
      const codigoChange = u.currentCodigo !== u.newCodigo ? `\n  codigoEmpleado: ${u.currentCodigo} → ${u.newCodigo}` : "";
      console.log(
        `[UPDATE] ${u.currentCodigo} ${u.nombre}${codigoChange}`,
        `\n  rol: ${prev.rol} → admin`,
        `\n  email: ${prev.email ?? "(null)"} → ${u.email}`,
        `\n  dni: ${prev.dni ?? "(null)"} → ${u.dni ?? "(sin cambio)"}`,
        `\n  password: reset a "${GENERIC_PASSWORD}"`,
      );
    } else {
      console.log(
        `[CREATE] ${u.newCodigo} ${u.nombre}`,
        `\n  email=${u.email} dni=${u.dni ?? "(null)"} rol=admin password="${GENERIC_PASSWORD}"`,
      );
    }
    if (DRY_RUN) continue;

    if (prev) {
      // UPDATE: buscamos por el codigoEmpleado actual y reescribimos todo
      // (incluyendo el codigoEmpleado nuevo si difiere).
      await prisma.usuario.update({
        where: { codigoEmpleado: u.currentCodigo },
        data: {
          codigoEmpleado: u.newCodigo,
          nombre: u.nombre,
          email: u.email,
          dni: u.dni,
          rol: "admin",
          password: hashed,
          activo: true,
        },
      });
    } else {
      await prisma.usuario.create({
        data: {
          codigoEmpleado: u.newCodigo,
          nombre: u.nombre,
          email: u.email,
          dni: u.dni,
          rol: "admin",
          password: hashed,
          activo: true,
        },
      });
    }
  }

  // Resumen final.
  const final = await prisma.usuario.findMany({
    select: { codigoEmpleado: true, email: true, dni: true, nombre: true, rol: true, activo: true },
    orderBy: { codigoEmpleado: "asc" },
  });
  console.log("\n=== usuarios después de correr el seed ===");
  for (const u of final) {
    console.log(`  ${u.codigoEmpleado.padEnd(8)} ${u.rol.padEnd(12)} ${u.dni ?? "-".padEnd(10)}  ${u.email ?? "-"}  (${u.nombre})`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

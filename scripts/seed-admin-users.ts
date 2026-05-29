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
  // Primera tanda (ya creados en seed previo). currentCodigo = el actual en BD.
  { currentCodigo: "41375843", newCodigo: "41375843", nombre: "Antonio Zumaeta Mendoza", email: "mantenimiento@hpkinv.com", dni: "41375843" },
  { currentCodigo: "USR-002", newCodigo: "USR-002", nombre: "Carlos Viña Miranda", email: "gerente.operaciones@hpkinv.com", dni: null },
  { currentCodigo: "USR-003", newCodigo: "USR-003", nombre: "Diego Jaime Monge", email: "compras@hpkinv.com", dni: null },
  { currentCodigo: "71502466", newCodigo: "71502466", nombre: "Juan Diego Muñoz Manrique", email: "operaciones@hpkinv.com", dni: "71502466" },
  { currentCodigo: "77687152", newCodigo: "77687152", nombre: "Miriam Ccanahuire", email: "logistica@hpkinv.com", dni: "77687152" },
  { currentCodigo: "73116071", newCodigo: "73116071", nombre: "Juan Vera Canales", email: "planeamiento@hpkinv.com", dni: "73116071" },
  { currentCodigo: "41916808", newCodigo: "41916808", nombre: "Luis Huerta Cornejo", email: "superv.taller@hpkinv.com", dni: "41916808" },
  // Segunda tanda — resto del Excel "Usuarios de HPyK". SALA DE REUNIONES se
  // omite (no es persona). Los que no tienen DNI cargado quedan con USR-XXX y
  // solo pueden loguear por email.
  { currentCodigo: "USR-008", newCodigo: "USR-008", nombre: "Angelo Mattos", email: "asist.log-mant@hpkinv.com", dni: null },
  { currentCodigo: "USR-009", newCodigo: "USR-009", nombre: "Area Facturacion", email: "facturacion@hpkinv.com", dni: null },
  { currentCodigo: "USR-010", newCodigo: "USR-010", nombre: "Cuenta Prueba", email: "prueba1@hpkinv.com", dni: null },
  { currentCodigo: "USR-011", newCodigo: "USR-011", nombre: "Cuenta Administrador", email: "adminweb@hpkinv.com", dni: null },
  { currentCodigo: "USR-012", newCodigo: "USR-012", nombre: "Isaac Foraquita", email: "asist.contabilidad@hpkinv.com", dni: null },
  { currentCodigo: "29722406", newCodigo: "29722406", nombre: "Jose Tapia", email: "seguridad@hpkinv.com", dni: "29722406" },
  { currentCodigo: "USR-013", newCodigo: "USR-013", nombre: "Pio Serpa", email: "pserpa@hpkinv.com", dni: null },
  { currentCodigo: "USR-014", newCodigo: "USR-014", nombre: "Rodrigo Huamani", email: "produccion@hpkinv.com", dni: null },
  { currentCodigo: "USR-015", newCodigo: "USR-015", nombre: "Ventas HPK", email: "ventas@hpkinv.com", dni: null },
  { currentCodigo: "USR-016", newCodigo: "USR-016", nombre: "Victor Barreto", email: "contabilidad@hpkinv.com", dni: null },
];

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN — sin escritura)" : ""}`);
  const hashed = await bcrypt.hash(GENERIC_PASSWORD, 10);

  // Pre-fetch del estado actual para reportar qué se actualiza vs crea.
  const todosCodigos = [...new Set(USERS.flatMap((u) => [u.currentCodigo, u.newCodigo]))];
  const existentes = await prisma.usuario.findMany({
    where: { codigoEmpleado: { in: todosCodigos } },
    select: { codigoEmpleado: true, email: true, roles: true, dni: true, nombre: true },
  });
  const existMap = new Map(existentes.map((e) => [e.codigoEmpleado, e]));

  for (const u of USERS) {
    const prev = existMap.get(u.currentCodigo);
    if (prev) {
      const codigoChange = u.currentCodigo !== u.newCodigo ? `\n  codigoEmpleado: ${u.currentCodigo} → ${u.newCodigo}` : "";
      console.log(
        `[UPDATE] ${u.currentCodigo} ${u.nombre}${codigoChange}`,
        `\n  roles: [${prev.roles.join(",")}] → [admin]`,
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
          roles: ["admin"],
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
          roles: ["admin"],
          password: hashed,
          activo: true,
        },
      });
    }
  }

  // Resumen final.
  const final = await prisma.usuario.findMany({
    select: { codigoEmpleado: true, email: true, dni: true, nombre: true, roles: true, activo: true },
    orderBy: { codigoEmpleado: "asc" },
  });
  console.log("\n=== usuarios después de correr el seed ===");
  for (const u of final) {
    console.log(`  ${u.codigoEmpleado.padEnd(8)} [${u.roles.join(",")}] ${u.dni ?? "-".padEnd(10)}  ${u.email ?? "-"}  (${u.nombre})`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

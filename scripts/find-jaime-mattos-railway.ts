// Busca registros con nombres parecidos a "JAIME" o "MATTOS" en Railway,
// incluyendo inactivos. También lista cualquier trabajador con puesto COMPRAS
// o ASISTENTE sin DNI, por si están bajo otro nombre.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.RAILWAY_DATABASE_URL;
if (!url) { console.error("Falta RAILWAY_DATABASE_URL"); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const jaimes = await prisma.trabajador.findMany({
    where: { nombre: { contains: "JAIME", mode: "insensitive" } },
  });
  const mattos = await prisma.trabajador.findMany({
    where: { nombre: { contains: "MATTOS", mode: "insensitive" } },
  });
  const sinDni = await prisma.trabajador.findMany({
    where: { dni: null },
    orderBy: { nombre: "asc" },
  });

  console.log("─── JAIME (cualquier estado) ───");
  for (const t of jaimes) {
    console.log(`#${t.trabajador_id} "${t.nombre}" DNI=${t.dni ?? "null"} area=${t.area ?? "null"} puesto=${t.puesto ?? "null"} activo=${t.activo}`);
  }
  console.log("\n─── MATTOS (cualquier estado) ───");
  for (const t of mattos) {
    console.log(`#${t.trabajador_id} "${t.nombre}" DNI=${t.dni ?? "null"} area=${t.area ?? "null"} puesto=${t.puesto ?? "null"} activo=${t.activo}`);
  }
  console.log("\n─── Trabajadores SIN DNI ───");
  for (const t of sinDni) {
    console.log(`#${t.trabajador_id} "${t.nombre}" area=${t.area ?? "null"} puesto=${t.puesto ?? "null"} activo=${t.activo}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// scripts/backfill-usuario-trabajador-link.ts
//
// Para cada usuario con DNI, busca el trabajador con el mismo DNI y los vincula.
// Idempotente: si ya hay vínculo, no toca.
//
//   DRY_RUN=1 npx tsx scripts/backfill-usuario-trabajador-link.ts
//   TARGET=railway npx tsx scripts/backfill-usuario-trabajador-link.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error(`Falta URL de ${TARGET}`); process.exit(1); }

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const usuarios = await prisma.usuario.findMany({
    where: { trabajadorId: null },
    select: { id: true, codigoEmpleado: true, dni: true, nombre: true },
  });
  console.log(`Usuarios sin vínculo: ${usuarios.length}`);

  let vinculados = 0, sinMatch = 0;
  for (const u of usuarios) {
    if (!u.dni) { sinMatch++; continue; }
    const t = await prisma.trabajador.findFirst({ where: { dni: u.dni } });
    if (!t) {
      console.log(`[NO MATCH] ${u.codigoEmpleado} "${u.nombre}" dni=${u.dni}`);
      sinMatch++;
      continue;
    }
    // ¿El trabajador ya está enlazado a otra cuenta?
    const dup = await prisma.usuario.findUnique({ where: { trabajadorId: t.trabajador_id } });
    if (dup) {
      console.log(`[SKIP] trabajador #${t.trabajador_id} ya vinculado a ${dup.codigoEmpleado}`);
      continue;
    }
    console.log(`[LINK] usuario ${u.codigoEmpleado} (${u.nombre}) ↔ trabajador #${t.trabajador_id} (${t.nombre})`);
    vinculados++;
    if (!DRY_RUN) {
      await prisma.usuario.update({
        where: { id: u.id },
        data: { trabajadorId: t.trabajador_id },
      });
    }
  }
  console.log(`\nResumen: ${vinculados} vinculados, ${sinMatch} sin match.`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

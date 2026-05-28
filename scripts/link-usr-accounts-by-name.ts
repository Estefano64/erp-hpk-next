// scripts/link-usr-accounts-by-name.ts
//
// Las cuentas con codigoEmpleado "USR-XXX" no tienen DNI cargado, así que el
// backfill por DNI no las enlazó. Hace un match por nombre normalizado contra
// trabajador, y si encuentra uno único, copia su DNI a la cuenta y la enlaza.
//
//   DRY_RUN=1 TARGET=railway npx tsx scripts/link-usr-accounts-by-name.ts
//   TARGET=railway npx tsx scripts/link-usr-accounts-by-name.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error(`Falta URL de ${TARGET}`); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });

// Normaliza: mayúsculas, sin comas, espacios colapsados, sin tildes.
function norm(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokens del nombre (palabras), sin importar orden. Permite matchear
// "Diego Jaime Monge" (orden usuario) contra "JAIME MONGE, DIEGO ANDREE" (BD).
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((t) => t.length > 1));
}

function score(a: Set<string>, b: Set<string>): number {
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits;
}

// Overrides manuales por nombre del usuario → DNI del trabajador a enlazar.
// Para casos donde el matching por tokens falla (variantes ortográficas como
// Isaac/Isaak). Se aplican antes del matching automático.
const OVERRIDES: Record<string, string> = {
  "Isaac Foraquita": "72925966", // → FORAQUITA LAURA ISAAK ANYHELO
};

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const usuarios = await prisma.usuario.findMany({
    where: { trabajadorId: null },
    select: { id: true, codigoEmpleado: true, dni: true, nombre: true },
  });
  const trabajadores = await prisma.trabajador.findMany({
    select: { trabajador_id: true, dni: true, nombre: true },
  });
  const trabByDni = new Map(trabajadores.filter((t) => t.dni).map((t) => [t.dni!, t]));

  let actualizados = 0, sinMatch = 0;
  for (const u of usuarios) {
    // 1) Override manual primero
    const overrideDni = OVERRIDES[u.nombre];
    if (overrideDni) {
      const trab = trabByDni.get(overrideDni);
      if (trab) {
        const dup = await prisma.usuario.findUnique({ where: { trabajadorId: trab.trabajador_id } });
        if (dup) {
          console.log(`[SKIP override] ${u.codigoEmpleado} → trab #${trab.trabajador_id} ya tomado por ${dup.codigoEmpleado}`);
          continue;
        }
        console.log(`[LINK override] ${u.codigoEmpleado} "${u.nombre}" ↔ #${trab.trabajador_id} "${trab.nombre}" (dni=${trab.dni})`);
        actualizados++;
        if (!DRY_RUN) {
          await prisma.usuario.update({
            where: { id: u.id },
            data: { trabajadorId: trab.trabajador_id, ...(u.dni ? {} : { dni: trab.dni }) },
          });
        }
        continue;
      }
    }

    const userTokens = tokens(u.nombre);
    if (userTokens.size < 2) { sinMatch++; continue; }

    // Top match: el trabajador con más tokens compartidos. Requiere al menos 2
    // tokens en común y un solo "ganador" (sin empate en el top).
    const ranked = trabajadores
      .map((t) => ({ t, s: score(userTokens, tokens(t.nombre)) }))
      .filter((x) => x.s >= 2)
      .sort((a, b) => b.s - a.s);

    if (ranked.length === 0) {
      console.log(`[NO MATCH] ${u.codigoEmpleado} "${u.nombre}"`);
      sinMatch++;
      continue;
    }
    if (ranked.length > 1 && ranked[0].s === ranked[1].s) {
      console.log(`[AMBIGUO]  ${u.codigoEmpleado} "${u.nombre}" → tied score=${ranked[0].s}: ${ranked.slice(0, 3).map((r) => r.t.nombre).join(" / ")}`);
      sinMatch++;
      continue;
    }
    const trab = ranked[0].t;

    // ¿El trabajador ya está enlazado a otro usuario?
    const dup = await prisma.usuario.findUnique({ where: { trabajadorId: trab.trabajador_id } });
    if (dup) {
      console.log(`[SKIP] ${u.codigoEmpleado} → trab #${trab.trabajador_id} ya tomado por ${dup.codigoEmpleado}`);
      continue;
    }

    console.log(`[LINK score=${ranked[0].s}] ${u.codigoEmpleado} "${u.nombre}" ↔ #${trab.trabajador_id} "${trab.nombre}" (dni=${trab.dni ?? "—"})`);
    actualizados++;
    if (DRY_RUN) continue;

    // Si el usuario no tiene DNI y el trabajador sí, lo copiamos.
    const data: Record<string, unknown> = { trabajadorId: trab.trabajador_id };
    if (!u.dni && trab.dni) data.dni = trab.dni;
    await prisma.usuario.update({ where: { id: u.id }, data });
  }

  console.log(`\nResumen: ${actualizados} enlazados, ${sinMatch} sin match.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

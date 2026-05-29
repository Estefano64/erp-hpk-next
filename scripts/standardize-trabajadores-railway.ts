// scripts/standardize-trabajadores-railway.ts
//
// One-off: borra duplicado MORALES (#30), completa area/puesto de los 5
// trabajadores nuevos sincronizados desde tecnicoshpk.xlsx que quedaron sin
// configuración.
//
// DRY_RUN=1 npx tsx scripts/standardize-trabajadores-railway.ts
// (sin DRY_RUN aplica los cambios en Railway)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const DRY_RUN = process.env.DRY_RUN === "1";
const url = process.env.RAILWAY_DATABASE_URL;
if (!url) { console.error("Falta RAILWAY_DATABASE_URL"); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });

const UPDATES: Array<{ id: number; nombre: string; area: string; puesto: string }> = [
  { id: 32, nombre: "FORAQUITA LAURA ISAAK ANYHELO", area: "CONTABILIDAD", puesto: "ASISTENTE" },
  { id: 33, nombre: "JAIME MONGE, DIEGO ANDREE", area: "LOGISTICA", puesto: "COMPRAS" },
  { id: 34, nombre: "MATTOS BERNAL, GUILLERMO ANGELO MICHEL", area: "LOGISTICA", puesto: "ASISTENTE" },
  { id: 35, nombre: "VINA MIRANDA CARLOS ENRIQUE", area: "GERENCIA", puesto: "GERENTE GENERAL" },
  { id: 36, nombre: "SERPA YLLESCA PIO DANIEL", area: "GERENCIA", puesto: "GERENTE GENERAL" },
];
const DELETE_IDS = [30]; // MORALES SERPA JUVENAL (duplicado del #9, mismo DNI 00472411)

async function main() {
  console.log(`Target: Railway${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  // 1) DELETE duplicados
  for (const id of DELETE_IDS) {
    const t = await prisma.trabajador.findUnique({ where: { trabajador_id: id } });
    if (!t) { console.log(`[SKIP] #${id} no existe`); continue; }
    console.log(`[DELETE] #${id} "${t.nombre}" DNI=${t.dni}`);
    if (!DRY_RUN) await prisma.trabajador.delete({ where: { trabajador_id: id } });
  }

  // 2) UPDATE area/puesto
  for (const u of UPDATES) {
    const t = await prisma.trabajador.findUnique({ where: { trabajador_id: u.id } });
    if (!t) { console.log(`[SKIP] #${u.id} no existe`); continue; }
    console.log(`[UPDATE] #${u.id} "${t.nombre}" :: area="${u.area}" puesto="${u.puesto}"`);
    if (!DRY_RUN) {
      await prisma.trabajador.update({
        where: { trabajador_id: u.id },
        data: { area: u.area, puesto: u.puesto },
      });
    }
  }

  // 3) Resumen
  const total = await prisma.trabajador.count();
  const sinArea = await prisma.trabajador.count({ where: { area: null } });
  const sinPuesto = await prisma.trabajador.count({ where: { puesto: null } });
  console.log(`\nResumen post-ejecución${DRY_RUN ? " (estimado)" : ""}:`);
  console.log(`  Total trabajadores: ${total}`);
  console.log(`  Sin área: ${sinArea}`);
  console.log(`  Sin puesto: ${sinPuesto}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

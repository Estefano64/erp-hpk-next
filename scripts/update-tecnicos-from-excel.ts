// scripts/update-tecnicos-from-excel.ts
//
// Sincroniza trabajadores con `tecnicoshpk.xlsx`. Match por DNI con fallback
// a nombre normalizado. Reglas:
//   - DNI del Excel siempre se respeta (con leading zeros si los trae).
//   - Nombre del Excel se aplica al BD (estandariza formato).
//   - Cargo: si el Excel trae vacío, NO sobrescribe el puesto actual en BD.
//   - Filas que no matchean se crean con area y puesto en null (para que el
//     admin los configure manualmente). Solo se completan si el Excel los trae.
//
// Uso:
//   DRY_RUN=1 npx tsx scripts/update-tecnicos-from-excel.ts
//   TARGET=railway npx tsx scripts/update-tecnicos-from-excel.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error("falta URL"); process.exit(1); }

const FILE = "C:/Users/HP/Desktop/erp_data/tecnicoshpk.xlsx";

const prisma = new PrismaClient({ datasources: { db: { url } } });

function norm(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}`);

  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Hoja1"], { defval: null }) as Record<string, unknown>[];
  console.log(`Excel filas: ${rows.length}`);

  const trabs = await prisma.trabajador.findMany({
    select: { trabajador_id: true, dni: true, nombre: true, puesto: true, area: true, activo: true },
  });
  const byDni = new Map(trabs.filter(t => t.dni).map(t => [String(t.dni).trim(), t]));
  const byName = new Map(trabs.map(t => [norm(t.nombre), t]));

  let creados = 0, actualizados = 0, sinCambio = 0;

  for (const r of rows) {
    const dni = String(r["DNI"] ?? "").trim();
    const nombre = String(r["Nombres y Apellidos"] ?? "").trim();
    const cargo = String(r["Cargo"] ?? "").trim();
    if (!nombre) continue;

    // Match
    let target = dni ? byDni.get(dni) : null;
    if (!target) target = byName.get(norm(nombre)) ?? null;

    if (target) {
      const data: Record<string, unknown> = {};
      // DNI del Excel — siempre actualiza (puede tener leading zero).
      if (dni && target.dni !== dni) data.dni = dni;
      // Nombre del Excel — estandariza el formato.
      if (norm(target.nombre) !== norm(nombre) || target.nombre !== nombre) {
        data.nombre = nombre;
      }
      // Puesto: solo si el Excel trae cargo no-vacío.
      if (cargo && target.puesto !== cargo) data.puesto = cargo;
      // Activar si estaba inactivo.
      if (!target.activo) data.activo = true;

      if (Object.keys(data).length === 0) { sinCambio++; continue; }

      const cambios = Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
      console.log(`[UPDATE id=${target.trabajador_id}] ${nombre} :: ${cambios}`);
      actualizados++;
      if (DRY_RUN) continue;
      await prisma.trabajador.update({ where: { trabajador_id: target.trabajador_id }, data });
    } else {
      console.log(`[CREATE] dni=${dni || "(sin)"} nombre="${nombre}" puesto="${cargo || "(sin)"}" area="(sin)"`);
      creados++;
      if (DRY_RUN) continue;
      await prisma.trabajador.create({
        data: {
          nombre,
          dni: dni || null,
          puesto: cargo || null,
          area: null,
          activo: true,
        },
      });
    }
  }

  console.log(`\nResumen: ${creados} creados, ${actualizados} actualizados, ${sinCambio} sin cambio.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

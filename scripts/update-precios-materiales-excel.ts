// scripts/update-precios-materiales-excel.ts
//
// Actualiza precio + moneda en `material` desde
// "1 Log - material_COMPLETAR PRECIOS.xlsx". Match por (NP, fabricante.nombre).
//
// Uso:
//   DRY_RUN=1 npx tsx scripts/update-precios-materiales-excel.ts
//   TARGET=railway npx tsx scripts/update-precios-materiales-excel.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error("falta URL"); process.exit(1); }

const FILE = "C:/Users/HP/Downloads/1 Log - material_COMPLETAR PRECIOS (1) (1).xlsx";

interface Row { np: string; fab: string; precio: number; moneda: string }

function readExcel(): Row[] {
  const wb = XLSX.readFile(FILE);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Record<string, unknown>[];
  const out: Row[] = [];
  for (const r of raw.slice(1)) {
    const desc = r["TODOS"];
    if (!desc) continue;
    const precio = r[" Logistica"] != null ? Number(r[" Logistica"]) : null;
    if (precio == null || !Number.isFinite(precio)) continue;
    const np = String(r["Todos_7"] ?? "").trim();
    const fab = String(r["Todos_6"] ?? "").trim();
    const moneda = String(r["Logistica_1"] ?? "USD").trim().toUpperCase();
    if (!np || !fab) continue;
    out.push({ np, fab, precio, moneda });
  }
  return out;
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}`);
  const rows = readExcel();
  console.log(`Filas válidas en Excel: ${rows.length}`);

  const dbMat = await prisma.material.findMany({
    select: {
      material_id: true, codigo: true, descripcion: true, np: true,
      precio: true, moneda_codigo: true,
      fabricante: { select: { nombre: true } },
    },
  });
  const byKey = new Map<string, typeof dbMat[number]>();
  for (const m of dbMat) {
    if (!m.np) continue;
    const fabName = (m.fabricante?.nombre ?? "").trim().toLowerCase();
    byKey.set(`${m.np.trim().toLowerCase()}|${fabName}`, m);
  }

  let updated = 0, sinCambio = 0, noMatch = 0;
  for (const r of rows) {
    const key = `${r.np.toLowerCase()}|${r.fab.toLowerCase()}`;
    const m = byKey.get(key);
    if (!m) { noMatch++; continue; }
    const dbPrecio = m.precio ? Number(m.precio) : null;
    const cambia = dbPrecio == null || Math.abs(dbPrecio - r.precio) >= 0.005 || (m.moneda_codigo ?? "USD") !== r.moneda;
    if (!cambia) { sinCambio++; continue; }
    console.log(`[UPDATE] ${m.codigo} ${m.descripcion.slice(0, 60)}`);
    console.log(`           ${dbPrecio ?? "null"} ${m.moneda_codigo ?? ""}  →  ${r.precio} ${r.moneda}`);
    updated++;
    if (DRY_RUN) continue;
    await prisma.material.update({
      where: { material_id: m.material_id },
      data: { precio: r.precio, moneda_codigo: r.moneda },
    });
  }

  console.log(`\nResumen:`);
  console.log(`  actualizados: ${updated}`);
  console.log(`  sin cambio (mismo precio): ${sinCambio}`);
  console.log(`  sin match (NP+fab no existe en BD): ${noMatch}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

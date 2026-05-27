// scripts/update-encabezados-excel.ts
//
// Actualiza la tabla `operacion_cod_rep` desde el Excel
// "5.1 Encabezados (1) (1).xlsx".
//
// IMPORTANTE: NO hace deleteMany porque puede haber PlanificacionOT con FK
// hacia estas filas (las planificaciones se autogeneran al crear OT con un
// cod_rep que tiene templates). Estrategia:
//
//   - Por cada fila Excel: match por (cod_rep_codigo, componente, trabajo).
//     Si existe → UPDATE qty/horas/hh.
//     Si no existe → CREATE.
//   - Los registros en BD que NO están en el Excel se dejan intactos.
//
// Uso:
//   DRY_RUN=1 npx tsx scripts/update-encabezados-excel.ts
//   TARGET=railway npx tsx scripts/update-encabezados-excel.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error("falta URL"); process.exit(1); }

const FILE = "C:/Users/HP/Downloads/5.1 Encabezados (1) (1).xlsx";

const clean = (v: unknown): string | null => v == null ? null : String(v).trim() || null;
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

interface Row {
  np: string;
  codRep: string;       // resuelto desde np
  componente: string;
  trabajo: string;
  qty: number;
  horas: number | null;
  hh: number | null;
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Catálogos para validar
  const crs = await prisma.codigoReparacion.findMany({ select: { codigo: true, np: true } });
  const crByNP = new Map<string, string>();
  for (const c of crs) if (c.np) crByNP.set(c.np.trim(), c.codigo);
  const componentes = new Set((await prisma.componente.findMany({ select: { codigo: true } })).map(c => c.codigo));

  // Leer Excel
  const wb = XLSX.readFile(FILE);
  const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Encabezados"], { header: 1, defval: null, raw: false });
  const data = raw.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));

  // Cols: 0=NP, 1=desc, 2=modelo, 3=cod.rep, 4=desc tipo, 5=componente, 6=trabajo, 7=qty, 8=horas, 9=hh
  const rows: Row[] = [];
  let sinCR = 0, sinComp = 0;
  for (const r of data) {
    const np = clean(r[0]);
    if (!np) continue;
    const codRep = crByNP.get(np);
    if (!codRep) { sinCR++; continue; }
    const componente = clean(r[5])?.toUpperCase();
    if (!componente || !componentes.has(componente)) { sinComp++; continue; }
    const trabajo = clean(r[6]);
    if (!trabajo) continue;
    rows.push({
      np, codRep, componente, trabajo: trabajo.slice(0, 200),
      qty: num(r[7]) ?? 1,
      horas: num(r[8]),
      hh: num(r[9]),
    });
  }
  console.log(`Excel filas válidas: ${rows.length} (descartadas: sinCR=${sinCR}, sinComp=${sinComp})`);

  // Cargar BD existente y armar índice por (codRep|componente|trabajo lower)
  const existentes = await prisma.operacionCodRep.findMany({
    select: { operacion_cod_rep_id: true, cod_rep_codigo: true, componente_codigo: true, trabajo: true, qty: true, horas: true, hh: true, orden: true },
  });
  const byKey = new Map<string, typeof existentes[number]>();
  // Y un map de orden máximo usado por codRep para asignar a los nuevos
  const ordenMax = new Map<string, number>();
  for (const e of existentes) {
    byKey.set(`${e.cod_rep_codigo}|${e.componente_codigo}|${(e.trabajo ?? "").trim().toLowerCase()}`, e);
    ordenMax.set(e.cod_rep_codigo, Math.max(ordenMax.get(e.cod_rep_codigo) ?? 0, e.orden));
  }

  let actualizados = 0, sinCambio = 0, creados = 0;
  for (const r of rows) {
    const key = `${r.codRep}|${r.componente}|${r.trabajo.toLowerCase()}`;
    const ex = byKey.get(key);
    if (ex) {
      const cambia =
        ex.qty !== r.qty ||
        (ex.horas == null ? r.horas != null : Number(ex.horas) !== r.horas) ||
        (ex.hh == null ? r.hh != null : Number(ex.hh) !== r.hh);
      if (!cambia) { sinCambio++; continue; }
      console.log(`[UPDATE] ${r.codRep} ${r.componente} "${r.trabajo}"`);
      console.log(`           qty ${ex.qty}→${r.qty}, horas ${ex.horas ?? "-"}→${r.horas ?? "-"}, hh ${ex.hh ?? "-"}→${r.hh ?? "-"}`);
      actualizados++;
      if (DRY_RUN) continue;
      await prisma.operacionCodRep.update({
        where: { operacion_cod_rep_id: ex.operacion_cod_rep_id },
        data: { qty: r.qty, horas: r.horas, hh: r.hh },
      });
    } else {
      const nuevoOrden = (ordenMax.get(r.codRep) ?? 0) + 1;
      ordenMax.set(r.codRep, nuevoOrden);
      console.log(`[CREATE] ${r.codRep} ${r.componente} "${r.trabajo}" qty=${r.qty} horas=${r.horas ?? "-"} hh=${r.hh ?? "-"}`);
      creados++;
      if (DRY_RUN) continue;
      await prisma.operacionCodRep.create({
        data: {
          cod_rep_codigo: r.codRep,
          componente_codigo: r.componente,
          trabajo: r.trabajo,
          qty: r.qty,
          horas: r.horas,
          hh: r.hh,
          orden: nuevoOrden,
        },
      });
    }
  }

  console.log(`\nResumen:`);
  console.log(`  actualizados: ${actualizados}`);
  console.log(`  sin cambio: ${sinCambio}`);
  console.log(`  creados nuevos: ${creados}`);
  const total = await prisma.operacionCodRep.count();
  console.log(`  total OperacionCodRep ahora: ${total}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

// scripts/check-abiertas-hasta.ts
// Compara Abierta en Railway vs BDU con OT <= 390826.

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const TOPE = 390826;

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

async function main() {
  // 1. BDU.
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rows.slice(2).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  const bduStatus = new Map<number, string | null>();
  for (const r of dataRows) {
    const row = r as unknown[];
    const ot = parseInt(String(row[0]).trim(), 10);
    bduStatus.set(ot, clean(row[38]));
  }

  // BDU totales (todas y <= TOPE).
  const bduTodas = new Map<string, number>();
  const bduHasta = new Map<string, number>();
  for (const [ot, s] of bduStatus) {
    const k = s ?? "(vacío)";
    bduTodas.set(k, (bduTodas.get(k) ?? 0) + 1);
    if (ot <= TOPE) bduHasta.set(k, (bduHasta.get(k) ?? 0) + 1);
  }
  console.log(`=== BDU TODAS (${bduStatus.size} OTs) ===`);
  [...bduTodas.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`   ${String(n).padStart(5)}  "${k}"`),
  );
  console.log(`\n=== BDU CON OT <= ${TOPE} ===`);
  [...bduHasta.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`   ${String(n).padStart(5)}  "${k}"`),
  );

  // 2. Railway.
  const rwTodas = await prisma.ordenTrabajo.groupBy({
    by: ["ot_status_codigo"],
    _count: { _all: true },
  });
  console.log(`\n=== RAILWAY TODAS ===`);
  rwTodas.sort((a, b) => b._count._all - a._count._all).forEach((r) =>
    console.log(`   ${String(r._count._all).padStart(5)}  "${r.ot_status_codigo ?? "(null)"}"`),
  );

  const rwHasta = await prisma.ordenTrabajo.groupBy({
    by: ["ot_status_codigo"],
    where: { ot: { lte: TOPE } },
    _count: { _all: true },
  });
  console.log(`\n=== RAILWAY CON OT <= ${TOPE} ===`);
  rwHasta.sort((a, b) => b._count._all - a._count._all).forEach((r) =>
    console.log(`   ${String(r._count._all).padStart(5)}  "${r.ot_status_codigo ?? "(null)"}"`),
  );

  // 3. Lista las "Abierta" en Railway <= TOPE para inspección.
  const abiertasRw = await prisma.ordenTrabajo.findMany({
    where: { ot: { lte: TOPE }, ot_status_codigo: "Abierta" },
    select: { ot: true },
    orderBy: { ot: "asc" },
  });
  const setAbiertasRw = new Set(abiertasRw.map((o) => o.ot).filter((v): v is number => v != null));
  console.log(`\n=== Railway Abierta con OT <= ${TOPE}: ${setAbiertasRw.size} ===`);

  // 4. Lista las "Abierto" en BDU <= TOPE.
  const setAbiertasBdu = new Set<number>();
  for (const [ot, s] of bduStatus) {
    if (ot <= TOPE && s === "Abierto") setAbiertasBdu.add(ot);
  }
  console.log(`=== BDU Abierto con OT <= ${TOPE}: ${setAbiertasBdu.size} ===`);

  // 5. Discrepancias: en Railway pero NO en BDU.
  const enRwNoBdu: number[] = [...setAbiertasRw].filter((o) => !setAbiertasBdu.has(o));
  const enBduNoRw: number[] = [...setAbiertasBdu].filter((o) => !setAbiertasRw.has(o));
  console.log(`\n   📌 En Railway "Abierta" pero NO en BDU "Abierto": ${enRwNoBdu.length}`);
  console.log(`     primeras 20: ${enRwNoBdu.slice(0, 20).join(", ")}`);
  console.log(`   📌 En BDU "Abierto" pero NO en Railway "Abierta": ${enBduNoRw.length}`);
  console.log(`     primeras 20: ${enBduNoRw.slice(0, 20).join(", ")}`);

  // 6. Para las primeras 20 de Railway sin BDU "Abierto", qué dice BDU?
  console.log(`\n   📋 Para las primeras 20 OTs Abierta en RW <= ${TOPE} que NO están como Abierto en BDU:`);
  for (const ot of enRwNoBdu.slice(0, 20)) {
    const bdu = bduStatus.has(ot) ? bduStatus.get(ot) : "(no existe en BDU)";
    console.log(`     OT ${ot}: BDU="${bdu ?? "(vacío)"}"`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

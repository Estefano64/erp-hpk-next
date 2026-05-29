// scripts/sync-ot-status-bdu.ts
//
// Sincroniza SOLO el campo ot_status_codigo en Railway desde la columna
// "Estado de OT" (col 38) de la hoja BASE DE DATOS UNI.
//
// Mapeo:
//   "Cerrada"      → "Cerrada"
//   "Abierto"      → "Abierta"
//   "No ejecutado" → "No Ejecutada"
//
// Solo toca OTs cuyo número está en BDU (las históricas). Las nuevas
// creadas por usuarios reales NO se tocan.
//
// Uso:
//   npx tsx scripts/sync-ot-status-bdu.ts            (DRY-RUN)
//   npx tsx scripts/sync-ot-status-bdu.ts --apply    (escribe)

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const APPLY = process.argv.includes("--apply");

const MAP: Record<string, string> = {
  "Cerrada": "Cerrada",
  "Abierto": "Abierta",
  "No ejecutado": "No Ejecutada",
};

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}\n`);

  // 1. Leer BDU col 38.
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rows.slice(2).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  const bduMap = new Map<number, string | null>();
  const sinMapeo = new Map<string, number>();
  for (const r of dataRows) {
    const row = r as unknown[];
    const ot = parseInt(String(row[0]).trim(), 10);
    const estadoRaw = clean(row[38]);
    if (!estadoRaw) {
      bduMap.set(ot, null);
      continue;
    }
    const mapped = MAP[estadoRaw];
    if (!mapped) {
      sinMapeo.set(estadoRaw, (sinMapeo.get(estadoRaw) ?? 0) + 1);
      bduMap.set(ot, null);
      continue;
    }
    bduMap.set(ot, mapped);
  }
  console.log(`📊 BDU: ${bduMap.size} OTs`);
  if (sinMapeo.size > 0) {
    console.log(`   ⚠️  Estados sin mapeo:`);
    sinMapeo.forEach((n, v) => console.log(`     ${n}× "${v}"`));
  }

  // 2. Cargar OTs actuales de Railway.
  const otNums = [...bduMap.keys()];
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNums } },
    select: { id: true, ot: true, ot_status_codigo: true },
  });
  console.log(`📊 OTs en Railway que matchean: ${otsDb.length}`);

  // 3. Calcular cambios.
  const updates: Array<{ id: number; ot: number; antes: string | null; despues: string | null }> = [];
  for (const o of otsDb) {
    if (o.ot == null) continue;
    const nuevo = bduMap.get(o.ot) ?? null;
    if (nuevo !== o.ot_status_codigo) {
      updates.push({ id: o.id, ot: o.ot, antes: o.ot_status_codigo, despues: nuevo });
    }
  }

  console.log(`\n📊 OTs a actualizar: ${updates.length}`);
  // Resumir por transición.
  const trans = new Map<string, number>();
  for (const u of updates) {
    const k = `${u.antes ?? "(null)"} → ${u.despues ?? "(null)"}`;
    trans.set(k, (trans.get(k) ?? 0) + 1);
  }
  console.log(`\n   Transiciones:`);
  [...trans.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  // Distribución final esperada.
  console.log(`\n   Distribución final esperada (en las ${otsDb.length} OTs históricas):`);
  const distFinal = new Map<string, number>();
  for (const o of otsDb) {
    if (o.ot == null) continue;
    const f = bduMap.get(o.ot) ?? null;
    const k = f ?? "(null)";
    distFinal.set(k, (distFinal.get(k) ?? 0) + 1);
  }
  [...distFinal.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/sync-ot-status-bdu.ts --apply`);
    return;
  }

  // 4. Apply.
  console.log(`\n🔴 Aplicando ${updates.length} updates...`);
  let i = 0;
  for (const u of updates) {
    await prisma.ordenTrabajo.update({
      where: { id: u.id },
      data: { ot_status_codigo: u.despues },
    });
    i++;
    if (i % 500 === 0) console.log(`   ${i}/${updates.length}`);
  }
  console.log(`\n✅ ${i} OTs actualizadas`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

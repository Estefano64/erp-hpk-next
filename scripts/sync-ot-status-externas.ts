// scripts/sync-ot-status-externas.ts
//
// Sincroniza SOLO ot_status_codigo en Railway desde la columna "OT Status"
// (col 24) del archivo OTs-Externas-estados.xlsx.
//
// Mapeo (valores ya están con la nomenclatura correcta):
//   "Cerrada"  → "Cerrada"
//   "Abierta"  → "Abierta"
//
// Solo toca OTs cuyo número está en el archivo. OTs en Railway no presentes
// en el archivo NO se tocan.
//
// Uso:
//   npx tsx scripts/sync-ot-status-externas.ts            (DRY-RUN)
//   npx tsx scripts/sync-ot-status-externas.ts --apply    (escribe)

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../OTs-Externas-estados.xlsx");
const APPLY = process.argv.includes("--apply");

const MAP: Record<string, string> = {
  "Cerrada": "Cerrada",
  "Abierta": "Abierta",
};

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}\n`);

  // 1. Leer Excel col 24 = OT Status.
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["OTs Externas"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const xlsMap = new Map<number, string | null>();
  const sinMapeo = new Map<string, number>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const otStr = String(row[0] ?? "").trim();
    if (!/^\d+$/.test(otStr)) continue;
    const ot = parseInt(otStr, 10);
    const raw = clean(row[24]);
    if (!raw) {
      xlsMap.set(ot, null);
      continue;
    }
    const mapped = MAP[raw];
    if (!mapped) {
      sinMapeo.set(raw, (sinMapeo.get(raw) ?? 0) + 1);
      xlsMap.set(ot, null);
      continue;
    }
    xlsMap.set(ot, mapped);
  }
  console.log(`📊 Excel OTs-Externas-estados: ${xlsMap.size} OTs`);
  if (sinMapeo.size > 0) {
    console.log(`   ⚠️  Estados sin mapeo:`);
    sinMapeo.forEach((n, v) => console.log(`     ${n}× "${v}"`));
  }

  // Resumen del Excel.
  const xlsDist = new Map<string, number>();
  for (const v of xlsMap.values()) {
    const k = v ?? "(null)";
    xlsDist.set(k, (xlsDist.get(k) ?? 0) + 1);
  }
  console.log(`   Distribución en Excel:`);
  [...xlsDist.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  // 2. OTs actuales en Railway.
  const otNums = [...xlsMap.keys()];
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNums } },
    select: { id: true, ot: true, ot_status_codigo: true },
  });
  console.log(`\n📊 OTs en Railway que matchean: ${otsDb.length}`);

  // OTs del Excel que NO están en Railway.
  const setRwOts = new Set(otsDb.map((o) => o.ot).filter((v): v is number => v != null));
  const noEnRw: number[] = [...xlsMap.keys()].filter((o) => !setRwOts.has(o));
  if (noEnRw.length > 0) {
    console.log(`   ⚠️  Del Excel pero NO en Railway: ${noEnRw.length}`);
    console.log(`     primeras 20: ${noEnRw.slice(0, 20).join(", ")}`);
  }

  // 3. Calcular cambios.
  const updates: Array<{ id: number; ot: number; antes: string | null; despues: string | null }> = [];
  for (const o of otsDb) {
    if (o.ot == null) continue;
    const nuevo = xlsMap.get(o.ot) ?? null;
    if (nuevo !== o.ot_status_codigo) {
      updates.push({ id: o.id, ot: o.ot, antes: o.ot_status_codigo, despues: nuevo });
    }
  }
  console.log(`\n📊 OTs a actualizar: ${updates.length}`);

  // Transiciones.
  const trans = new Map<string, number>();
  for (const u of updates) {
    const k = `${u.antes ?? "(null)"} → ${u.despues ?? "(null)"}`;
    trans.set(k, (trans.get(k) ?? 0) + 1);
  }
  console.log(`\n   Transiciones:`);
  [...trans.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  // Mostrar primeros 20 cambios "Abierta → Cerrada" (los que importan).
  const cierres = updates.filter((u) => u.antes === "Abierta" && u.despues === "Cerrada");
  if (cierres.length > 0) {
    console.log(`\n   📋 Primeras 20 OTs que pasan de Abierta → Cerrada:`);
    cierres.slice(0, 20).forEach((u) => console.log(`     OT ${u.ot}`));
  }

  // Distribución final esperada en las OTs matcheadas.
  console.log(`\n   Distribución final esperada (en las ${otsDb.length} OTs matcheadas):`);
  const distFinal = new Map<string, number>();
  for (const o of otsDb) {
    if (o.ot == null) continue;
    const f = xlsMap.get(o.ot) ?? null;
    const k = f ?? "(null)";
    distFinal.set(k, (distFinal.get(k) ?? 0) + 1);
  }
  [...distFinal.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  // Importante: OTs en Railway que NO están en el Excel (no se tocarán).
  const allRw = await prisma.ordenTrabajo.findMany({
    select: { ot: true, ot_status_codigo: true },
  });
  const noTocadas = allRw.filter((o) => o.ot != null && !xlsMap.has(o.ot));
  console.log(`\n   ℹ️  OTs en Railway que NO están en este Excel (NO se tocan): ${noTocadas.length}`);
  const distNoTocadas = new Map<string, number>();
  for (const o of noTocadas) {
    const k = o.ot_status_codigo ?? "(null)";
    distNoTocadas.set(k, (distNoTocadas.get(k) ?? 0) + 1);
  }
  [...distNoTocadas.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
    console.log(`     ${String(n).padStart(5)}  ${k}`),
  );

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/sync-ot-status-externas.ts --apply`);
    return;
  }

  // 4. Apply - agrupado por nuevo status (2 queries en vez de N).
  console.log(`\n🔴 Aplicando ${updates.length} updates agrupados...`);
  const porStatus = new Map<string | null, number[]>();
  for (const u of updates) {
    const arr = porStatus.get(u.despues) ?? [];
    arr.push(u.id);
    porStatus.set(u.despues, arr);
  }
  let total = 0;
  for (const [status, ids] of porStatus) {
    // Por seguridad partir en chunks de 500 ids por si el IN crece mucho.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const res = await prisma.ordenTrabajo.updateMany({
        where: { id: { in: chunk } },
        data: { ot_status_codigo: status },
      });
      total += res.count;
      console.log(`   → "${status ?? "(null)"}": ${res.count} OTs actualizadas`);
    }
  }
  console.log(`\n✅ Total: ${total} OTs actualizadas`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

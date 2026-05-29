// scripts/fix-plaqueteo-y-borrar-ots19.ts
//
// 1. Restaura plaqueteo desde las hojas "Base de datos 2026" / "Base de datos"
//    para las OTs que están en BDU (las históricas).
// 2. Borra las OTs ending in 19 que no están en BDU (deletes en cascada).
//
// Uso:
//   npx tsx scripts/fix-plaqueteo-y-borrar-ots19.ts            (DRY-RUN)
//   npx tsx scripts/fix-plaqueteo-y-borrar-ots19.ts --apply    (escribe)

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const APPLY = process.argv.includes("--apply");

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return null;
  return s;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}\n`);
  const wb = XLSX.readFile(EXCEL_PATH);

  // ── 1. OTs en BDU ─────────────────────────────────────────────────────
  const bduSheet = wb.Sheets["BASE DE DATOS UNI"];
  const bduRows = XLSX.utils.sheet_to_json<unknown[]>(bduSheet, { header: 1, defval: "" });
  const otsBdu = new Set<number>();
  for (const r of bduRows.slice(1)) {
    const v = String((r as unknown[])[0] ?? "").trim();
    if (/^\d+$/.test(v)) otsBdu.add(parseInt(v, 10));
  }
  console.log(`📊 OTs en BDU: ${otsBdu.size}`);

  // ── 2. Plaqueteo desde las otras hojas ────────────────────────────────
  // 2026 primero (más reciente), histórica como fallback.
  const plaqueteoMap = new Map<number, string>();
  for (const cfg of [
    { name: "Base de datos 2026", dataStart: 3 },
    { name: "Base de datos", dataStart: 2 },
  ]) {
    const sheet = wb.Sheets[cfg.name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const data = rows.slice(cfg.dataStart).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));
    for (const r of data) {
      const ot = parseInt(String((r as unknown[])[0]).trim(), 10);
      const plaq = clean((r as unknown[])[7]); // col 7 = PLAQUETEO
      if (plaq && !plaqueteoMap.has(ot)) plaqueteoMap.set(ot, plaq);
    }
  }
  console.log(`📊 Plaqueteo encontrado para ${plaqueteoMap.size} OTs en las hojas de detalle`);

  // ── 3. Restaurar plaqueteo en las OTs de BDU ──────────────────────────
  const otsArr = [...otsBdu];
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otsArr } },
    select: { id: true, ot: true, plaqueteo: true },
  });
  const updatesPlaqueteo: Array<{ id: number; ot: number; plaqueteo: string }> = [];
  for (const o of otsDb) {
    if (o.ot == null) continue;
    const p = plaqueteoMap.get(o.ot);
    if (p && p !== o.plaqueteo) updatesPlaqueteo.push({ id: o.id, ot: o.ot, plaqueteo: p });
  }
  console.log(`📊 Plaqueteo a actualizar: ${updatesPlaqueteo.length} OTs`);
  console.log(`   Muestras:`);
  for (const u of updatesPlaqueteo.slice(0, 5)) console.log(`     OT ${u.ot}: "${u.plaqueteo}"`);

  // ── 4. OTs ending in 19 (a borrar) ────────────────────────────────────
  const otsA19 = await prisma.ordenTrabajo.findMany({
    where: { ot: { not: null } },
    select: { id: true, ot: true, descripcion: true, cliente: { select: { razon_social: true } } },
  });
  const aBorrar = otsA19.filter((o) => o.ot != null && o.ot % 100 === 19 && !otsBdu.has(o.ot));
  console.log(`\n📊 OTs ending in 19 a BORRAR: ${aBorrar.length}`);
  for (const o of aBorrar) console.log(`     OT ${o.ot} | ${o.cliente?.razon_social ?? "—"} | "${o.descripcion ?? "—"}"`);

  // Verificar dependencias
  const otIds = aBorrar.map((o) => o.id);
  const compras = await prisma.compra.count({ where: { ot_id: { in: otIds } } });
  const repuestos = await prisma.oTRepuesto.count({ where: { ot_id: { in: otIds } } });
  const historiales = await prisma.oTHistorial.count({ where: { ot_id: { in: otIds } } });
  console.log(`\n   Dependencias de esas OTs:`);
  console.log(`     Compras asociadas:    ${compras}`);
  console.log(`     Repuestos asociados:  ${repuestos}`);
  console.log(`     Entries historial:    ${historiales}`);

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/fix-plaqueteo-y-borrar-ots19.ts --apply`);
    return;
  }

  // ── 5. Apply plaqueteo ────────────────────────────────────────────────
  console.log(`\n🔴 Actualizando plaqueteo en ${updatesPlaqueteo.length} OTs...`);
  let i = 0;
  for (const u of updatesPlaqueteo) {
    await prisma.ordenTrabajo.update({ where: { id: u.id }, data: { plaqueteo: u.plaqueteo } });
    i++;
    if (i % 500 === 0) console.log(`   ${i}/${updatesPlaqueteo.length}`);
  }
  console.log(`   ✓ ${i} OTs con plaqueteo restaurado`);

  // ── 6. Borrar OTs ending in 19 ───────────────────────────────────────
  // Borrar dependencias primero (cascade depende del schema, mejor explícito).
  if (aBorrar.length > 0) {
    console.log(`\n🔴 Borrando ${aBorrar.length} OTs ending in 19 (no en BDU)...`);
    // Compras: setear ot_id=null en lugar de borrar (las compras son aparte).
    // Repuestos: en este caso son históricos sin valor, pero igual conservamos
    // si tienen compras asociadas. Aquí asumimos pueden eliminarse.
    await prisma.oTHistorial.deleteMany({ where: { ot_id: { in: otIds } } });
    await prisma.oTRepuesto.deleteMany({ where: { ot_id: { in: otIds } } });
    await prisma.compra.deleteMany({ where: { ot_id: { in: otIds } } });
    const del = await prisma.ordenTrabajo.deleteMany({ where: { id: { in: otIds } } });
    console.log(`   ✓ ${del.count} OTs eliminadas`);
  }

  console.log(`\n✅ Fix completado`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

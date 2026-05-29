// Verifica las 4 discrepancias reportadas entre BDU y Railway.

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");

interface BduRow {
  ot: number;
  cliente: string | null;
  descripcion: string | null;
  fabricante: string | null;
  flota: string | null;
  equipo: string | null;
}

async function main() {
  // 1. Leer BDU
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rows.slice(2).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  const bduPorOt = new Map<number, BduRow[]>();
  for (const r of dataRows) {
    const row = r as unknown[];
    const ot = parseInt(String(row[0]).trim(), 10);
    const cleaned = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" || s === "-" ? null : s;
    };
    const entry: BduRow = {
      ot,
      cliente: cleaned(row[2]),
      descripcion: cleaned(row[8]),
      fabricante: cleaned(row[9]),
      flota: cleaned(row[10]),
      equipo: cleaned(row[12]),
    };
    if (!bduPorOt.has(ot)) bduPorOt.set(ot, []);
    bduPorOt.get(ot)!.push(entry);
  }

  // ── 1. OT 353425 duplicada en BDU ─────────────────────────────────────
  console.log(`\n══════ 1. OT 353425 ══════`);
  const dup = bduPorOt.get(353425) ?? [];
  console.log(`   En BDU: ${dup.length} fila(s)`);
  for (const r of dup) console.log(`     ${JSON.stringify(r)}`);
  const otDb = await prisma.ordenTrabajo.findFirst({
    where: { ot: 353425 },
    include: { cliente: true, fabricante: true },
  });
  if (otDb) {
    console.log(`   En Railway:`);
    console.log(`     cliente: ${otDb.cliente?.razon_social ?? "—"}`);
    console.log(`     descripcion: ${otDb.descripcion ?? "—"}`);
    console.log(`     fabricante: ${otDb.fabricante?.nombre ?? "—"}`);
    console.log(`     flota: ${otDb.cod_rep_flota ?? "—"}`);
    console.log(`     equipo: ${otDb.equipo_codigo ?? "—"}`);
  }

  // ── 2. Cliente distinto (Antapaccay vs Unimaq) ────────────────────────
  console.log(`\n══════ 2. Cliente Antapaccay vs Unimaq ══════`);
  for (const ot of [288024, 288124, 288224]) {
    const b = bduPorOt.get(ot)?.[0];
    const d = await prisma.ordenTrabajo.findFirst({
      where: { ot }, include: { cliente: true },
    });
    console.log(`   OT ${ot}: BDU=${b?.cliente ?? "—"}  Railway=${d?.cliente?.razon_social ?? "—"}`);
  }
  // Verificar que existan clientes Unimaq y Antapaccay
  const unimaq = await prisma.cliente.findFirst({
    where: { OR: [{ razon_social: { contains: "Unimaq", mode: "insensitive" } }, { nombre_comercial: { contains: "Unimaq", mode: "insensitive" } }] },
    select: { cliente_id: true, codigo: true, razon_social: true, nombre_comercial: true },
  });
  const antap = await prisma.cliente.findFirst({
    where: { OR: [{ razon_social: { contains: "Antapaccay", mode: "insensitive" } }, { nombre_comercial: { contains: "Antapaccay", mode: "insensitive" } }] },
    select: { cliente_id: true, codigo: true, razon_social: true, nombre_comercial: true },
  });
  console.log(`   Cliente Unimaq en BD: ${unimaq ? `id=${unimaq.cliente_id} (${unimaq.razon_social})` : "❌ NO existe — crear primero"}`);
  console.log(`   Cliente Antapaccay en BD: ${antap ? `id=${antap.cliente_id} (${antap.razon_social})` : "—"}`);

  // ── 3. Descripcion distinta ───────────────────────────────────────────
  console.log(`\n══════ 3. Descripción distinta ══════`);
  for (const ot of [258224, 259124, 264324, 283524, 283624, 389626, 390026]) {
    const b = bduPorOt.get(ot)?.[0];
    const d = await prisma.ordenTrabajo.findFirst({ where: { ot }, select: { descripcion: true } });
    console.log(`   OT ${ot}:`);
    console.log(`     BDU:     ${b?.descripcion ?? "—"}`);
    console.log(`     Railway: ${d?.descripcion ?? "—"}`);
  }

  // ── 4. Fabricante distinto ────────────────────────────────────────────
  console.log(`\n══════ 4. Fabricante distinto ══════`);
  for (const ot of [247324, 290224, 291424]) {
    const b = bduPorOt.get(ot)?.[0];
    const d = await prisma.ordenTrabajo.findFirst({
      where: { ot }, include: { fabricante: true },
    });
    console.log(`   OT ${ot}: BDU=${b?.fabricante ?? "—"}  Railway=${d?.fabricante?.nombre ?? "—"}`);
  }
  // Verificar fabricantes existan
  for (const nom of ["Caterpillar", "Komatsu", "FMA", "WBM"]) {
    const f = await prisma.fabricante.findFirst({
      where: { nombre: { contains: nom, mode: "insensitive" } },
      select: { fabricante_id: true, codigo: true, nombre: true },
    });
    console.log(`   Fabricante "${nom}": ${f ? `id=${f.fabricante_id} cod=${f.codigo} nom=${f.nombre}` : "❌ NO existe"}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

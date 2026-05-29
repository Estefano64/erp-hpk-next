// Diagnóstico: compara el Excel CABECERA_LOG... contra las OTs en Railway
// para detectar columnas que no se importaron correctamente.

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return null;
  return s;
}

async function main() {
  console.log("📂 Excel:", EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  // 1. Mostrar encabezados de las hojas que importamos
  for (const sheetName of ["Base de datos 2026", "Base de datos"]) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    console.log(`\n📄 Hoja "${sheetName}":`);
    console.log(`   Filas totales: ${rows.length}`);
    // Mostrar primeras filas para entender layout
    console.log(`   Fila 0 (encabezado superior):`);
    (rows[0] as unknown[]).slice(0, 25).forEach((c, i) =>
      console.log(`     col ${String(i).padStart(2)}: ${JSON.stringify(c).slice(0, 60)}`),
    );
    if (rows[1]) {
      console.log(`   Fila 1 (sub-encabezado):`);
      (rows[1] as unknown[]).slice(0, 25).forEach((c, i) => {
        const v = JSON.stringify(c).slice(0, 60);
        if (v !== '""') console.log(`     col ${String(i).padStart(2)}: ${v}`);
      });
    }
    if (rows[2]) {
      console.log(`   Fila 2 (sub-encabezado):`);
      (rows[2] as unknown[]).slice(0, 25).forEach((c, i) => {
        const v = JSON.stringify(c).slice(0, 60);
        if (v !== '""') console.log(`     col ${String(i).padStart(2)}: ${v}`);
      });
    }
    // Mostrar primera fila de datos
    const dataStart = sheetName === "Base de datos 2026" ? 3 : 2;
    if (rows[dataStart]) {
      console.log(`   Fila ${dataStart} (primer dato):`);
      (rows[dataStart] as unknown[]).slice(0, 25).forEach((c, i) => {
        const v = JSON.stringify(c).slice(0, 60);
        if (v !== '""' && v !== "null") console.log(`     col ${String(i).padStart(2)}: ${v}`);
      });
    }
  }

  // 2. Buscar columnas que contengan "flota" o "equipo" en cualquier hoja
  console.log("\n\n🔍 Buscando 'Flota' y 'Equipo' en headers:");
  for (const sheetName of ["BASE DE DATOS UNI", "Base de datos 2026", "Base de datos"]) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    for (let r = 0; r < Math.min(4, rows.length); r++) {
      for (let c = 0; c < (rows[r] as unknown[]).length; c++) {
        const v = String((rows[r] as unknown[])[c] ?? "").toLowerCase();
        if (v.includes("flota") || v.includes("equipo")) {
          console.log(`   [${sheetName}] fila ${r}, col ${c}: "${(rows[r] as unknown[])[c]}"`);
        }
      }
    }
  }

  // 3. Tomar 3 OTs del Excel y compararlas con Railway
  console.log("\n\n📊 Comparación de muestras Excel vs Railway:");
  const sheet2026 = wb.Sheets["Base de datos 2026"];
  if (sheet2026) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet2026, { header: 1, defval: "" });
    const dataRows = rows.slice(3).filter((r) => /^\d+$/.test(String(r[0] ?? "").trim()));
    const muestras = [dataRows[0], dataRows[Math.floor(dataRows.length / 2)], dataRows[dataRows.length - 1]];
    for (const r of muestras) {
      if (!r) continue;
      const otNum = parseInt(String(r[0]).trim(), 10);
      const enDb = await prisma.ordenTrabajo.findFirst({
        where: { ot: otNum },
        include: { cliente: true, fabricante: true, codigo_reparacion: true },
      });
      console.log(`\n   ─── OT ${otNum} ───`);
      console.log(`   Excel:`);
      console.log(`     col 1 (cliente):       ${JSON.stringify(r[1])}`);
      console.log(`     col 2 (descripcion):   ${JSON.stringify(r[2])}`);
      console.log(`     col 3 (base_metalica): ${JSON.stringify(r[3])}`);
      console.log(`     col 4 (?):             ${JSON.stringify(r[4])}`);
      console.log(`     col 5 (?):             ${JSON.stringify(r[5])}`);
      console.log(`     col 6 (pos):           ${JSON.stringify(r[6])}`);
      console.log(`     col 7 (plaqueteo):     ${JSON.stringify(r[7])}`);
      console.log(`     col 8 (np):            ${JSON.stringify(r[8])}`);
      console.log(`     col 9 (ns):            ${JSON.stringify(r[9])}`);
      console.log(`     col 10 (horas):        ${JSON.stringify(r[10])}`);
      console.log(`     col 11 (pcr):          ${JSON.stringify(r[11])}`);
      console.log(`   Railway:`);
      if (!enDb) console.log(`     ❌ NO existe`);
      else {
        console.log(`     cliente:               ${enDb.cliente?.razon_social ?? "-"}`);
        console.log(`     descripcion:           ${JSON.stringify(enDb.descripcion)}`);
        console.log(`     base_metalica_codigo:  ${JSON.stringify(enDb.base_metalica_codigo)}`);
        console.log(`     fabricante:            ${enDb.fabricante?.nombre ?? "-"}`);
        console.log(`     equipo_codigo:         ${JSON.stringify(enDb.equipo_codigo)}`);
        console.log(`     cod_rep_flota:         ${JSON.stringify(enDb.cod_rep_flota)}`);
        console.log(`     cod_rep_posicion:      ${JSON.stringify(enDb.cod_rep_posicion)}`);
        console.log(`     plaqueteo:             ${JSON.stringify(enDb.plaqueteo)}`);
        console.log(`     np:                    ${JSON.stringify(enDb.np)}`);
        console.log(`     ns:                    ${JSON.stringify(enDb.ns)}`);
        console.log(`     horas:                 ${enDb.horas?.toString() ?? "-"}`);
        console.log(`     pcr:                   ${enDb.pcr?.toString() ?? "-"}`);
        console.log(`     codigo_reparacion:     ${enDb.codigo_reparacion?.codigo ?? "-"}`);
        console.log(`     id_cod_rep:            ${enDb.id_cod_rep ?? "-"}`);
      }
    }
  }

  // 4. Conteo global
  const total = await prisma.ordenTrabajo.count();
  const conFlota = await prisma.ordenTrabajo.count({ where: { cod_rep_flota: { not: null } } });
  const conEquipoCod = await prisma.ordenTrabajo.count({ where: { equipo_codigo: { not: null } } });
  const conFab = await prisma.ordenTrabajo.count({ where: { id_fabricante: { not: null } } });
  const conCodRep = await prisma.ordenTrabajo.count({ where: { id_cod_rep: { not: null } } });
  console.log(`\n\n📈 Stats globales en Railway:`);
  console.log(`   Total OTs:                  ${total}`);
  console.log(`   Con cod_rep_flota:          ${conFlota}`);
  console.log(`   Con equipo_codigo:          ${conEquipoCod}`);
  console.log(`   Con id_fabricante:          ${conFab}`);
  console.log(`   Con id_cod_rep:             ${conCodRep}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

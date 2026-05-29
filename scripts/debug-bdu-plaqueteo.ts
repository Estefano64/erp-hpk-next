// Debug exactamente qué hay en BDU columna 14 (Plaqueteo)

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);
const sheet = wb.Sheets["BASE DE DATOS UNI"];

// Leer SIN merges para ver qué hay realmente
const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

console.log(`📋 Header row 0 (todos los cols 0-20):`);
for (let c = 0; c <= 20; c++) {
  console.log(`   col ${String(c).padStart(2)}: ${JSON.stringify((rows[0] as unknown[])[c])}`);
}
console.log(`\n📋 Header row 1 (todos los cols 0-20):`);
for (let c = 0; c <= 20; c++) {
  console.log(`   col ${String(c).padStart(2)}: ${JSON.stringify((rows[1] as unknown[])[c])}`);
}

// Buscar OTs específicas que el usuario mostró (filas ~99-207 en captura)
// Las OTs visibles parecen ser 199-222 (no OT numbers, son row numbers)
// Vamos a buscar OTs cuyo plaqueteo coincida con la captura: HT002, HT024, EQ3151, EQ4132
console.log(`\n🔍 Buscando filas con plaqueteo "HT024", "EQ3151", "EQ4132", "DZ007":`);
const objetivo = new Set(["HT024", "EQ3151", "EQ4132", "DZ007", "HT002"]);
for (let r = 2; r < rows.length; r++) {
  const row = rows[r] as unknown[];
  for (let c = 0; c <= 20; c++) {
    const v = String(row[c] ?? "").trim();
    if (objetivo.has(v)) {
      console.log(`   Fila ${r}, col ${c} = "${v}"  (OT=${row[0]})`);
      // mostrar contexto: cols 8-15
      const ctx: string[] = [];
      for (let cc = 8; cc <= 15; cc++) ctx.push(`c${cc}="${String(row[cc] ?? "")}"`);
      console.log(`      ${ctx.join(" | ")}`);
    }
  }
}

// Conteo total por col 14
console.log(`\n📊 Conteo de NO-vacío por columna (cols 8-16):`);
const data = rows.slice(2).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));
console.log(`   Total filas data: ${data.length}`);
for (let c = 8; c <= 16; c++) {
  let n = 0;
  let muestras: string[] = [];
  for (const r of data) {
    const v = String((r as unknown[])[c] ?? "").trim();
    if (v && v !== "-" && v !== "—") {
      n++;
      if (muestras.length < 3) muestras.push(v);
    }
  }
  console.log(`   col ${c}: ${n}/${data.length}  ejemplos=${JSON.stringify(muestras)}`);
}

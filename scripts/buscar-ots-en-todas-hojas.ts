// Verifica si las OTs ending in 19 existen en CUALQUIER hoja del Excel
// y si plaqueteo está en otras hojas.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);

// 14 OTs ending in 19 from DB
const OTs_EN_19 = [84119, 84219, 84319, 84419, 84519, 84619, 84719, 84819, 84919, 85019, 85119, 85219, 85319, 85419];

console.log(`🔍 ¿Las 14 OTs ending in 19 existen en alguna hoja del Excel?`);
for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const otsEnHoja = new Set<number>();
  for (const r of rows) {
    const v = String((r as unknown[])[0] ?? "").trim();
    if (/^\d+$/.test(v)) otsEnHoja.add(parseInt(v, 10));
  }
  const matches = OTs_EN_19.filter((o) => otsEnHoja.has(o));
  console.log(`   "${sheetName}": ${matches.length}/${OTs_EN_19.length} matches → ${JSON.stringify(matches)}`);
}

// Plaqueteo per sheet
console.log(`\n🔍 ¿Plaqueteo está en otras hojas?`);
for (const sheetName of ["Base de datos 2026", "Base de datos"]) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) continue;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  // Encontrar header "PLAQUETEO"
  const headerRow = sheetName === "Base de datos 2026" ? 2 : 1;
  const headers = (rows[headerRow] as unknown[]) ?? [];
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] ?? "").trim().toUpperCase();
    if (h.includes("PLAQUE")) {
      console.log(`   "${sheetName}" col ${c}: header "${headers[c]}"`);
      const dataStart = sheetName === "Base de datos 2026" ? 3 : 2;
      const dataRows = rows.slice(dataStart).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));
      let conValor = 0;
      const ejemplos: string[] = [];
      for (const r of dataRows) {
        const v = String((r as unknown[])[c] ?? "").trim();
        if (v && v !== "-" && v !== "—") {
          conValor++;
          if (ejemplos.length < 5) ejemplos.push(`OT ${(r as unknown[])[0]}: "${v}"`);
        }
      }
      console.log(`     ${conValor}/${dataRows.length} OTs con plaqueteo`);
      ejemplos.forEach((e) => console.log(`       ${e}`));
    }
  }
}

// Verifica qué columnas tiene cada hoja del Excel y cuántos valores reales
// (no vacíos, no "-") tiene cada una. Para entender de dónde salen los datos
// "fantasma" que aparecen en la exportación de OTs-Externas.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function inspectSheet(name: string, dataStartRow: number) {
  const sheet = wb.Sheets[name];
  if (!sheet) {
    console.log(`\n❌ "${name}" no existe`);
    return;
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headers = (rows[dataStartRow - 1] as unknown[]).slice(0, 50);
  const data = rows.slice(dataStartRow).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  console.log(`\n📄 "${name}":  ${data.length} OTs con código numérico, ${headers.length} columnas inspectadas`);
  console.log(`   Col | % con dato | Header`);
  console.log(`   ----+------------+--------------`);

  for (let c = 0; c < headers.length; c++) {
    let conDato = 0;
    for (const r of data) {
      const v = String((r as unknown[])[c] ?? "").trim();
      if (v && v !== "-" && v !== "—") conDato++;
    }
    const h = String(headers[c] ?? "").replace(/\s+/g, " ").slice(0, 40);
    console.log(`   ${String(c).padStart(3)} | ${pct(conDato, data.length).padStart(10)} | ${h}`);
  }
}

inspectSheet("BASE DE DATOS UNI", 2);
inspectSheet("Base de datos 2026", 3);
inspectSheet("Base de datos", 2);

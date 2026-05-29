import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  if (rows.length > 0) {
    console.log("Headers:", Object.keys(rows[0]));
    console.log("First 3 rows:");
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
  }
}

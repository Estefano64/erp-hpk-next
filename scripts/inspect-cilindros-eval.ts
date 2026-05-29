import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../check_list_CUADRO_DE_CILINDROS_(EVALUACION).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  // Mostrar primeras 80 filas con contenido
  for (let r = 0; r < Math.min(80, rows.length); r++) {
    const row = rows[r] as unknown[];
    const cells: string[] = [];
    for (let c = 0; c < Math.min(15, row.length); c++) {
      const v = String(row[c] ?? "").trim();
      if (v) cells.push(`c${c}="${v.slice(0, 40)}"`);
    }
    if (cells.length > 0) console.log(`   r${r}: ${cells.join(" | ")}`);
  }
}

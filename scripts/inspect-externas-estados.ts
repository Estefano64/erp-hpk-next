// scripts/inspect-externas-estados.ts
// Inspecciona TODAS las columnas del archivo OTs-Externas-estados.xlsx
// y cuenta distribución de "Estado de OT".

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../OTs-Externas-estados.xlsx");

const wb = XLSX.readFile(EXCEL_PATH);
console.log("Sheets:", wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);

  // Determinar max columnas reales.
  let maxCols = 0;
  for (const r of rows) maxCols = Math.max(maxCols, (r as unknown[]).length);
  console.log(`Max columnas: ${maxCols}`);

  // Header row (fila 0).
  const header = rows[0] as unknown[];
  console.log(`\nHeaders (fila 0):`);
  for (let c = 0; c < maxCols; c++) {
    const v = String(header[c] ?? "").trim();
    console.log(`  col ${String(c).padStart(3)}: "${v}"`);
  }

  // Encontrar cualquier columna con "estado" / "status" en el nombre.
  console.log(`\n=== Columnas con "estado"/"status" en el header ===`);
  for (let c = 0; c < maxCols; c++) {
    const v = String(header[c] ?? "").trim().toLowerCase();
    if (v.includes("estado") || v.includes("status")) {
      console.log(`\n  col ${c}: "${header[c]}"`);
      const counts = new Map<string, number>();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r] as unknown[];
        const otStr = String(row[0] ?? "").trim();
        if (!/^\d+$/.test(otStr)) continue;
        const val = String(row[c] ?? "").trim() || "(vacío)";
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      console.log(`     Total: ${total}`);
      [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
        console.log(`       ${String(n).padStart(5)}  "${k}"`),
      );
    }
  }
}

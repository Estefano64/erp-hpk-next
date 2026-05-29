// scripts/inspect-bdu-headers.ts
// Lista TODOS los headers de BDU (fila 1 y 2) para identificar columnas de "estado".

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");

const wb = XLSX.readFile(EXCEL_PATH);
const sheet = wb.Sheets["BASE DE DATOS UNI"];
const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

const fila0 = rows[0] as unknown[];
const fila1 = rows[1] as unknown[];
const maxCols = Math.max(fila0.length, fila1.length);

console.log("Columnas BDU (col | fila0 / fila1):");
for (let c = 0; c < maxCols; c++) {
  const a = String(fila0[c] ?? "").trim();
  const b = String(fila1[c] ?? "").trim();
  console.log(`  col ${String(c).padStart(2)}: "${a}" / "${b}"`);
}

// Conteo por columna con "estado" en el nombre
console.log("\n=== Columnas que mencionan 'estado' ===");
for (let c = 0; c < maxCols; c++) {
  const a = String(fila0[c] ?? "").trim().toLowerCase();
  const b = String(fila1[c] ?? "").trim().toLowerCase();
  if (a.includes("estado") || b.includes("estado") || a.includes("status") || b.includes("status")) {
    console.log(`\n  col ${c}: "${fila0[c]}" / "${fila1[c]}"`);
    // Conteo de valores en esta columna (de fila 2 en adelante, solo OTs válidas).
    const counts = new Map<string, number>();
    let totalConOt = 0;
    let totalConOtTope = 0;
    const countsTope = new Map<string, number>();
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      const otStr = String(row[0] ?? "").trim();
      if (!/^\d+$/.test(otStr)) continue;
      const ot = parseInt(otStr, 10);
      totalConOt++;
      const v = String(row[c] ?? "").trim() || "(vacío)";
      counts.set(v, (counts.get(v) ?? 0) + 1);
      if (ot <= 390826) {
        totalConOtTope++;
        countsTope.set(v, (countsTope.get(v) ?? 0) + 1);
      }
    }
    console.log(`     Total OTs: ${totalConOt}`);
    [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
      console.log(`       ${String(n).padStart(5)}  "${k}"`),
    );
    console.log(`     OTs <= 390826: ${totalConOtTope}`);
    [...countsTope.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
      console.log(`       ${String(n).padStart(5)}  "${k}"`),
    );
  }
}

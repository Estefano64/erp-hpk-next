// scripts/inspect-ots-internas.ts
// SOLO LECTURA. Inspecciona el Excel 10.Ots_internas.xlsx para entender
// el shape de la tabla — qué columnas existen vs nuestro schema actual.
// No importa datos a la BD.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../Excels_HPK/10.Ots_internas.xlsx");

function main() {
  console.log(`Leyendo: ${EXCEL_PATH}\n`);
  const wb = XLSX.readFile(EXCEL_PATH);
  console.log(`Hojas encontradas: ${wb.SheetNames.join(", ")}\n`);

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    console.log(`\n${"=".repeat(72)}`);
    console.log(`HOJA: "${name}"`);
    console.log("=".repeat(72));
    console.log(`Filas totales: ${rows.length}`);

    if (rows.length === 0) continue;

    // Mostrar primeras 5 filas como referencia.
    const maxCols = Math.max(...rows.slice(0, 10).map((r) => (r as unknown[]).length));
    console.log(`Máx columnas en primeras 10 filas: ${maxCols}`);

    console.log(`\n--- Headers (fila 0) ---`);
    const headers = rows[0] as unknown[];
    headers.forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)}`));

    if (rows.length >= 2) {
      console.log(`\n--- Fila 1 (muestra) ---`);
      const r1 = rows[1] as unknown[];
      r1.forEach((v, i) => console.log(`  [${i}] (${headers[i]}) = ${JSON.stringify(v)}`));
    }

    if (rows.length >= 3) {
      console.log(`\n--- Fila 2 (muestra) ---`);
      const r2 = rows[2] as unknown[];
      r2.forEach((v, i) => console.log(`  [${i}] (${headers[i]}) = ${JSON.stringify(v)}`));
    }

    // Contar filas no vacías (col 0 con contenido).
    const dataRows = rows.slice(1).filter((r) => {
      const v = String((r as unknown[])[0] ?? "").trim();
      return v.length > 0;
    });
    console.log(`\nFilas con dato en col 0: ${dataRows.length}`);
  }
}

main();

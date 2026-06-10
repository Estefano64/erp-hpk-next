// Inspecciona la estructura del Excel tasklist_Mantenimiento.xlsx
// Solo lectura — no toca BD.
const XLSX = require("xlsx");

const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/tasklist_Mantenimiento.xlsx";

const wb = XLSX.readFile(FILE);
console.log("HOJAS:", wb.SheetNames);

for (const sheetName of wb.SheetNames) {
  console.log(`\n══════════════ Hoja: ${sheetName} ══════════════`);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  console.log(`Filas: ${rows.length}`);
  if (rows.length === 0) continue;
  console.log("HEADERS:", Object.keys(rows[0]));
  console.log("\nFIRST 3 ROWS:");
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    console.log(`Row ${i + 1}:`, JSON.stringify(rows[i], null, 2));
  }

  // Valores únicos de columnas que parezcan ser "claves" (PM, Cod, Maquina, etc.)
  const headers = Object.keys(rows[0]);
  console.log("\nVALORES ÚNICOS por columna clave:");
  for (const h of headers) {
    const set = new Set();
    for (const r of rows) {
      const v = r[h];
      if (v != null && String(v).trim() !== "") set.add(String(v).trim());
    }
    if (set.size > 0 && set.size <= 50) {
      // mostramos solo si tiene pocos valores únicos (probable enum/cat)
      console.log(`  ${h} (${set.size}):`, [...set].slice(0, 20));
    } else if (set.size > 0) {
      console.log(`  ${h} (${set.size} únicos)`);
    }
  }
}

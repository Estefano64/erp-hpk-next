import * as XLSX from "xlsx";

const wb = XLSX.readFile("../Stock_Actualizado.xlsx");
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  console.log(`\n=== ${name} (${rows.length} rows) ===`);
  if (rows.length > 0) {
    console.log("Headers:", Object.keys(rows[0]));
    console.log("First 8 rows:");
    console.log(JSON.stringify(rows.slice(0, 8), null, 2));
    console.log("Last 3 rows:");
    console.log(JSON.stringify(rows.slice(-3), null, 2));
  }
}

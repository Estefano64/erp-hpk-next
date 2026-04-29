import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DIR = "C:/Users/HP/Desktop/erp_data";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".xlsx"));

for (const f of files) {
  const abs = path.join(DIR, f);
  const wb = XLSX.readFile(abs);
  console.log("\n========================================");
  console.log("FILE:", f);
  console.log("SHEETS:", wb.SheetNames.length);
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    if (!rows.length) {
      console.log(`  [${sheetName}] (empty)`);
      continue;
    }
    // Find the first non-empty row (header row). Often row 0 is a title.
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] || [];
      const nonNull = row.filter((c) => c != null && String(c).trim()).length;
      if (nonNull >= 3) { headerRowIdx = i; break; }
    }
    const header = (rows[headerRowIdx] || []).map((c) => (c == null ? "" : String(c).trim()));
    const dataRows = rows.slice(headerRowIdx + 1).filter((r) => r && r.some((c) => c != null && String(c).trim()));
    console.log(`  [${sheetName}] rows=${dataRows.length} headerAt=${headerRowIdx}`);
    console.log(`    cols (${header.length}):`, header.slice(0, 40).join(" | "));
    if (header.length > 40) console.log("    ... more cols");
  }
}

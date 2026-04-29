import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const files = [
  { tag: "normal", path: "C:/Users/HP/Desktop/erp_data/4. Log prod - Task list materiales y servicios.xlsx" },
  { tag: "tono",   path: "C:/Users/HP/Desktop/erp_data/4. Log prod - Task list materiales y servicios (toño).xlsx" },
];

for (const f of files) {
  console.log("\n======================= " + f.tag.toUpperCase() + " =======================");
  const wb = XLSX.readFile(f.path);
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    if (!rows.length) continue;
    console.log("\n  Sheet:", name, "total rows:", rows.length);
    console.log("  Row 0 (tags):", rows[0]);
    console.log("  Row 1 (headers):", rows[1]);
    console.log("  Row 2 (sample):", rows[2]);
    if (rows.length > 3) console.log("  Row 3 (sample):", rows[3]);
  }
}

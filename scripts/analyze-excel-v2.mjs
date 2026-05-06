import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DIR = "C:/Users/HP/Desktop/erp_data";
const OUT = "C:/Users/HP/Documents/HPK-ERP-NEXT/erp/scripts/_excel-analysis-v2.txt";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".xlsx"));

const TAG_WORDS = /^(software|produccion|logistica|log y mant|mant|todos|prod y mant|tabla|manual|automatico|calculado|referenciado|ger\.?|prod\.?|selección.*|correlativo.*|item.*|automatico editable.*|manual\s*\(.*\))$/i;

function isTagRow(row) {
  const cells = row.filter((c) => c != null && String(c).trim());
  if (cells.length < 2) return false;
  const tagCount = cells.filter((c) => TAG_WORDS.test(String(c).trim())).length;
  return tagCount / cells.length >= 0.5;
}

function headerScore(row) {
  const cells = row.filter((c) => c != null && String(c).trim());
  if (cells.length < 2) return 0;
  const uniq = new Set(cells.map((c) => String(c).trim().toLowerCase())).size;
  const shortAndWordy = cells.filter((c) => {
    const s = String(c).trim();
    return s.length > 0 && s.length <= 40 && /[a-záéíóúñ]/i.test(s);
  }).length;
  if (isTagRow(row)) return -1;
  return uniq * 2 + shortAndWordy;
}

function findHeaderRow(rows) {
  let best = { idx: 0, score: -Infinity };
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const s = headerScore(rows[i] || []);
    if (s > best.score) best = { idx: i, score: s };
  }
  return best.idx;
}

function uniqueValues(dataRows, colIdx, max = 15) {
  const set = new Set();
  for (const r of dataRows) {
    const v = r[colIdx];
    if (v == null || String(v).trim() === "") continue;
    set.add(String(v).trim());
    if (set.size > max) break;
  }
  return Array.from(set);
}

const out = [];
function log(...args) { out.push(args.join(" ")); }

for (const f of files) {
  const abs = path.join(DIR, f);
  const wb = XLSX.readFile(abs);
  log("\n========================================");
  log("FILE:", f);
  log("SHEETS:", wb.SheetNames.length);
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
    if (!rows.length) { log(`  [${sheetName}] (empty)`); continue; }

    const headerRowIdx = findHeaderRow(rows);
    const headers = (rows[headerRowIdx] || []).map((c) => (c == null ? "" : String(c).trim()));
    const dataRows = rows.slice(headerRowIdx + 1)
      .filter((r) => r && r.some((c) => c != null && String(c).trim()))
      .filter((r) => !isTagRow(r));

    log(`\n  [${sheetName}] rows=${dataRows.length} headerAt=${headerRowIdx} cols=${headers.length}`);
    log(`    HEADERS: ${headers.filter(Boolean).join(" | ")}`);

    // For small sheets (likely catalogs), print all values
    if (dataRows.length > 0 && dataRows.length <= 50) {
      log(`    VALUES:`);
      const show = dataRows.slice(0, 50);
      for (const r of show) {
        const line = headers.map((h, i) => {
          const v = r[i];
          return v == null || String(v).trim() === "" ? "" : String(v).trim();
        }).filter(Boolean).join(" | ");
        if (line) log(`      • ${line}`);
      }
    } else if (dataRows.length > 0) {
      // Larger sheets: unique values per column (catalog-like)
      log(`    UNIQUE PER COLUMN (first 10 cols, max 10 values each):`);
      for (let i = 0; i < Math.min(headers.length, 14); i++) {
        if (!headers[i]) continue;
        const uniq = uniqueValues(dataRows, i, 10);
        const all = new Set();
        for (const r of dataRows) {
          const v = r[i];
          if (v != null && String(v).trim()) all.add(String(v).trim());
        }
        log(`      [${headers[i]}] distinct=${all.size} → ${uniq.slice(0, 8).join(", ")}${uniq.length >= 8 ? "..." : ""}`);
      }
      // Show 2 sample rows
      log(`    SAMPLE ROWS:`);
      for (const r of dataRows.slice(0, 2)) {
        const line = headers.map((h, i) => {
          const v = r[i];
          if (v == null || String(v).trim() === "") return null;
          return `${h}=${String(v).trim().slice(0, 40)}`;
        }).filter(Boolean).join(" · ");
        log(`      ${line}`);
      }
    }
  }
}

fs.writeFileSync(OUT, out.join("\n"), "utf8");
console.log("Written to", OUT, `(${out.length} lines)`);

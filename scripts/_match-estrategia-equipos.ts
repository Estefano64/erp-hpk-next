import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const p = new PrismaClient();

async function main() {
  const wb = XLSX.readFile("C:/Users/HP/Desktop/erp_data/3. Todos - Estrategias.xlsx");
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], { header: 1, defval: null, raw: false });
  const data = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  const names = new Set<string>();
  for (const r of data) if (r[3]) names.add(String(r[3]).trim());

  const equipos = await p.equipo.findMany({ select: { codigo: true, descripcion: true } });
  const byDesc = new Map<string, string>();
  for (const e of equipos) byDesc.set(e.descripcion.toLowerCase().trim(), e.codigo);

  const match: [string, string][] = [];
  const noMatch: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase().trim();
    if (byDesc.has(key)) match.push([n, byDesc.get(key)!]);
    else noMatch.push(n);
  }

  console.log(`MATCH directo (${match.length}):`);
  for (const [n, c] of match) console.log("  ✓", n.padEnd(32), "→", c);
  console.log(`\nNO MATCH (${noMatch.length}):`);
  for (const n of noMatch) console.log("  ✗", n);

  // Count how many Estrategia rows each category covers
  let matchRows = 0;
  let noMatchRows = 0;
  const matchSet = new Set(match.map(([n]) => n));
  for (const r of data) {
    const name = r[3] ? String(r[3]).trim() : null;
    if (!name) continue;
    if (matchSet.has(name)) matchRows++;
    else noMatchRows++;
  }
  console.log(`\nFilas Estrategia con match: ${matchRows}`);
  console.log(`Filas Estrategia sin match: ${noMatchRows}`);

  await p.$disconnect();
}

main();

/**
 * Importa trabajadores desde `LISTA_DE_TRABAJADORES (2).xlsx`.
 * Hoja: PERSONAL HPK. Columnas: Nro, Nombre, DNI, AREA, PUESTO.
 * DNI "-" o vacío → null. Idempotente por (nombre, dni).
 */
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const EXCEL = "C:/Users/HP/Desktop/erp_data/LISTA_DE_TRABAJADORES (2).xlsx";
const p = new PrismaClient();

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  return s;
}

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["PERSONAL HPK"], {
    header: 1, defval: null, raw: false,
  });
  const data = rows.slice(1).filter((r) => r && r.some((c) => c != null && String(c).trim()));

  let creados = 0, actualizados = 0, skip = 0;
  for (const r of data) {
    const nombre = clean(r[1]);
    const dni = clean(r[2]);
    const area = clean(r[3]);
    const puesto = clean(r[4]);
    if (!nombre || !area || !puesto) { skip++; continue; }

    const existing = await p.trabajador.findFirst({
      where: dni ? { dni } : { nombre, dni: null },
    });

    if (existing) {
      await p.trabajador.update({
        where: { trabajador_id: existing.trabajador_id },
        data: { nombre, area, puesto },
      });
      actualizados++;
    } else {
      await p.trabajador.create({
        data: { nombre, dni, area, puesto },
      });
      creados++;
    }
  }

  const total = await p.trabajador.count();
  console.log(`=== Import Trabajadores ===`);
  console.log(`Excel: ${data.length} filas`);
  console.log(`Creados: ${creados}, actualizados: ${actualizados}, saltados: ${skip}`);
  console.log(`Total en DB: ${total}`);

  const porArea = await p.trabajador.groupBy({ by: ["area"], _count: true });
  console.log(`\nPor área:`);
  for (const g of porArea) console.log(`  ${g.area.padEnd(20)} ${g._count}`);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

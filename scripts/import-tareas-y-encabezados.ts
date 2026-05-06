/**
 * Fase 1.3 — Importa:
 *   1. Tareas normal (1400) desde `4. Log prod - Task list materiales y servicios.xlsx`
 *      → Tarea con cod_rep_codigo resuelto por NP del cilindro
 *   2. Tareas toño (585) desde `4. Log prod - Task list materiales y servicios (toño).xlsx`
 *      → Tarea con np_cod1 = MP1/2/3/4 (plan de mantenimiento preventivo)
 *   3. Encabezados (1856) desde `5.1 Encabezados.xlsx`
 *      → OperacionCodRep (plantilla de operaciones por CodRep)
 *
 * Idempotente mediante `deleteMany` + re-insert para Encabezados,
 * y upsert por `(cod_rep_codigo, np_cod1, np_cod2, item_numero)` lógico para Tareas.
 */
import { createRequire } from "module";
import { PrismaClient, type Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const FILE_NORMAL = "C:/Users/HP/Desktop/erp_data/4. Log prod - Task list materiales y servicios.xlsx";
const FILE_TONO = "C:/Users/HP/Desktop/erp_data/4. Log prod - Task list materiales y servicios (toño).xlsx";
const FILE_ENC = "C:/Users/HP/Desktop/erp_data/5.1 Encabezados.xlsx";

const p = new PrismaClient();

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function buildMaterialByNPIndex() {
  const mats = await p.material.findMany({ select: { codigo: true, np: true } });
  const byNP = new Map<string, string>();
  for (const m of mats) if (m.np) byNP.set(m.np.toLowerCase().trim(), m.codigo);
  return byNP;
}

async function buildCodRepByNPIndex() {
  const crs = await p.codigoReparacion.findMany({ select: { codigo: true, np: true } });
  const byNP = new Map<string, string>();
  for (const c of crs) if (c.np) byNP.set(c.np.trim(), c.codigo);
  return byNP;
}

async function importTareasNormal(matByNP: Map<string, string>, crByNP: Map<string, string>) {
  console.log("\n=== Importando Tareas NORMAL ===");
  const wb = XLSX.readFile(FILE_NORMAL);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Task List Materiales"], {
    header: 1, defval: null, raw: false,
  });
  const data = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  console.log(`Filas: ${data.length}`);

  await p.tarea.deleteMany({ where: { tipo_codigo: { in: ["MAC", "SER"] }, cod_rep_codigo: { not: null } } });

  let ok = 0, sinCodRep = 0, sinMat = 0;
  const batch: Prisma.TareaCreateManyInput[] = [];
  for (const r of data) {
    const npCod1 = clean(r[3]);
    if (!npCod1) continue;
    const codRepCodigo = crByNP.get(npCod1) ?? null;
    if (!codRepCodigo) sinCodRep++;
    const np = clean(r[13]);
    const materialCodigo = np ? matByNP.get(np.toLowerCase()) ?? null : null;
    if (np && !materialCodigo) sinMat++;
    const tipo = clean(r[9]) ?? "MAC";
    const desc = clean(r[7]) ?? "(sin descripción)";
    const item = Number(clean(r[8])) || 0;
    const req = parseNum(r[11]) ?? 0;

    batch.push({
      actividad_codigo: npCod1.slice(0, 50),
      cod_rep_codigo: codRepCodigo,
      np_cod1: npCod1,
      np_cod2: clean(r[4]),
      id_tubo: clean(r[5]),
      od_vas: clean(r[6]),
      descripcion: desc,
      item_numero: item,
      tipo_codigo: tipo,
      material_codigo: materialCodigo,
      requerimiento: req,
      ref_descripcion: clean(r[12]),
      np,
      texto: clean(r[14]),
      precio: parseNum(r[15]),
    });
    ok++;
  }
  // Insert en chunks
  const CHUNK = 500;
  for (let i = 0; i < batch.length; i += CHUNK) {
    await p.tarea.createMany({ data: batch.slice(i, i + CHUNK) });
  }
  console.log(`  ✓ Insertadas: ${ok}`);
  console.log(`  ⚠ Sin CodRep resuelto (cod_rep_codigo=null): ${sinCodRep}`);
  console.log(`  ⚠ Sin Material resuelto (NP no coincide): ${sinMat}`);
}

async function importTareasTono(matByNP: Map<string, string>) {
  console.log("\n=== Importando Tareas TOÑO ===");
  const wb = XLSX.readFile(FILE_TONO);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Task List Materiales"], {
    header: 1, defval: null, raw: false,
  });
  const data = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  console.log(`Filas: ${data.length}`);

  await p.tarea.deleteMany({ where: { tipo_codigo: "CAD" } });

  let ok = 0, sinMat = 0;
  const batch: Prisma.TareaCreateManyInput[] = [];
  for (const r of data) {
    const npCod1 = clean(r[3]);
    const npCod2 = clean(r[4]);
    if (!npCod1 && !npCod2) continue;
    const tipo = clean(r[9]) ?? "CAD";
    const desc = clean(r[7]) ?? "(sin descripción)";
    const item = Number(clean(r[8])) || 0;
    const req = parseNum(r[11]) ?? 0;
    const np = clean(r[14]);
    const materialCodigo = np ? matByNP.get(np.toLowerCase()) ?? null : null;
    if (np && !materialCodigo) sinMat++;

    batch.push({
      actividad_codigo: (npCod1 ?? "MP-GEN").slice(0, 50),
      cod_rep_codigo: null, // toño = mantenimiento preventivo, no ligado a CodRep
      np_cod1: npCod1,
      np_cod2: npCod2,
      id_tubo: clean(r[5]),
      od_vas: clean(r[6]),
      descripcion: desc,
      item_numero: item,
      tipo_codigo: tipo,
      material_codigo: materialCodigo,
      requerimiento: req,
      ref_descripcion: clean(r[13]), // Toño tiene UM en col 12, Ref en col 13
      np,
      texto: clean(r[15]),
      precio: null,
    });
    ok++;
  }
  const CHUNK = 500;
  for (let i = 0; i < batch.length; i += CHUNK) {
    await p.tarea.createMany({ data: batch.slice(i, i + CHUNK) });
  }
  console.log(`  ✓ Insertadas: ${ok}`);
  console.log(`  ⚠ Sin Material resuelto (NP no coincide): ${sinMat}`);
}

async function importEncabezados(crByNP: Map<string, string>) {
  console.log("\n=== Importando Encabezados ===");
  const wb = XLSX.readFile(FILE_ENC);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Encabezados"], {
    header: 1, defval: null, raw: false,
  });
  // Header en fila 1 (Row 0 es titulo "  "), data desde fila 2
  const data = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  console.log(`Filas: ${data.length}`);

  await p.operacionCodRep.deleteMany({});

  // Componentes válidos
  const componentes = await p.componente.findMany({ select: { codigo: true } });
  const validComp = new Set(componentes.map((c) => c.codigo));

  let ok = 0, sinCR = 0, sinComp = 0, ordenPorCR = new Map<string, number>();
  const batch: Prisma.OperacionCodRepCreateManyInput[] = [];
  for (const r of data) {
    const np = clean(r[0]);
    if (!np) continue;
    const codRepCodigo = crByNP.get(np);
    if (!codRepCodigo) { sinCR++; continue; }
    const componente = clean(r[3])?.toUpperCase();
    if (!componente || !validComp.has(componente)) { sinComp++; continue; }
    const trabajo = clean(r[4]) ?? "(sin trabajo)";
    const qty = Number(clean(r[5])) || 1;
    const horas = parseNum(r[6]);
    const hh = parseNum(r[7]);

    const orden = (ordenPorCR.get(codRepCodigo) ?? 0) + 1;
    ordenPorCR.set(codRepCodigo, orden);

    batch.push({
      cod_rep_codigo: codRepCodigo,
      componente_codigo: componente,
      operacion_reparacion_codigo: null, // matching fuzzy queda para después
      trabajo: trabajo.slice(0, 200),
      qty,
      horas,
      hh,
      orden,
    });
    ok++;
  }
  const CHUNK = 500;
  for (let i = 0; i < batch.length; i += CHUNK) {
    await p.operacionCodRep.createMany({ data: batch.slice(i, i + CHUNK) });
  }
  console.log(`  ✓ Insertadas: ${ok}`);
  console.log(`  ⚠ Sin CodRep (NP no está en codigo_reparacion): ${sinCR}`);
  console.log(`  ⚠ Sin Componente válido: ${sinComp}`);
}

async function main() {
  const matByNP = await buildMaterialByNPIndex();
  const crByNP = await buildCodRepByNPIndex();
  console.log(`Index Material por NP: ${matByNP.size}`);
  console.log(`Index CodRep por NP: ${crByNP.size}`);

  await importTareasNormal(matByNP, crByNP);
  await importTareasTono(matByNP);
  await importEncabezados(crByNP);

  console.log("\n=== CONTEOS FINALES ===");
  console.log("Tarea:", await p.tarea.count());
  console.log("  con cod_rep_codigo:", await p.tarea.count({ where: { cod_rep_codigo: { not: null } } }));
  console.log("  sin cod_rep_codigo (toño):", await p.tarea.count({ where: { cod_rep_codigo: null } }));
  console.log("OperacionCodRep:", await p.operacionCodRep.count());

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

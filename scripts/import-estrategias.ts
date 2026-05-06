/**
 * Importa las 107 Estrategias del Excel `3. Todos - Estrategias.xlsx`.
 *
 * Mapping de la columna Excel "Equipo":
 *   - 24 match directo por Equipo.descripcion → equipo_codigo
 *   - 5 match manual (nombre distinto en Excel vs DB) → equipo_codigo
 *   - 7 agrupadores abstractos → conjunto_codigo (ConjuntoMantenimiento)
 *   - 1 equipo que no existe (Powertec 450, 3 filas) → SKIP con warning
 *
 * Genera código autoincremental EST-0001..EST-NNNN.
 * Idempotente: usa upsert por `codigo`.
 */
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const EXCEL = "C:/Users/HP/Desktop/erp_data/3. Todos - Estrategias.xlsx";
const p = new PrismaClient();

// Mapping manual: nombre en Excel → código de Equipo en DB
const MANUAL_EQUIPO: Record<string, string> = {
  "Torno SP6-3000": "MAQ016",
  "Torno JP MAC": "MAQ019",
  "Máquina de Soldar Lincoln 350 XL Construction": "MAQ013",
  "Máquina de Soldar Lincoln 350 XP Power Conect": "MAQ014",
  // Multi-línea en Excel: "Montacargas\nHYNDAI\n3TN"
  "Montacargas\nHYNDAI\n3TN": "MAQ024",
};

// Mapping: nombre en Excel → código de ConjuntoMantenimiento
const CONJUNTO_MAP: Record<string, string> = {
  "Taller": "TALLER",
  "Herramientas": "HERRAMIENTAS",
  "Herramientas de medicion": "HERR_MEDICION",
  "Maquina & equipos": "MAQUINAS",
  "Vehiculos": "VEHICULOS",
  "SEGURIDAD": "SEGURIDAD",
  "INVENTARIO": "INVENTARIO",
};

// Nombres que deliberadamente saltamos (equipos que no existen en DB)
const SKIP_NAMES = new Set(["Maquina de Soldar Powertec 450"]);

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

async function main() {
  const wb = XLSX.readFile(EXCEL);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"], {
    header: 1,
    defval: null,
    raw: false,
  });
  // Headers fila 1, datos desde fila 2
  // Cols: Usuario(0), Estrategia(1)=null, Area(2), Equipo(3), Actividad(4)=null,
  //       Frecuencia(5), UndMed(6), Descripción estrategia(7), Tipo estrategia(8), Status(9)
  const data = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  console.log(`Excel: ${data.length} filas de Estrategia`);

  // Pre-cargar equipos por descripción para el match directo
  const equipos = await p.equipo.findMany({ select: { codigo: true, descripcion: true } });
  const byDesc = new Map<string, string>();
  for (const e of equipos) byDesc.set(e.descripcion.toLowerCase().trim(), e.codigo);

  let counter = 1;
  let matchDirecto = 0;
  let matchManual = 0;
  let conjunto = 0;
  let skipped = 0;
  const skipDetail: { name: string; reason: string }[] = [];

  for (const r of data) {
    const area = clean(r[2]);
    const equipoName = r[3] == null ? null : String(r[3]);
    const frecuenciaRaw = clean(r[5]);
    const undMed = clean(r[6]);
    const desc = clean(r[7]);
    const tipo = clean(r[8]);
    const status = clean(r[9]);

    if (!area || !equipoName || !desc || !tipo || !status || !undMed || !frecuenciaRaw) {
      skipped++;
      skipDetail.push({ name: equipoName ?? "(vacío)", reason: "campo requerido vacío" });
      continue;
    }
    const equipoNameTrim = equipoName.trim();
    if (SKIP_NAMES.has(equipoNameTrim)) {
      skipped++;
      skipDetail.push({ name: equipoNameTrim, reason: "equipo no existe en DB (skippeado)" });
      continue;
    }

    let equipo_codigo: string | null = null;
    let conjunto_codigo: string | null = null;

    // 1. Match directo por descripcion
    const direct = byDesc.get(equipoNameTrim.toLowerCase());
    if (direct) {
      equipo_codigo = direct;
      matchDirecto++;
    } else if (MANUAL_EQUIPO[equipoName] || MANUAL_EQUIPO[equipoNameTrim]) {
      // 2. Mapping manual (usa el valor raw con \n si aplica)
      equipo_codigo = MANUAL_EQUIPO[equipoName] ?? MANUAL_EQUIPO[equipoNameTrim];
      matchManual++;
    } else if (CONJUNTO_MAP[equipoNameTrim]) {
      // 3. Conjunto agrupador
      conjunto_codigo = CONJUNTO_MAP[equipoNameTrim];
      conjunto++;
    } else {
      skipped++;
      skipDetail.push({ name: equipoNameTrim, reason: "sin match en equipos ni conjuntos" });
      continue;
    }

    const codigo = `EST-${String(counter).padStart(4, "0")}`;
    const frecuencia = Number(frecuenciaRaw.replace(/,/g, "")) || 0;
    await p.estrategia.upsert({
      where: { codigo },
      update: {
        area_codigo: area,
        equipo_codigo,
        conjunto_codigo,
        actividad_codigo: desc, // Excel "Actividad" viene vacío, usamos descripción como fallback
        frecuencia,
        unidad_medida_codigo: undMed,
        descripcion: desc,
        tipo_estrategia_codigo: tipo,
        status_codigo: status,
      },
      create: {
        codigo,
        area_codigo: area,
        equipo_codigo,
        conjunto_codigo,
        actividad_codigo: desc,
        frecuencia,
        unidad_medida_codigo: undMed,
        descripcion: desc,
        tipo_estrategia_codigo: tipo,
        status_codigo: status,
      },
    });
    counter++;
  }

  console.log(`\n=== RESUMEN IMPORTACIÓN ESTRATEGIAS ===`);
  console.log(`  ✓ Match directo (equipo por descripción): ${matchDirecto}`);
  console.log(`  ✓ Match manual (equipo con nombre distinto): ${matchManual}`);
  console.log(`  ✓ Conjunto agrupador: ${conjunto}`);
  console.log(`  ✗ Saltadas: ${skipped}`);
  if (skipDetail.length) {
    const summary = new Map<string, number>();
    for (const s of skipDetail) summary.set(`${s.reason} — ${s.name}`, (summary.get(`${s.reason} — ${s.name}`) || 0) + 1);
    console.log(`\n  Detalle de saltadas:`);
    for (const [k, v] of summary) console.log(`    · ${k}: ${v}x`);
  }
  console.log(`\nTotal insertadas: ${counter - 1} (de ${data.length} filas del Excel)`);

  const finalCount = await p.estrategia.count();
  console.log(`Estrategia.count() en DB: ${finalCount}`);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

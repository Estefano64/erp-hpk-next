// Inspecciona la hoja "BASE DE DATOS UNI" — tiene columnas que el import
// original (que usaba "Base de datos 2026" + "Base de datos") no traía.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);
const sheet = wb.Sheets["BASE DE DATOS UNI"];
if (!sheet) {
  console.log("❌ Hoja 'BASE DE DATOS UNI' no encontrada");
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
console.log(`Total filas: ${rows.length}`);

// Encabezados están en la fila 0 (verificado en inspección previa).
console.log(`\n📋 Encabezados (fila 0):`);
const headers = (rows[0] as unknown[]).slice(0, 40);
headers.forEach((h, i) => console.log(`   col ${String(i).padStart(2)}: ${JSON.stringify(h).slice(0, 60)}`));

console.log(`\n📋 Datos (fila 1 = primer registro):`);
if (rows[1]) {
  (rows[1] as unknown[]).slice(0, 40).forEach((c, i) => {
    const v = JSON.stringify(c).slice(0, 60);
    if (v !== '""' && v !== "null") console.log(`   col ${String(i).padStart(2)}: ${v}`);
  });
}

// Filtrar filas con OT numérico
const data = rows.slice(1).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));
console.log(`\n📊 OTs con código numérico: ${data.length}`);

// Inventario de valores únicos en columnas de interés
function valoresUnicos(idx: number, label: string) {
  const set = new Map<string, number>();
  for (const r of data) {
    const v = String((r as unknown[])[idx] ?? "").trim();
    if (v && v !== "-") set.set(v, (set.get(v) ?? 0) + 1);
  }
  console.log(`\n   ${label} (col ${idx}) — ${set.size} valores únicos:`);
  [...set.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, n]) => {
    console.log(`     ${String(n).padStart(5)}  ${k}`);
  });
  if (set.size > 20) console.log(`     ... y ${set.size - 20} más`);
}

valoresUnicos(3, "Tipo de Ot");
valoresUnicos(4, "Estrategia");
valoresUnicos(9, "Fabricante");
valoresUnicos(10, "Flota");
valoresUnicos(11, "Posicion");
valoresUnicos(12, "Equipo");
valoresUnicos(24, "Garantia");
valoresUnicos(25, "Atencion reparacion");
valoresUnicos(26, "Clase de Reparacion");
valoresUnicos(27, "Tipo Garantia");
valoresUnicos(28, "Prioridad de atención");
valoresUnicos(30, "Base Metalica");
valoresUnicos(33, "OT Status de Req");
valoresUnicos(35, "Status Taller");
valoresUnicos(36, "Recursos Status");
valoresUnicos(38, "Estado de OT");

// 3 muestras de datos
console.log(`\n📋 Muestras de filas:`);
for (const idx of [0, Math.floor(data.length / 2), data.length - 1]) {
  if (data[idx]) {
    const r = data[idx] as unknown[];
    console.log(`\n   ─── Fila ${idx + 1} (OT ${r[0]}) ───`);
    headers.forEach((h, i) => {
      const v = String(r[i] ?? "").trim();
      if (v && v !== "-") {
        const hStr = String(h).replace(/\s+/g, " ").slice(0, 30).padEnd(30);
        console.log(`     col ${String(i).padStart(2)} ${hStr} = ${v.slice(0, 60)}`);
      }
    });
  }
}

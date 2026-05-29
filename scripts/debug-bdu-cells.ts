// Lee las celdas RAW del Excel por referencia (A1, B1, ...) para ver
// exactamente qué letra de columna corresponde a qué.

import * as XLSX from "xlsx";
import * as path from "node:path";

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const wb = XLSX.readFile(EXCEL_PATH);
const sheet = wb.Sheets["BASE DE DATOS UNI"];

console.log(`📋 Header (fila 2 del Excel = row 2):`);
for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"]) {
  const cell = sheet[`${col}2`];
  console.log(`   ${col}2: ${cell ? JSON.stringify(cell.v) : "(vacío)"}`);
}

// Tomar OT 206123 que el usuario muestra con Plaqueteo=EQ3151
// Buscar fila donde A == 206123
const range = XLSX.utils.decode_range(sheet["!ref"]!);
console.log(`\n🔍 Buscando OT 206123 en col A:`);
for (let r = range.s.r; r <= range.e.r; r++) {
  const cellA = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
  if (cellA && String(cellA.v).trim() === "206123") {
    console.log(`   Encontrada en fila Excel ${r + 1} (row ${r}):`);
    for (const col of ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q"]) {
      const cell = sheet[`${col}${r + 1}`];
      console.log(`     ${col}${r + 1}: ${cell ? JSON.stringify(cell.v) : "(vacío)"}`);
    }
    break;
  }
}

// Verificar si hay celdas mergeadas que confunden la lectura
console.log(`\n📋 Merges (primeros 10):`);
const merges = sheet["!merges"] ?? [];
console.log(`   Total merges: ${merges.length}`);
for (const m of merges.slice(0, 10)) {
  console.log(`   ${XLSX.utils.encode_range(m)}`);
}

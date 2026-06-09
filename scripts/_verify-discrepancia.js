// Verifica si las 2 OTs sin match en BD tienen FECHA EVALUACION en el Excel.
// Eso explicaría 1400 (total) vs 1398 (a importar).
const XLSX = require("xlsx");
const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/Data_data.xlsx";

const wb = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });

const SIN_MATCH = new Set([326425, 330925]);

console.log("OTs SIN MATCH EN BD — datos en Excel:");
for (const r of rows) {
  const ot = Number(String(r["OT"] ?? "").trim());
  if (SIN_MATCH.has(ot)) {
    console.log(`\n  OT ${ot}:`);
    console.log(`    FECHA EVALUACION:           ${r["FECHA EVALUACION"] ?? "(vacío)"}`);
    console.log(`    EVALUADOR:                  ${r["EVALUADOR"] ?? "(vacío)"}`);
    console.log(`    FECHA COTIZACION:           ${r["FECHA COTIZACION"] ?? "(vacío)"}`);
    console.log(`    TIPO DE REPARACION:         ${r["TIPO DE REPARACION"] ?? "(vacío)"}`);
    console.log(`    Reparacion externa:         ${r["Reparacion externa"] ?? "(vacío)"}`);
    console.log(`    Vendor Externo:             ${r["Vendor Externo"] ?? "(vacío)"}`);
    console.log(`    FECHA APROBACION:           ${r["FECHA\r\nAPROBACION"] ?? "(vacío)"}`);
    console.log(`    FECHA FACTURACION:          ${r["FECHA FACTURACIÓN"] ?? "(vacío)"}`);
  }
}

// Conteo bruto: filas con FECHA EVALUACION en el Excel
let conFecha = 0;
for (const r of rows) {
  const v = r["FECHA EVALUACION"];
  if (v != null && String(v).trim() !== "") conFecha++;
}
console.log(`\nTotal filas en Excel con FECHA EVALUACION: ${conFecha}`);
console.log(`Filas a importar (después de match en BD): 1398`);
console.log(`Diferencia explicada: ${conFecha} - 1398 = ${conFecha - 1398}`);

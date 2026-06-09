// Análisis previo (read-only) del Excel Data_data.xlsx vs BD Railway.
// NO escribe nada — solo cuenta matches, valores únicos, conflictos potenciales.
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/Data_data.xlsx";

function parseDate(v) {
  if (v == null || v === "") return null;
  // Formato observado: "5/22/25" → M/D/YY
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy = 2000 + yyyy;
  const mm = String(Number(m[1])).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

(async () => {
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });
  console.log(`EXCEL ROWS: ${rows.length}`);

  // Valores únicos clave
  const tipos = new Set();
  const repExt = new Set();
  const evaluadores = new Set();
  const aproPor = new Set();
  const vendors = new Set();
  let conRepExtSi = 0;
  let conVendor = 0;
  for (const r of rows) {
    if (r["TIPO DE REPARACION"]) tipos.add(r["TIPO DE REPARACION"]);
    if (r["Reparacion externa"]) repExt.add(r["Reparacion externa"]);
    if (r["EVALUADOR"]) evaluadores.add(r["EVALUADOR"]);
    if (r["EVALUACION APROBADO POR"]) aproPor.add(r["EVALUACION APROBADO POR"]);
    if (r["Vendor Externo"]) vendors.add(r["Vendor Externo"]);
    if (String(r["Reparacion externa"] ?? "").toLowerCase() === "si") conRepExtSi++;
    if (r["Vendor Externo"]) conVendor++;
  }

  console.log("\nVALORES ÚNICOS:");
  console.log(`  TIPO DE REPARACION (${tipos.size}):`, [...tipos]);
  console.log(`  Reparacion externa (${repExt.size}):`, [...repExt]);
  console.log(`  EVALUADOR (${evaluadores.size}):`, [...evaluadores].slice(0, 15));
  console.log(`  EVALUACION APROBADO POR (${aproPor.size}):`, [...aproPor]);
  console.log(`  Vendor Externo (${vendors.size}):`, [...vendors]);
  console.log(`  Conteo "Si" en Reparacion externa: ${conRepExtSi}`);
  console.log(`  Conteo con Vendor Externo: ${conVendor}`);

  // Validación de fechas — cuántas no parsean
  const camposFecha = [
    "FECHA EVALUACION",
    "FECHA APROBACION EVALUACION",
    "FECHA COTIZACION",
    "FECHA\r\nAPROBACION",
    "FECHA FACTURACIÓN",
  ];
  console.log("\nVALIDACIÓN FECHAS:");
  for (const c of camposFecha) {
    let conValor = 0;
    let noParsea = 0;
    const samples = [];
    for (const r of rows) {
      const v = r[c];
      if (v == null || v === "") continue;
      conValor++;
      const p = parseDate(v);
      if (!p) {
        noParsea++;
        if (samples.length < 5) samples.push(v);
      }
    }
    console.log(`  ${c}: ${conValor} con valor, ${noParsea} no parsean${noParsea ? ` (ej: ${samples.join(", ")})` : ""}`);
  }

  // Match OTs contra la BD
  const p = new PrismaClient();
  const otsExcel = rows
    .map((r) => Number(String(r["OT"] ?? "").trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  console.log(`\nOTs EN EXCEL: ${otsExcel.length} (únicas: ${new Set(otsExcel).size})`);

  const otsDB = await p.ordenTrabajo.findMany({
    where: { ot: { in: [...new Set(otsExcel)] } },
    select: { id: true, ot: true, tipo_codigo: true, fecha_evaluacion: true, evaluador: true, fecha_cotizacion: true, fecha_aprobacion: true, fecha_facturacion: true, tipo_reparacion_codigo: true, reparacion_externa: true },
  });
  const dbByOt = new Map(otsDB.map((o) => [o.ot, o]));
  console.log(`MATCHES EN BD: ${otsDB.length} / ${new Set(otsExcel).size}`);

  // OTs Excel que NO están en BD
  const noMatch = [...new Set(otsExcel)].filter((ot) => !dbByOt.has(ot));
  console.log(`OTs EN EXCEL SIN MATCH EN BD: ${noMatch.length}`);
  if (noMatch.length > 0 && noMatch.length < 30) console.log(`  Ej:`, noMatch.slice(0, 15));

  // Conflictos: OTs con datos PREEXISTENTES que sobreescribiríamos
  console.log("\nCONFLICTOS (OTs en BD con datos previos):");
  let conflictosEval = 0, conflictosCotiz = 0, conflictosApro = 0, conflictosFact = 0, conflictosTipo = 0, conflictosVendor = 0;
  for (const o of otsDB) {
    if (o.fecha_evaluacion) conflictosEval++;
    if (o.fecha_cotizacion) conflictosCotiz++;
    if (o.fecha_aprobacion) conflictosApro++;
    if (o.fecha_facturacion) conflictosFact++;
    if (o.tipo_reparacion_codigo && o.tipo_reparacion_codigo !== "Parcial") conflictosTipo++;
    if (o.reparacion_externa) conflictosVendor++;
  }
  console.log(`  fecha_evaluacion preexistente: ${conflictosEval}`);
  console.log(`  fecha_cotizacion preexistente: ${conflictosCotiz}`);
  console.log(`  fecha_aprobacion preexistente: ${conflictosApro}`);
  console.log(`  fecha_facturacion preexistente: ${conflictosFact}`);
  console.log(`  tipo_reparacion != 'Parcial' preexistente: ${conflictosTipo}`);
  console.log(`  reparacion_externa = true preexistente: ${conflictosVendor}`);

  await p.$disconnect();
})();

// Import del Excel Data_data.xlsx hacia OT externa en Railway.
//
// Defaults a DRY-RUN — no escribe nada. Para ejecutar:
//   node scripts/import-data-data-excel.js --apply
//
// Comportamiento:
//   - Matchea OTs por el campo `ot` INTEGER (NNNNYY).
//   - OTs existentes → UPDATE de los campos del Excel.
//   - OTs nuevas (no en BD) → CREATE con datos del Excel + defaults mínimos
//     (tipo REP, status Abierta, comentario flag para revisar después).
//   - Campos:
//       fecha_evaluacion, evaluador, fecha_cotizacion, fecha_aprobacion,
//       fecha_facturacion, reparacion_externa, vendor_externo,
//       caracteristica_cilindro
//   - tipo_reparacion_codigo: NO se toca (queda como está en BD).
//   - fecha_aprobacion_evaluacion / evaluacion_aprobado_por: el Excel los
//     trae 100% vacíos, se skipean.
//   - Para fechas vacías o malformadas en el UPDATE: deja el campo como está
//     (no sobreescribe con null — política conservadora).
//   - Para reparacion_externa: solo escribe true cuando Excel dice "Si".
//   - Vendor Externo: solo cuando hay valor.
//
// Resumen al final con conteos por campo + sample de updates + creates.
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const FILE = "C:/Users/cesar/OneDrive/Desktop/ERP-HpyK/Ramas/cambi/Cloudflare/Excels_HPK/Data_data.xlsx";
const APPLY = process.argv.includes("--apply");

function parseDate(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy = 2000 + yyyy;
  const mm = String(Number(m[1])).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
}

function normCaracteristica(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (!s) return null;
  if (s === "ESTANDAR" || s === "ESTÁNDAR") return "ESTANDAR";
  if (s === "NO ESTANDAR" || s === "NO_ESTANDAR" || s === "NO ESTÁNDAR") return "NO_ESTANDAR";
  return s;
}

// Extrae los campos del Excel a un objeto data{} y suma a stats[]. Devuelve
// el objeto data (puede estar vacío si la fila no tiene info útil).
function mapearCampos(r, stats) {
  const data = {};

  const fEval = parseDate(r["FECHA EVALUACION"]);
  if (fEval) { data.fecha_evaluacion = fEval; stats.fecha_evaluacion++; }

  const evaluador = String(r["EVALUADOR"] ?? "").trim();
  if (evaluador) { data.evaluador = evaluador; stats.evaluador++; }

  const fCotiz = parseDate(r["FECHA COTIZACION"]);
  if (fCotiz) { data.fecha_cotizacion = fCotiz; stats.fecha_cotizacion++; }

  const fApro = parseDate(r["FECHA\r\nAPROBACION"] ?? r["FECHA APROBACION"]);
  if (fApro) { data.fecha_aprobacion = fApro; stats.fecha_aprobacion++; }

  const fFact = parseDate(r["FECHA FACTURACIÓN"] ?? r["FECHA FACTURACION"]);
  if (fFact) { data.fecha_facturacion = fFact; stats.fecha_facturacion++; }

  const repExt = String(r["Reparacion externa"] ?? "").trim().toLowerCase();
  if (repExt === "si" || repExt === "sí") { data.reparacion_externa = true; stats.reparacion_externa++; }

  const vendor = String(r["Vendor Externo"] ?? "").trim();
  if (vendor) { data.vendor_externo = vendor; stats.vendor_externo++; }

  const caract = normCaracteristica(r["TIPO DE REPARACION"]);
  if (caract) { data.caracteristica_cilindro = caract; stats.caracteristica_cilindro++; }

  return data;
}

(async () => {
  const wb = XLSX.readFile(FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: false });

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  IMPORT Data_data.xlsx → OT externa                      ║`);
  console.log(`║  Modo: ${APPLY ? "APPLY (escribe en BD)" : "DRY-RUN (no escribe)"}${" ".repeat(APPLY ? 28 : 30)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`Filas en Excel: ${rows.length}`);

  const p = new PrismaClient();

  const otsExcel = [...new Set(rows.map((r) => Number(String(r["OT"] ?? "").trim())).filter((n) => Number.isFinite(n) && n > 0))];
  const otsDB = await p.ordenTrabajo.findMany({
    where: { ot: { in: otsExcel } },
    select: { id: true, ot: true },
  });
  const dbByOt = new Map(otsDB.map((o) => [o.ot, o.id]));
  console.log(`Matches en BD: ${otsDB.length} / ${otsExcel.length}`);

  const updates = [];
  const creates = []; // OTs nuevas a insertar
  const stats = {
    fecha_evaluacion: 0,
    evaluador: 0,
    fecha_cotizacion: 0,
    fecha_aprobacion: 0,
    fecha_facturacion: 0,
    reparacion_externa: 0,
    vendor_externo: 0,
    caracteristica_cilindro: 0,
  };

  for (const r of rows) {
    const otNum = Number(String(r["OT"] ?? "").trim());
    if (!Number.isFinite(otNum) || otNum <= 0) continue;
    const id = dbByOt.get(otNum);
    const data = mapearCampos(r, stats);
    if (Object.keys(data).length === 0) continue;

    if (id == null) {
      // OT nueva — agrego defaults mínimos para que la fila sea válida.
      creates.push({
        otNum,
        data: {
          ...data,
          ot: otNum,
          anio: otNum % 100,
          tipo_codigo: "REP", // mayoritario en el Excel
          activo: true,
          cantidad: 1,
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "En revision procesos",
          taller_status_codigo: "Pdt Evaluación",
          usuario_crea: "import-data-data",
          comentarios: "OT importada desde Excel Data_data.xlsx — completar datos faltantes (cliente, cod_rep, equipo, etc.)",
        },
      });
    } else {
      updates.push({ id, otNum, data });
    }
  }

  console.log(`\nUpdates a realizar:  ${updates.length}`);
  console.log(`Creates a realizar:  ${creates.length}${creates.length > 0 ? ` (OTs: ${creates.map((c) => c.otNum).join(", ")})` : ""}`);

  console.log(`\nConteo total por campo (updates + creates):`);
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }

  console.log(`\nMuestra de los primeros 3 updates:`);
  for (const u of updates.slice(0, 3)) {
    console.log(`  UPDATE ot=${u.otNum} (id=${u.id}):`);
    for (const [k, v] of Object.entries(u.data)) {
      const display = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
      console.log(`    ${k.padEnd(28)} ${display}`);
    }
  }

  if (creates.length > 0) {
    console.log(`\nDetalle COMPLETO de los ${creates.length} creates:`);
    for (const c of creates) {
      console.log(`  CREATE ot=${c.otNum}:`);
      for (const [k, v] of Object.entries(c.data)) {
        const display = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
        console.log(`    ${k.padEnd(28)} ${display}`);
      }
    }
  }

  if (!APPLY) {
    console.log(`\n══ DRY-RUN ══ Nada se escribió. Para aplicar: node scripts/import-data-data-excel.js --apply`);
    await p.$disconnect();
    return;
  }

  // CREATES primero (separado de updates por consistencia: si algo falla,
  // sabés exactamente qué pasó).
  if (creates.length > 0) {
    console.log(`\n>>> CREANDO ${creates.length} OTs nuevas...`);
    for (const c of creates) {
      await p.ordenTrabajo.create({ data: c.data });
      console.log(`  ✓ ot=${c.otNum} creada`);
    }
  }

  console.log(`\n>>> APLICANDO ${updates.length} updates en lotes de 100...`);
  let aplicados = 0;
  const LOTE = 100;
  for (let i = 0; i < updates.length; i += LOTE) {
    const batch = updates.slice(i, i + LOTE);
    await p.$transaction(
      batch.map((u) =>
        p.ordenTrabajo.update({ where: { id: u.id }, data: u.data })
      ),
      { timeout: 60_000 },
    );
    aplicados += batch.length;
    process.stdout.write(`\r  ${aplicados}/${updates.length}`);
  }
  console.log(`\n✓ ${aplicados} OTs actualizadas.`);

  await p.$disconnect();
})().catch(async (e) => {
  console.error("\n✗ ERROR:", e);
  process.exit(1);
});

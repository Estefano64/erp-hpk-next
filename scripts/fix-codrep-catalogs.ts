/**
 * One-shot: re-aligns CategoriaCodRep, FlotaEquipo, adds ModeloEvaluacion,
 * and re-seeds CodigoReparacion from the Excel source of truth.
 *
 * Safe to run multiple times (idempotent).
 */
import { createRequire } from "module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const EXCEL = "C:/Users/HP/Desktop/erp_data/5. Cod Rep.xlsx";
const p = new PrismaClient();

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  return s;
}

function parseDecimal(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  // 1. Leer Excel
  const wb = XLSX.readFile(EXCEL);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Cod Rep"], {
    header: 1,
    defval: null,
    raw: false,
  });

  // Headers at row 1, data from row 2
  // Cols: Usuario, (empty codigo), Descripcion, Tipo, DescripcionTipo, Categoria, Flota, Fabricante, NP, Posicion, Precio, Moneda, Reemplaza, NP_reemplaza
  const dataRows = rows.slice(2).filter((r) => r && r.some((c) => c != null && String(c).trim()));
  console.log(`Excel: ${dataRows.length} filas de CodRep`);

  const tipos = new Set<string>();
  const modelos = new Set<string>();
  const categorias = new Set<string>();
  const flotas = new Set<string>();
  const fabricantes = new Set<string>();
  const posiciones = new Set<string>();
  const monedas = new Set<string>();
  for (const r of dataRows) {
    const tipo = clean(r[3]);
    const modelo = clean(r[4]);
    const cat = clean(r[5]);
    const flota = clean(r[6]);
    const fab = clean(r[7]);
    const pos = clean(r[9]);
    const mon = clean(r[11]);
    if (tipo) tipos.add(tipo);
    if (modelo) modelos.add(modelo);
    if (cat) categorias.add(cat);
    if (flota) flotas.add(flota);
    if (fab) fabricantes.add(fab);
    if (pos) posiciones.add(pos);
    if (mon) monedas.add(mon);
  }
  console.log("Valores únicos detectados:");
  console.log(`  Tipos: ${[...tipos].sort().join(", ")}`);
  console.log(`  Modelos: ${[...modelos].sort().join(", ")}`);
  console.log(`  Categorías: ${[...categorias].sort().join(", ")}`);
  console.log(`  Flotas (${flotas.size}): ${[...flotas].sort().join(", ")}`);
  console.log(`  Fabricantes: ${[...fabricantes].sort().join(", ")}`);
  console.log(`  Posiciones: ${[...posiciones].sort().join(", ")}`);
  console.log(`  Monedas: ${[...monedas].sort().join(", ")}`);

  // 2. Capturar dependencias actuales (OT + Contratos apuntando a CodRep)
  const otsConCR = await p.ordenTrabajo.findMany({
    where: { id_cod_rep: { not: null } },
    select: { id: true, id_cod_rep: true, codigo_reparacion: { select: { np: true, descripcion: true } } },
  });
  const contratosConCR = await p.contrato.findMany({
    where: { cod_rep_id: { not: null } },
    select: { id: true, cod_rep_id: true, codigo_reparacion: { select: { np: true, descripcion: true } } },
  });
  console.log(`\nRefs actuales: ${otsConCR.length} OT + ${contratosConCR.length} Contratos`);
  for (const o of otsConCR) console.log(`  OT#${o.id} → CodRep NP=${o.codigo_reparacion?.np}`);
  for (const c of contratosConCR) console.log(`  Contrato#${c.id} → CodRep NP=${c.codigo_reparacion?.np}`);

  // 3. Transacción: limpiar + reseedear
  await p.$transaction(async (tx) => {
    // Temp: NULL las refs que apuntan a CodRep
    await tx.ordenTrabajo.updateMany({ where: { id_cod_rep: { not: null } }, data: { id_cod_rep: null } });
    await tx.contrato.updateMany({ where: { cod_rep_id: { not: null } }, data: { cod_rep_id: null } });

    // Borrar CodRep y luego catálogos mal usados
    await tx.codigoReparacion.deleteMany({});

    // CategoriaCodRep viejo: borrar CHVS/CHP/... (quedarán solo después de reseed correcto)
    await tx.categoriaCodRep.deleteMany({});

    // FlotaEquipo viejo: borrar CAM/MOT/... (antes de re-seed)
    await tx.flotaEquipo.deleteMany({});

    // Seed Tipos CodRep faltantes (ENR, LIN)
    const tiposData = [
      { codigo: "CIL", nombre: "Cilindro" },
      { codigo: "ACU", nombre: "Acumulador" },
      { codigo: "FRE", nombre: "Freno" },
      { codigo: "RUE", nombre: "Rueda" },
      { codigo: "ENR", nombre: "Enrollador" },
      { codigo: "LIN", nombre: "Links" },
    ];
    for (const t of tiposData) await tx.tipoCodRep.upsert({ where: { codigo: t.codigo }, update: { nombre: t.nombre }, create: t });

    // Seed ModeloEvaluacion (9 subtipos del Excel hoja Descripcion tipo)
    const modelosData = [
      { codigo: "CHVS", nombre: "Cilindro hidráulico vástago simple" },
      { codigo: "CHP", nombre: "Cilindro hidráulico pivotado" },
      { codigo: "CHPDV", nombre: "Cilindro hidráulico de pistón de doble vástago" },
      { codigo: "CHT", nombre: "Cilindro hidráulico telescópico" },
      { codigo: "AE", nombre: "Acumulador de émbolo" },
      { codigo: "AV", nombre: "Acumulador de vejiga" },
      { codigo: "RD", nombre: "Rueda delantera" },
      { codigo: "FS", nombre: "Freno de servicio" },
      { codigo: "SD", nombre: "Suspensión delantera" },
    ];
    for (const m of modelosData) await tx.modeloEvaluacion.upsert({ where: { codigo: m.codigo }, update: { nombre: m.nombre }, create: m });

    // Seed CategoriaCodRep correcta (CAM/MOT/TRU/TOR/EXC/PER)
    const categoriasData = [
      { codigo: "CAM", nombre: "Camión" },
      { codigo: "MOT", nombre: "Motoniveladora" },
      { codigo: "TRU", nombre: "Tractor de Ruedas" },
      { codigo: "TOR", nombre: "Tractor de Orugas" },
      { codigo: "EXC", nombre: "Excavadora" },
      { codigo: "PER", nombre: "Perforadora" },
    ];
    for (const c of categoriasData) await tx.categoriaCodRep.upsert({ where: { codigo: c.codigo }, update: { nombre: c.nombre }, create: c });

    // Seed FlotaEquipo (42 modelos reales del Excel)
    for (const flota of [...flotas].sort()) {
      await tx.flotaEquipo.upsert({
        where: { codigo: flota },
        update: { nombre: flota },
        create: { codigo: flota, nombre: flota },
      });
    }

    // Re-insertar CodigoReparacion desde Excel, preservando codigo CR-XXXX en orden
    let counter = 1;
    for (const r of dataRows) {
      const desc = clean(r[2]) ?? "(sin descripción)";
      const tipo = clean(r[3]);
      const modelo = clean(r[4]);
      const cat = clean(r[5]);
      const flota = clean(r[6]);
      const fab = clean(r[7]);
      const np = clean(r[8]);
      const pos = clean(r[9]);
      const precio = parseDecimal(r[10]);
      const moneda = clean(r[11]);
      const reemplazaFlag = clean(r[12]);
      const npReemplaza = clean(r[13]);
      if (!tipo || !cat || !flota) {
        console.warn(`  Skipping fila sin tipo/cat/flota:`, { desc, tipo, cat, flota });
        continue;
      }

      const codigo = `CR-${String(counter).padStart(4, "0")}`;
      await tx.codigoReparacion.create({
        data: {
          codigo,
          descripcion: desc,
          tipo_codigo: tipo,
          categoria_codigo: cat,
          flota_codigo: flota,
          modelo_evaluacion_codigo: modelo,
          fabricante_codigo: fab,
          np,
          posicion_codigo: pos,
          precio,
          moneda_codigo: moneda,
          np_reemplaza: npReemplaza,
          reemplaza: reemplazaFlag === "REEMPLAZA",
        },
      });
      counter++;
    }
    console.log(`\nCodRep reinsertadas: ${counter - 1}`);

    // Re-vincular OTs y Contratos por NP
    for (const o of otsConCR) {
      const np = o.codigo_reparacion?.np;
      if (!np) continue;
      const nuevo = await tx.codigoReparacion.findFirst({ where: { np } });
      if (nuevo) {
        await tx.ordenTrabajo.update({ where: { id: o.id }, data: { id_cod_rep: nuevo.cod_rep_id } });
        console.log(`  OT#${o.id} re-vinculada → CodRep#${nuevo.cod_rep_id} (NP=${np})`);
      } else {
        console.warn(`  OT#${o.id} quedó huérfana (NP=${np} no existe en nueva data)`);
      }
    }
    for (const c of contratosConCR) {
      const np = c.codigo_reparacion?.np;
      if (!np) continue;
      const nuevo = await tx.codigoReparacion.findFirst({ where: { np } });
      if (nuevo) {
        await tx.contrato.update({ where: { id: c.id }, data: { cod_rep_id: nuevo.cod_rep_id } });
        console.log(`  Contrato#${c.id} re-vinculado → CodRep#${nuevo.cod_rep_id} (NP=${np})`);
      } else {
        console.warn(`  Contrato#${c.id} quedó huérfano (NP=${np} no existe en nueva data)`);
      }
    }
  }, { timeout: 60000 });

  // Verificación final
  const finalCounts = {
    TipoCodRep: await p.tipoCodRep.count(),
    ModeloEvaluacion: await p.modeloEvaluacion.count(),
    CategoriaCodRep: await p.categoriaCodRep.count(),
    FlotaEquipo: await p.flotaEquipo.count(),
    CodigoReparacion: await p.codigoReparacion.count(),
  };
  console.log("\n=== CONTEOS FINALES ===");
  console.log(finalCounts);

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// scripts/wipe-ots-no-en-bdu-railway.ts
//
// Limpia las OTs históricas (las que están en BASE DE DATOS UNI = BDU) para
// que SOLO contengan datos provenientes de esa hoja. Decisión del usuario:
// BDU es la única fuente de verdad para las OTs históricas.
//
// Las OTs NUEVAS (creadas por usuarios reales, que no están en BDU) NO se
// tocan. El filtro es: solo OTs cuyo `ot` está en el set de OTs de BDU.
//
// DOS FASES:
//
// Fase 1 — Sync per-row de campos que BDU sí tiene (3046 OTs):
//   * Para cada campo: si BDU tiene valor para esa OT, dejarlo como está;
//     si BDU está vacío para esa OT, poner null en la DB.
//   * Campos: np, id_viajero, po_cliente, wo_cliente, guia_remision,
//     fecha_recepcion, pcr, horas, monto_cotizacion.
//
// Fase 2 — Wipe global (3046 OTs):
//   * Campos que BDU NO tiene en absoluto, se ponen null en TODAS las 3046 OTs.
//   * Lista abajo en CAMPOS_SIN_BDU.
//
// Uso:
//   npx tsx scripts/wipe-ots-no-en-bdu-railway.ts            (DRY-RUN)
//   npx tsx scripts/wipe-ots-no-en-bdu-railway.ts --apply    (escribe)

import { PrismaClient, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const APPLY = process.argv.includes("--apply");

// Campos que BDU NO trae en absoluto (ni siquiera la columna existe, o está
// 100% vacía). Se ponen null para las 3046 OTs históricas.
const CAMPOS_SIN_BDU = [
  // Proceso de evaluación
  "fecha_evaluacion", "evaluador",
  "nro_informe_evaluacion", "fecha_entrega_informe", "dias_evaluacion",
  "fecha_req_1", "fecha_req_2",
  // Cotización
  "fecha_cotizacion", "dias_cotizacion", "nro_cotizacion",
  // Aprobación
  "fecha_aprobacion", "dias_aprobacion",
  // Entrega
  "fecha_entrega", "cumplimiento", "dias_proceso",
  "nro_informe_entrega", "guia_entrega_salida",
  // Facturación
  "nro_factura", "fecha_facturacion", "dias_en_taller",
  // Columnas vacías en BDU
  "ns", "plaqueteo", "empresa_entrega",
  "base_metalica_codigo", "comentarios",
  "fecha_requerimiento_cliente", "fecha_reprogramada",
  "atencion_reparacion_codigo", "tipo_garantia_codigo",
  "prioridad_atencion_codigo", "contrato_dias",
] as const;

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return null;
  return s;
}

function cleanNum(v: unknown): number | null {
  const s = clean(v);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function excelDateToJs(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 32874 || n > 73415) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + n * 86400000);
}

interface BduRow {
  ot: number;
  np: string | null;
  id_viajero: string | null;
  po_cliente: string | null;
  wo_cliente: string | null;
  guia_remision: string | null;
  fecha_recepcion: Date | null;
  pcr: number | null;
  horas: number | null;
  monto_cotizacion: number | null;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY (escribe)" : "🟡 DRY-RUN"}\n`);

  // ── 1. Leer BDU y construir map ───────────────────────────────────────
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rawRows.slice(1).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  const bduMap = new Map<number, BduRow>();
  for (const r of dataRows) {
    const row = r as unknown[];
    const ot = parseInt(String(row[0]).trim(), 10);
    if (!Number.isFinite(ot)) continue;
    bduMap.set(ot, {
      ot,
      np: clean(row[7]),
      id_viajero: clean(row[15]),
      po_cliente: clean(row[16]),
      wo_cliente: clean(row[17]),
      guia_remision: clean(row[18]),
      fecha_recepcion: excelDateToJs(row[20]),
      pcr: cleanNum(row[21]),
      horas: cleanNum(row[22]),
      monto_cotizacion: cleanNum(row[37]),
    });
  }
  console.log(`📊 BDU: ${bduMap.size} OTs históricas`);

  // ── 2. Cargar las OTs de Railway que matchean ─────────────────────────
  const otNums = [...bduMap.keys()];
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNums } },
    select: {
      id: true, ot: true,
      np: true, id_viajero: true, po_cliente: true, wo_cliente: true,
      guia_remision: true, fecha_recepcion: true, pcr: true, horas: true,
      monto_cotizacion: true,
    },
  });
  console.log(`📊 OTs en Railway en BDU:                  ${otsDb.length}`);

  // ── 3. Fase 1: calcular sync per-row de campos que BDU sí tiene ───────
  const updates: Array<{ id: number; ot: number; data: Record<string, unknown> }> = [];
  const cambiosPorCampo: Record<string, number> = {};

  for (const db of otsDb) {
    if (db.ot == null) continue;
    const xl = bduMap.get(db.ot);
    if (!xl) continue;
    const data: Record<string, unknown> = {};

    // Para cada campo: si BDU tiene valor y es distinto al de DB, actualizar.
    // Si BDU está vacío y DB tiene valor, NULL.
    function diff<K extends string>(
      key: K,
      xlVal: string | number | Date | null,
      dbVal: unknown,
    ) {
      // Comparación: convertir ambos a string para detectar cambios.
      const xlStr = xlVal == null ? "" :
        xlVal instanceof Date ? xlVal.toISOString().slice(0, 10) :
        String(xlVal);
      const dbStr = dbVal == null ? "" :
        dbVal instanceof Date ? dbVal.toISOString().slice(0, 10) :
        typeof dbVal === "object" && dbVal !== null && "toString" in dbVal
          ? String(dbVal) // Decimal
          : String(dbVal);
      if (xlStr === dbStr) return;
      data[key] = xlVal == null
        ? null
        : (typeof xlVal === "number" ? new Prisma.Decimal(xlVal) : xlVal);
      cambiosPorCampo[key] = (cambiosPorCampo[key] ?? 0) + 1;
    }

    diff("np", xl.np, db.np);
    diff("id_viajero", xl.id_viajero, db.id_viajero);
    diff("po_cliente", xl.po_cliente, db.po_cliente);
    diff("wo_cliente", xl.wo_cliente, db.wo_cliente);
    diff("guia_remision", xl.guia_remision, db.guia_remision);
    diff("fecha_recepcion", xl.fecha_recepcion, db.fecha_recepcion);
    diff("pcr", xl.pcr, db.pcr);
    diff("horas", xl.horas, db.horas);
    diff("monto_cotizacion", xl.monto_cotizacion, db.monto_cotizacion);

    if (Object.keys(data).length > 0) {
      updates.push({ id: db.id, ot: db.ot, data });
    }
  }

  console.log(`\n📊 Fase 1 — Sync per-row (campos en BDU):`);
  console.log(`   OTs con cambios:                         ${updates.length}`);
  for (const [k, n] of Object.entries(cambiosPorCampo).sort()) {
    console.log(`     ${k.padEnd(22)} ${n}`);
  }

  // ── 4. Fase 2: wipe de campos sin BDU ─────────────────────────────────
  console.log(`\n📊 Fase 2 — Wipe de campos sin BDU:`);
  // Solo contamos cuántas OTs tienen al menos un campo con dato (a borrar).
  const wipeData: Record<string, null> = {};
  for (const k of CAMPOS_SIN_BDU) wipeData[k] = null;
  console.log(`   Campos a NULL en las ${otsDb.length} OTs:`);
  for (const k of CAMPOS_SIN_BDU) {
    const count = await prisma.ordenTrabajo.count({
      where: { AND: [{ ot: { in: otNums } }, { NOT: { [k]: null } }] },
    });
    console.log(`     ${k.padEnd(35)} ${count} OTs tienen dato actualmente`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/wipe-ots-no-en-bdu-railway.ts --apply`);
    return;
  }

  // ── 5. Apply Fase 1 ──────────────────────────────────────────────────
  console.log(`\n🔴 Fase 1: aplicando ${updates.length} updates per-row...`);
  let i = 0;
  for (const u of updates) {
    await prisma.ordenTrabajo.update({ where: { id: u.id }, data: u.data });
    i++;
    if (i % 500 === 0) console.log(`   ${i}/${updates.length}`);
  }

  // ── 6. Apply Fase 2 ──────────────────────────────────────────────────
  console.log(`\n🔴 Fase 2: wipe global a las ${otsDb.length} OTs históricas...`);
  const r = await prisma.ordenTrabajo.updateMany({
    where: { ot: { in: otNums } },
    data: wipeData,
  });
  console.log(`   ✓ ${r.count} OTs actualizadas con null en ${CAMPOS_SIN_BDU.length} campos`);

  console.log(`\n✅ Wipe completado`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

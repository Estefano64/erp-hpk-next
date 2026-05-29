// scripts/reimport-ots-from-uni-railway.ts
//
// Re-importa los campos faltantes desde la hoja "BASE DE DATOS UNI" del
// Excel CABECERA_LOG... — esta hoja tiene MÁS columnas que las que el
// import original usó.
//
// SOLO toca las OTs cuyo número está en el Excel (3047 OTs históricas).
// Las OTs nuevas (creadas por usuarios en este momento) NO se tocan.
//
// Campos que actualiza:
//   - tipo_reparacion_codigo  ← col 3  "Tipo de Ot" = "Parcial"
//   - cod_rep_flota           ← col 10 "Flota" (solo si Railway lo tiene null)
//   - cod_rep_posicion        ← col 11 "Posicion"
//   - equipo_codigo           ← col 12 "Equipo" (DZ009, EQ7106, etc.)
//   - garantia_codigo         ← col 24 "Garantia" (SI/NO)
//   - taller_status_codigo    ← col 35 "Status Taller" (con mapeo)
//   - recursos_status_codigo  ← col 36 "Recursos Status" (con mapeo)
//   - ot_status_codigo        ← col 38 "Estado de OT" (con mapeo)
//
// Uso:
//   npx tsx scripts/reimport-ots-from-uni-railway.ts            (DRY-RUN)
//   npx tsx scripts/reimport-ots-from-uni-railway.ts --apply    (escribe)

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../CABECERA_LOG_Y_OPERACIONES_CORREGIDO(2)(1).xlsx");
const APPLY = process.argv.includes("--apply");

// Mapeos de Excel → códigos del catálogo en Railway
const RECURSOS_STATUS_MAP: Record<string, string> = {
  "Recursos Completados": "Recursos completos",
  "En revision de procesos": "En revision procesos",
  "En cotizacion de RQ": "En cotización",
};

const OT_STATUS_MAP: Record<string, string> = {
  "Cerrada": "Cerrada",
  "Abierto": "Abierta",
  "No ejecutado": "No Ejecutada",
};

const TALLER_STATUS_MAP: Record<string, string> = {
  "COBRANZA": "Cobranza",
  "DEVOLUCION": "Pdt proceso",
  "DEVOLUCIÓN": "Pdt proceso",
  "STOCK": "Pdt proceso",
  "LISTO PARA DESPACHO": "Terminado",
  "ENTREGADO": "Entregado",
  "PROCESO": "Pdt proceso",
  "ARMADO": "Programado Proceso",
  "EVALUACION": "Pdt Evaluación",
  "EVALUACIÓN": "Pdt Evaluación",
  "PROGRAMADO": "Programado Proceso",
  "STAND BY": "Pdt Evaluación",
};

const GARANTIA_MAP: Record<string, string> = {
  "SI": "Si",
  "NO": "No",
};

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "—") return null;
  return s;
}

interface ExcelRow {
  ot: number;
  tipo_reparacion?: string | null;
  cod_rep_flota?: string | null;
  cod_rep_posicion?: string | null;
  equipo_codigo?: string | null;
  garantia?: string | null;
  taller_status?: string | null;
  recursos_status?: string | null;
  ot_status?: string | null;
}

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY (escribe)" : "🟡 DRY-RUN"}\n`);

  // ── 1. Leer Excel ─────────────────────────────────────────────────────
  const wb = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets["BASE DE DATOS UNI"];
  if (!sheet) throw new Error("Hoja 'BASE DE DATOS UNI' no encontrada");
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const dataRows = rawRows.slice(1).filter((r) => /^\d+$/.test(String((r as unknown[])[0] ?? "").trim()));

  const excelMap = new Map<number, ExcelRow>();
  const valoresSinMapeo = {
    tallerStatus: new Map<string, number>(),
    recursosStatus: new Map<string, number>(),
    otStatus: new Map<string, number>(),
  };

  for (const r of dataRows) {
    const row = r as unknown[];
    const ot = parseInt(String(row[0]).trim(), 10);
    if (!Number.isFinite(ot)) continue;

    const tipo = clean(row[3]);
    const flota = clean(row[10]);
    const posicion = clean(row[11]);
    const equipo = clean(row[12]);
    const garantia = clean(row[24]);
    const tallerRaw = clean(row[35]);
    const recursosRaw = clean(row[36]);
    const otStatusRaw = clean(row[38]);

    // Mapear con catálogo
    const tallerMapeado = tallerRaw ? TALLER_STATUS_MAP[tallerRaw.toUpperCase()] ?? null : null;
    if (tallerRaw && !tallerMapeado) {
      valoresSinMapeo.tallerStatus.set(tallerRaw, (valoresSinMapeo.tallerStatus.get(tallerRaw) ?? 0) + 1);
    }
    const recursosMapeado = recursosRaw ? RECURSOS_STATUS_MAP[recursosRaw] ?? null : null;
    if (recursosRaw && !recursosMapeado) {
      valoresSinMapeo.recursosStatus.set(recursosRaw, (valoresSinMapeo.recursosStatus.get(recursosRaw) ?? 0) + 1);
    }
    const otStatusMapeado = otStatusRaw ? OT_STATUS_MAP[otStatusRaw] ?? null : null;
    if (otStatusRaw && !otStatusMapeado) {
      valoresSinMapeo.otStatus.set(otStatusRaw, (valoresSinMapeo.otStatus.get(otStatusRaw) ?? 0) + 1);
    }
    const garantiaMapeada = garantia ? GARANTIA_MAP[garantia.toUpperCase()] ?? null : null;

    excelMap.set(ot, {
      ot,
      tipo_reparacion: tipo,
      cod_rep_flota: flota,
      cod_rep_posicion: posicion,
      equipo_codigo: equipo,
      garantia: garantiaMapeada,
      taller_status: tallerMapeado,
      recursos_status: recursosMapeado,
      ot_status: otStatusMapeado,
    });
  }

  console.log(`📊 Excel BASE DE DATOS UNI: ${excelMap.size} OTs con código numérico`);
  if (valoresSinMapeo.tallerStatus.size > 0) {
    console.log(`   ⚠️  Status Taller sin mapeo:`);
    valoresSinMapeo.tallerStatus.forEach((n, v) => console.log(`     ${n}× "${v}"`));
  }
  if (valoresSinMapeo.recursosStatus.size > 0) {
    console.log(`   ⚠️  Recursos Status sin mapeo:`);
    valoresSinMapeo.recursosStatus.forEach((n, v) => console.log(`     ${n}× "${v}"`));
  }
  if (valoresSinMapeo.otStatus.size > 0) {
    console.log(`   ⚠️  Estado OT sin mapeo:`);
    valoresSinMapeo.otStatus.forEach((n, v) => console.log(`     ${n}× "${v}"`));
  }

  // ── 2. Cargar las OTs de Railway que matchean ─────────────────────────
  const otNums = [...excelMap.keys()];
  const otsDb = await prisma.ordenTrabajo.findMany({
    where: { ot: { in: otNums } },
    select: {
      id: true, ot: true,
      tipo_reparacion_codigo: true,
      cod_rep_flota: true,
      cod_rep_posicion: true,
      equipo_codigo: true,
      garantia_codigo: true,
      taller_status_codigo: true,
      recursos_status_codigo: true,
      ot_status_codigo: true,
    },
  });
  console.log(`\n📊 OTs en Railway que matchean por número:  ${otsDb.length}`);
  const enExcelPeroNoEnDb = excelMap.size - otsDb.length;
  if (enExcelPeroNoEnDb > 0) {
    console.log(`   ⚠️  ${enExcelPeroNoEnDb} OTs del Excel NO están en Railway (no se crearán)`);
  }

  // ── 3. Calcular qué se va a cambiar ───────────────────────────────────
  const updates: Array<{ id: number; ot: number; data: Record<string, string | null> }> = [];
  const cambiosPorCampo = {
    tipo_reparacion_codigo: 0,
    cod_rep_flota: 0,
    cod_rep_posicion: 0,
    equipo_codigo: 0,
    garantia_codigo: 0,
    taller_status_codigo: 0,
    recursos_status_codigo: 0,
    ot_status_codigo: 0,
  };

  for (const db of otsDb) {
    if (db.ot == null) continue;
    const xl = excelMap.get(db.ot);
    if (!xl) continue;
    const data: Record<string, string | null> = {};

    // Solo actualizamos si Excel tiene valor Y es distinto al de DB.
    // No SOBREESCRIBIMOS si el Excel está vacío (preservamos el dato existente).
    if (xl.tipo_reparacion && xl.tipo_reparacion !== db.tipo_reparacion_codigo) {
      data.tipo_reparacion_codigo = xl.tipo_reparacion;
      cambiosPorCampo.tipo_reparacion_codigo++;
    }
    if (xl.cod_rep_flota && xl.cod_rep_flota !== db.cod_rep_flota) {
      data.cod_rep_flota = xl.cod_rep_flota;
      cambiosPorCampo.cod_rep_flota++;
    }
    if (xl.cod_rep_posicion && xl.cod_rep_posicion !== db.cod_rep_posicion) {
      data.cod_rep_posicion = xl.cod_rep_posicion;
      cambiosPorCampo.cod_rep_posicion++;
    }
    if (xl.equipo_codigo && xl.equipo_codigo !== db.equipo_codigo) {
      data.equipo_codigo = xl.equipo_codigo;
      cambiosPorCampo.equipo_codigo++;
    }
    if (xl.garantia && xl.garantia !== db.garantia_codigo) {
      data.garantia_codigo = xl.garantia;
      cambiosPorCampo.garantia_codigo++;
    }
    if (xl.taller_status && xl.taller_status !== db.taller_status_codigo) {
      data.taller_status_codigo = xl.taller_status;
      cambiosPorCampo.taller_status_codigo++;
    }
    if (xl.recursos_status && xl.recursos_status !== db.recursos_status_codigo) {
      data.recursos_status_codigo = xl.recursos_status;
      cambiosPorCampo.recursos_status_codigo++;
    }
    if (xl.ot_status && xl.ot_status !== db.ot_status_codigo) {
      data.ot_status_codigo = xl.ot_status;
      cambiosPorCampo.ot_status_codigo++;
    }

    if (Object.keys(data).length > 0) {
      updates.push({ id: db.id, ot: db.ot, data });
    }
  }

  console.log(`\n📊 Cambios planificados:`);
  console.log(`   OTs a actualizar:                  ${updates.length}`);
  console.log(`   tipo_reparacion_codigo:            ${cambiosPorCampo.tipo_reparacion_codigo}`);
  console.log(`   cod_rep_flota:                     ${cambiosPorCampo.cod_rep_flota}`);
  console.log(`   cod_rep_posicion:                  ${cambiosPorCampo.cod_rep_posicion}`);
  console.log(`   equipo_codigo:                     ${cambiosPorCampo.equipo_codigo}`);
  console.log(`   garantia_codigo:                   ${cambiosPorCampo.garantia_codigo}`);
  console.log(`   taller_status_codigo:              ${cambiosPorCampo.taller_status_codigo}`);
  console.log(`   recursos_status_codigo:            ${cambiosPorCampo.recursos_status_codigo}`);
  console.log(`   ot_status_codigo:                  ${cambiosPorCampo.ot_status_codigo}`);

  // Mostrar 3 muestras
  console.log(`\n📋 Muestras (primeras 3 OTs a actualizar):`);
  for (const u of updates.slice(0, 3)) {
    console.log(`   OT ${u.ot}: ${JSON.stringify(u.data)}`);
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/reimport-ots-from-uni-railway.ts --apply`);
    return;
  }

  // ── 4. Apply ──────────────────────────────────────────────────────────
  console.log(`\n🔴 Aplicando ${updates.length} updates...`);
  let i = 0;
  for (const u of updates) {
    await prisma.ordenTrabajo.update({ where: { id: u.id }, data: u.data });
    i++;
    if (i % 200 === 0) console.log(`   ${i}/${updates.length}`);
  }
  console.log(`\n✅ Re-import completado: ${updates.length} OTs actualizadas`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

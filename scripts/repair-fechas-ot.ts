/**
 * Backfill de "Fechas Relevantes" de OTs externas (una sola vez).
 *
 * A) EVALUACIÓN: el espejo hoja→OT (evaluador, fecha evaluación, aprobado por,
 *    fecha aprobación) corre al APROBAR la hoja — las aprobadas ANTES de que
 *    ese código existiera quedaron con la cabecera de la OT en blanco. Se
 *    copian desde la hoja (fuente de verdad), solo donde la OT esté vacía.
 *
 * B) FECHAS COMERCIALES: subir un adjunto de etapa ahora autocompleta la fecha
 *    de la OT si está vacía. Para los adjuntos YA subidos, se usa la fecha de
 *    subida del PRIMER adjunto de cada etapa (solo donde la OT esté vacía):
 *    cotizacion→fecha_cotizacion · po_cliente→fecha_generacion_po+fecha_aprobacion
 *    despacho→fecha_despacho · facturacion→fecha_facturacion.
 *
 * Nunca pisa valores existentes. Uso:
 *   npx tsx scripts/repair-fechas-ot.ts            (DRY-RUN: solo lista)
 *   npx tsx scripts/repair-fechas-ot.ts --apply    (aplica los cambios)
 */
import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const APPLY = process.argv.includes("--apply");

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "∅";
}

async function main() {
  console.log(`\n══════ BACKFILL Fechas Relevantes OT   ${APPLY ? "[APLICAR]" : "[DRY-RUN]"} ══════\n`);

  // ── A) Espejo de evaluaciones APROBADAS ──────────────────────────────────
  const evals = await prisma.evaluacionTecnica.findMany({
    where: { estado: "APROBADA" },
    select: {
      id: true, ot_id: true, evaluado_por: true, fecha_evaluacion: true,
      revisado_por: true, fecha_revision: true,
      orden_trabajo: {
        select: {
          id: true, ot: true, evaluador: true, fecha_evaluacion: true,
          evaluacion_aprobado_por: true, fecha_aprobacion_evaluacion: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });

  let evalFix = 0;
  for (const e of evals) {
    const o = e.orden_trabajo;
    if (!o) continue;
    const data: Record<string, unknown> = {};
    if (!o.evaluador && e.evaluado_por) data.evaluador = e.evaluado_por;
    if (!o.fecha_evaluacion && e.fecha_evaluacion) data.fecha_evaluacion = e.fecha_evaluacion;
    if (!o.evaluacion_aprobado_por && e.revisado_por) data.evaluacion_aprobado_por = e.revisado_por;
    if (!o.fecha_aprobacion_evaluacion && e.fecha_revision) data.fecha_aprobacion_evaluacion = e.fecha_revision;
    if (Object.keys(data).length === 0) continue;
    evalFix++;
    console.log(`A) OT ${o.ot ?? o.id}: ${Object.entries(data).map(([k, v]) => `${k}=${v instanceof Date ? fmt(v) : v}`).join(" · ")}`);
    if (APPLY) {
      await prisma.ordenTrabajo.update({ where: { id: o.id }, data });
    }
  }
  console.log(`\nA) Evaluaciones aprobadas: ${evals.length} · OTs a completar: ${evalFix}\n`);

  // ── B) Fechas comerciales desde el primer adjunto de cada etapa ──────────
  const FECHAS_POR_ETAPA: Record<string, string[]> = {
    cotizacion: ["fecha_cotizacion"],
    po_cliente: ["fecha_generacion_po", "fecha_aprobacion"],
    despacho: ["fecha_despacho"],
    facturacion: ["fecha_facturacion"],
  };
  const adjuntos = await prisma.otAdjunto.findMany({
    where: { orden_trabajo_id: { not: null }, etapa_codigo: { in: Object.keys(FECHAS_POR_ETAPA) } },
    select: { orden_trabajo_id: true, etapa_codigo: true, fecha_subida: true },
    orderBy: { fecha_subida: "asc" },
  });
  // Primer adjunto por (OT, etapa)
  const primero = new Map<string, Date>();
  for (const a of adjuntos) {
    const k = `${a.orden_trabajo_id}:${a.etapa_codigo}`;
    if (!primero.has(k)) primero.set(k, a.fecha_subida);
  }
  const otIds = [...new Set(adjuntos.map((a) => a.orden_trabajo_id as number))];
  const ots = otIds.length
    ? await prisma.ordenTrabajo.findMany({
        where: { id: { in: otIds } },
        select: {
          id: true, ot: true, fecha_cotizacion: true, fecha_generacion_po: true,
          fecha_aprobacion: true, fecha_despacho: true, fecha_facturacion: true,
        },
      })
    : [];

  let comFix = 0;
  for (const o of ots) {
    const data: Record<string, Date> = {};
    for (const [etapa, campos] of Object.entries(FECHAS_POR_ETAPA)) {
      const f = primero.get(`${o.id}:${etapa}`);
      if (!f) continue;
      for (const campo of campos) {
        if (!(o as Record<string, unknown>)[campo]) data[campo] = f;
      }
    }
    if (Object.keys(data).length === 0) continue;
    comFix++;
    console.log(`B) OT ${o.ot ?? o.id}: ${Object.entries(data).map(([k, v]) => `${k}=${fmt(v)}`).join(" · ")}`);
    if (APPLY) {
      await prisma.ordenTrabajo.update({ where: { id: o.id }, data });
    }
  }
  console.log(`\nB) OTs con adjuntos: ${ots.length} · OTs a completar: ${comFix}\n`);

  console.log(APPLY ? "✅ Cambios aplicados." : "DRY-RUN: no se modificó nada. Aplicar con --apply.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

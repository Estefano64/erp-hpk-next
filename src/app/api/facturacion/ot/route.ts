// GET /api/facturacion/ot
//
// Lista las OTs que YA fueron despachadas (salieron del taller), estén o no
// facturadas todavía. Para cada OT devuelve los 5 PDFs requeridos para
// facturar — agrupados por etapa — para que el frontend los muestre como
// chips clickeables (verde = subido, rojo = falta):
//
//   1. Guía de llegada    → adjunto etapa "recepcion"
//   2. Cotización         → adjunto etapa "cotizacion"
//   3. PO cliente         → adjunto etapa "po_cliente"
//   4. Informe            → adjunto etapa "termino"
//   5. Guía de despacho   → adjunto etapa "despacho"
//
// "Despachada" (ampliado 2026-08-27): con guía de remisión emitida, O con
// fecha_despacho cargada, O en taller_status "Entregado"/"Cobranza". Antes
// solo se listaban las de guía emitida + sin factura, y en prod eso daba
// 2 filas cuando hay ~3,000 OTs realmente despachadas.
//
// Query params (opcionales, multi-valor separado por coma — NO es un rango):
//   ?anios=2026,2025   filtra por año de la fecha de despacho
//   ?meses=1,7,12      filtra por mes (1-12) de la fecha de despacho
// La respuesta incluye `anios_disponibles` (año + conteo) para poblar el filtro.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ETAPAS_REQUERIDAS = [
  "recepcion", "cotizacion", "po_cliente", "termino", "despacho",
] as const;
type Etapa = (typeof ETAPAS_REQUERIDAS)[number];

const ETAPA_LABELS: Record<Etapa, string> = {
  recepcion: "Guía de llegada",
  cotizacion: "Cotización",
  po_cliente: "PO cliente",
  termino: "Informe",
  despacho: "Guía de despacho",
};

// Fecha de despacho efectiva: la explícita si existe, sino la de emisión de
// la guía (POST /api/despachos/mina/[id] sella `fecha_entrega`).
const FECHA_DESPACHO_SQL = Prisma.sql`COALESCE(fecha_despacho, fecha_entrega)`;
// Condición "ya despachada".
const ES_DESPACHADA_SQL = Prisma.sql`
  activo = true
  AND (
    guia_entrega_salida IS NOT NULL
    OR fecha_despacho IS NOT NULL
    OR taller_status_codigo IN ('Entregado', 'Cobranza')
  )`;

// "2026,2025" → [2026, 2025]; descarta lo que no sea número en rango.
function parseNums(raw: string | null, min: number, max: number): number[] {
  if (!raw) return [];
  return [...new Set(
    raw.split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= min && n <= max),
  )];
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const anios = parseNums(sp.get("anios"), 2000, 2100);
    const meses = parseNums(sp.get("meses"), 1, 12);

    // Años disponibles (para poblar el filtro) — agregado barato, sin joins.
    const aniosDisponibles = await prisma.$queryRaw<Array<{ anio: number; n: number }>>`
      SELECT EXTRACT(YEAR FROM ${FECHA_DESPACHO_SQL})::int AS anio, COUNT(*)::int AS n
      FROM orden_trabajo
      WHERE ${ES_DESPACHADA_SQL} AND ${FECHA_DESPACHO_SQL} IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC`;

    // IDs que matchean, ya ordenados por fecha de despacho DESC (más reciente
    // primero). Se resuelve en SQL porque el orden es sobre un COALESCE, que
    // Prisma no expresa en orderBy.
    const filtros: Prisma.Sql[] = [ES_DESPACHADA_SQL];
    if (anios.length > 0) {
      filtros.push(Prisma.sql`EXTRACT(YEAR FROM ${FECHA_DESPACHO_SQL})::int IN (${Prisma.join(anios)})`);
    }
    if (meses.length > 0) {
      filtros.push(Prisma.sql`EXTRACT(MONTH FROM ${FECHA_DESPACHO_SQL})::int IN (${Prisma.join(meses)})`);
    }
    const filas = await prisma.$queryRaw<Array<{ id: number; f_desp: Date | null }>>`
      SELECT id, ${FECHA_DESPACHO_SQL} AS f_desp
      FROM orden_trabajo
      WHERE ${Prisma.join(filtros, " AND ")}
      ORDER BY ${FECHA_DESPACHO_SQL} DESC NULLS LAST, id DESC`;

    const ids = filas.map((f) => f.id);
    const fechaDespachoPorId = new Map(filas.map((f) => [f.id, f.f_desp]));
    if (ids.length === 0) {
      return NextResponse.json({ data: [], anios_disponibles: aniosDisponibles });
    }

    const ots = await prisma.ordenTrabajo.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, ot: true, descripcion: true,
        wo_cliente: true, po_cliente: true, ns: true,
        fecha_entrega: true, fecha_facturacion: true,
        guia_entrega_salida: true, nro_informe_entrega: true,
        nro_factura: true, monto_cotizacion: true,
        cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
        codigo_reparacion: { select: { codigo: true, descripcion: true } },
        ot_status: true, taller_status: true,
        adjuntos: {
          where: { etapa_codigo: { in: [...ETAPAS_REQUERIDAS] } },
          select: { id: true, etapa_codigo: true, nombre_archivo: true, r2_key: true, fecha_subida: true, tamano: true },
          orderBy: { fecha_subida: "desc" },
        },
      },
    });
    // Reordenar según el orden del query raw (findMany con `in` no lo respeta).
    const porId = new Map(ots.map((o) => [o.id, o]));
    const ordenadas = ids.map((id) => porId.get(id)).filter((o): o is (typeof ots)[number] => o != null);

    const data = ordenadas.map((o) => {
      // Agrupamos adjuntos por etapa para que el frontend tenga acceso a la
      // lista por categoría (puede haber más de un PDF por etapa).
      const pdfs: Record<Etapa, typeof o.adjuntos> = {
        recepcion: [], cotizacion: [], po_cliente: [], termino: [], despacho: [],
      };
      for (const a of o.adjuntos) {
        if (a.etapa_codigo in pdfs) {
          pdfs[a.etapa_codigo as Etapa].push(a);
        }
      }
      const faltantes = ETAPAS_REQUERIDAS.filter((et) => pdfs[et].length === 0);
      const pdfs_ok = faltantes.length === 0;

      return {
        id: o.id,
        ot: o.ot,
        cliente: o.cliente?.nombre_comercial ?? o.cliente?.razon_social ?? null,
        codigo_reparacion: o.codigo_reparacion
          ? `${o.codigo_reparacion.codigo} — ${o.codigo_reparacion.descripcion}`
          : null,
        ns: o.ns,
        wo_cliente: o.wo_cliente,
        po_cliente: o.po_cliente,
        fecha_entrega: o.fecha_entrega,
        // Fecha de despacho efectiva (fecha_despacho o, si falta, la de
        // emisión de la guía) — también es el criterio de orden y de filtro.
        fecha_despacho: fechaDespachoPorId.get(o.id) ?? null,
        fecha_facturacion: o.fecha_facturacion,
        guia_entrega_salida: o.guia_entrega_salida,
        nro_informe_entrega: o.nro_informe_entrega,
        nro_factura: o.nro_factura,
        monto_cotizacion: o.monto_cotizacion,
        taller_status: o.taller_status?.nombre ?? null,
        // PDFs requeridos agrupados por etapa — el frontend renderiza 5 chips.
        pdfs,
        pdfs_ok,
        // Labels humanos de los faltantes para mostrar en tooltips/alertas.
        faltantes: faltantes.map((et) => ETAPA_LABELS[et]),
      };
    });

    return NextResponse.json({ data, anios_disponibles: aniosDisponibles });
  } catch (error) {
    console.error("GET /api/facturacion/ot error:", error);
    return NextResponse.json({ error: "Error obteniendo OTs para facturación" }, { status: 500 });
  }
}

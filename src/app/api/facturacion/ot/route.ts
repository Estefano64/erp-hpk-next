// GET /api/facturacion/ot
//
// Lista las OTs que YA fueron despachadas (salieron del taller), estén o no
// facturadas todavía. Para cada OT devuelve los PDFs del expediente agrupados
// por etapa, para que el frontend los muestre como chips clickeables:
//
//   Guía de llegada  → "recepcion"    Cotización     → "cotizacion"
//   PO cliente       → "po_cliente"   Informe        → "termino"
//   Guía de despacho → "despacho"     Factura        → "facturacion"
//
// CUÁLES de esos son REQUISITO para facturar depende del tipo de OT — un Bien
// no tiene guía de llegada ni informe de reparación. La tabla vive en
// src/lib/facturacion-requisitos.ts y cada fila viaja con su `requeridas`.
//
// "Despachada" (ampliado 2026-08-27): con guía de remisión emitida, O con
// fecha_despacho cargada, O en taller_status "Entregado"/"Cobranza". Antes
// solo se listaban las de guía emitida + sin factura, y en prod eso daba
// 2 filas cuando hay ~3,000 OTs realmente despachadas.
//
// Como ahora la lista incluye facturadas y no facturadas, cada fila viene con
// `facturada` (= fecha de facturación Y PDF de factura) para que el frontend
// separe unas de otras (KPIs, filtro y tag), más `falta_factura` con lo que
// falte y `nro_factura_pdf` con el número leído del nombre del comprobante.
//
// Query params (opcionales, multi-valor separado por coma — NO es un rango):
//   ?anios=2026,2025   filtra por año de la fecha de despacho
//   ?meses=1,7,12      filtra por mes (1-12) de la fecha de despacho
// La respuesta incluye `anios_disponibles` (año + conteo) para poblar el filtro.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { numeroFacturaDesdeArchivo } from "@/lib/factura-numero";
import {
  ETAPAS_FACTURACION, ETAPA_LABELS, requisitosFacturacion,
} from "@/lib/facturacion-requisitos";

// Todas las etapas del expediente que el frontend renderiza como chips.
// CUÁLES son requisito depende del tipo — ver requisitosFacturacion().
const ETAPAS_EXPEDIENTE = ETAPAS_FACTURACION;
// "facturacion" se trae y se muestra, pero NO es requisito: el PDF de la
// factura se sube DESPUÉS de facturar, así que contarlo como faltante
// bloquearía el botón para siempre (2026-08-27).
//
// Ese mismo adjunto es, además, una de las señales de "ya facturada" — ver
// `facturada` más abajo.
const ETAPAS_TRAIDAS = [...ETAPAS_EXPEDIENTE, "facturacion"] as const;
type Etapa = (typeof ETAPAS_TRAIDAS)[number];

// Fecha de despacho efectiva: la explícita si existe, sino la de emisión de
// la guía (POST /api/despachos/mina/[id] sella `fecha_entrega`).
const FECHA_DESPACHO_SQL = Prisma.sql`COALESCE(fecha_despacho, fecha_entrega)`;
// "Facturada" en SQL — misma regla que el flag `facturada` del payload:
// fecha de facturación cargada Y PDF de factura subido (etapa facturacion).
// Permite filtrar pendientes/facturadas en el SERVER y no traer todo.
const ES_FACTURADA_SQL = Prisma.sql`(
  fecha_facturacion IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM ot_adjunto a
    WHERE a.orden_trabajo_id = orden_trabajo.id AND a.etapa_codigo = 'facturacion'
  )
)`;
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
    // estado=pendientes|facturadas (default: todas) — filtro server-side para
    // que la carga inicial (Pendientes) no arrastre el histórico facturado.
    const estado = sp.get("estado");
    // Rango de fechas de despacho (días completos, inclusive).
    const esFecha = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const desdeRaw = sp.get("desde");
    const hastaRaw = sp.get("hasta");

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
    if (esFecha(desdeRaw)) {
      filtros.push(Prisma.sql`${FECHA_DESPACHO_SQL} >= ${new Date(`${desdeRaw}T00:00:00Z`)}`);
    }
    if (esFecha(hastaRaw)) {
      const fin = new Date(`${hastaRaw}T00:00:00Z`);
      fin.setUTCDate(fin.getUTCDate() + 1);
      filtros.push(Prisma.sql`${FECHA_DESPACHO_SQL} < ${fin}`);
    }

    // Conteos del universo filtrado (SIN el filtro de estado) — alimentan las
    // pestañas Todas/Pendientes/Facturadas aunque solo se cargue un subconjunto.
    const [conteo] = await prisma.$queryRaw<Array<{ total: number; fact: number }>>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${ES_FACTURADA_SQL})::int AS fact
      FROM orden_trabajo
      WHERE ${Prisma.join(filtros, " AND ")}`;
    const counts = {
      todas: conteo?.total ?? 0,
      facturadas: conteo?.fact ?? 0,
      pendientes: (conteo?.total ?? 0) - (conteo?.fact ?? 0),
    };

    if (estado === "pendientes") filtros.push(Prisma.sql`NOT ${ES_FACTURADA_SQL}`);
    else if (estado === "facturadas") filtros.push(ES_FACTURADA_SQL);

    const filas = await prisma.$queryRaw<Array<{ id: number; f_desp: Date | null }>>`
      SELECT id, ${FECHA_DESPACHO_SQL} AS f_desp
      FROM orden_trabajo
      WHERE ${Prisma.join(filtros, " AND ")}
      ORDER BY ${FECHA_DESPACHO_SQL} DESC NULLS LAST, id DESC`;

    const ids = filas.map((f) => f.id);
    const fechaDespachoPorId = new Map(filas.map((f) => [f.id, f.f_desp]));
    if (ids.length === 0) {
      return NextResponse.json({ data: [], anios_disponibles: aniosDisponibles, counts });
    }

    const ots = await prisma.ordenTrabajo.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, ot: true, descripcion: true,
        // El tipo decide qué PDFs son requisito para facturar (un Bien no
        // tiene guía de llegada ni informe de término).
        tipo_codigo: true,
        wo_cliente: true, po_cliente: true, ns: true,
        fecha_entrega: true, fecha_facturacion: true,
        guia_entrega_salida: true, nro_informe_entrega: true,
        nro_factura: true, monto_cotizacion: true,
        cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
        codigo_reparacion: { select: { codigo: true, descripcion: true } },
        ot_status: true, taller_status: true,
        adjuntos: {
          where: { etapa_codigo: { in: [...ETAPAS_TRAIDAS] } },
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
        facturacion: [],
      };
      for (const a of o.adjuntos) {
        if (a.etapa_codigo in pdfs) {
          pdfs[a.etapa_codigo as Etapa].push(a);
        }
      }
      // Requisitos según el tipo de OT (la factura nunca es requisito: es la
      // salida del proceso, no la entrada).
      const requeridas = requisitosFacturacion(o.tipo_codigo);
      const faltantes = requeridas.filter((et) => pdfs[et].length === 0);
      const pdfs_ok = faltantes.length === 0;

      // ── ¿Está facturada? ────────────────────────────────────────────
      // No alcanza con mirar `nro_factura`: en la práctica nadie usó nunca el
      // "Registrar factura" de esta pantalla (0 OTs con nro_factura en prod
      // al 2026-08-27). El circuito real de facturación fue subir el PDF de
      // la factura a la etapa "facturacion" y cargar la fecha en el detalle
      // de la OT.
      //
      // Regla (definida con el usuario): hacen falta LAS DOS señales —
      // fecha de facturación Y PDF de la factura. Con una sola el expediente
      // está a medias: o se cargó la fecha y falta subir el comprobante, o
      // se subió el PDF y nadie registró cuándo se facturó. Esas quedan como
      // pendientes a propósito, para que se completen.
      const tieneFecha = o.fecha_facturacion != null;
      const tienePdf = pdfs.facturacion.length > 0;
      const facturada = tieneFecha && tienePdf;

      // Qué falta para darla por facturada (vacío si ya lo está).
      const falta_factura: string[] = [];
      if (!tieneFecha) falta_factura.push("fecha de facturación");
      if (!tienePdf) falta_factura.push("PDF de la factura");

      // Número de factura leído del nombre del PDF (los comprobantes llegan
      // como "20532384088-01-F001-00003181.pdf" o "F001-00003202 HP&K...pdf").
      // Es una SUGERENCIA para pre-llenar el campo: el valor persistido sigue
      // siendo `nro_factura`. Si el nombre no matchea, queda null.
      const nro_factura_pdf = pdfs.facturacion
        .map((a) => numeroFacturaDesdeArchivo(a.nombre_archivo))
        .find((n): n is string => n != null) ?? null;

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
        tipo_codigo: o.tipo_codigo,
        pdfs,
        pdfs_ok,
        // Etapas exigidas para ESTA OT — el frontend las usa para pintar en
        // rojo solo los chips que de verdad bloquean.
        requeridas,
        // true solo si tiene fecha de facturación Y PDF de factura.
        // `falta_factura` lista lo que falte, para el tooltip del frontend.
        facturada,
        falta_factura,
        // Número detectado en el nombre del PDF (sugerencia, no persistido).
        nro_factura_pdf,
        // Labels humanos de los faltantes para mostrar en tooltips/alertas.
        faltantes: faltantes.map((et) => ETAPA_LABELS[et]),
      };
    });

    return NextResponse.json({ data, anios_disponibles: aniosDisponibles, counts });
  } catch (error) {
    console.error("GET /api/facturacion/ot error:", error);
    return NextResponse.json({ error: "Error obteniendo OTs para facturación" }, { status: 500 });
  }
}

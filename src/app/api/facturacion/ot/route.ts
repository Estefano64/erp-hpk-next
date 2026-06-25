// GET /api/facturacion/ot
//
// Lista las OTs que YA fueron despachadas (tienen guía de remisión emitida)
// y que todavía NO se han facturado. Para cada OT devuelve los 5 PDFs
// requeridos para facturar — agrupados por etapa — para que el frontend
// los muestre como chips clickeables (verde = subido, rojo = falta):
//
//   1. Guía de llegada    → adjunto etapa "recepcion"
//   2. Cotización         → adjunto etapa "cotizacion"
//   3. PO cliente         → adjunto etapa "po_cliente"
//   4. Informe            → adjunto etapa "termino"
//   5. Guía de despacho   → adjunto etapa "despacho"

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(_req: NextRequest) {
  try {
    const ots = await prisma.ordenTrabajo.findMany({
      where: {
        // Solo OTs que ya pasaron por /despachos/mina (guía emitida).
        guia_entrega_salida: { not: null },
        // Solo pendientes de facturar — una vez facturadas desaparecen.
        nro_factura: null,
      },
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
      orderBy: [{ fecha_entrega: "asc" }, { id: "asc" }],
    });

    const data = ots.map((o) => {
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

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/facturacion/ot error:", error);
    return NextResponse.json({ error: "Error obteniendo OTs para facturación" }, { status: 500 });
  }
}

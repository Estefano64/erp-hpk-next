// GET /api/facturacion/ot
//
// Lista OTs que están en estado "Entregado" (ya tienen guía de remisión emitida)
// y por lo tanto están listas para facturar al cliente. Para cada OT calcula
// si tiene TODOS los adjuntos requeridos (guía de remisión + al menos un
// archivo en etapa "despacho") como pre-requisito para emitir la factura.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ESTADO_ENTREGADO = "Entregado";
const ESTADO_COBRANZA = "Cobranza";

export async function GET(_req: NextRequest) {
  try {
    const ots = await prisma.ordenTrabajo.findMany({
      where: {
        taller_status_codigo: { in: [ESTADO_ENTREGADO, ESTADO_COBRANZA] },
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
          where: { etapa_codigo: { in: ["despacho", "termino"] } },
          select: { id: true, etapa_codigo: true, nombre_archivo: true, ruta: true, fecha_subida: true },
          orderBy: { fecha_subida: "desc" },
        },
      },
      orderBy: [{ fecha_entrega: "asc" }, { id: "asc" }],
    });

    const data = ots.map((o) => {
      const tieneGuia = !!o.guia_entrega_salida;
      const adjDespacho = o.adjuntos.filter((a) => a.etapa_codigo === "despacho");
      const tieneAdjuntoGuia = adjDespacho.length > 0;
      // Requisitos mínimos para facturar a la mina:
      //  1) N° guía de remisión emitido
      //  2) Al menos un archivo en etapa "despacho" (la guía firmada o el cargo)
      const adjuntosOk = tieneGuia && tieneAdjuntoGuia;
      const faltantes: string[] = [];
      if (!tieneGuia) faltantes.push("N° guía de remisión");
      if (!tieneAdjuntoGuia) faltantes.push("Archivo de guía firmada (adjunto etapa despacho)");

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
        adjuntos: o.adjuntos,
        adjuntos_ok: adjuntosOk,
        faltantes,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/facturacion/ot error:", error);
    return NextResponse.json({ error: "Error obteniendo OTs para facturación" }, { status: 500 });
  }
}

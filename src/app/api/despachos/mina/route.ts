// GET /api/despachos/mina
//
// Lista OTs cuyo trabajo en taller terminó y están listas para emitir guía de
// remisión al cliente (mina). Filtra por `taller_status_codigo = "Terminado"`.
// La guía de remisión opera a nivel OT (no por ítem), así que devuelve solo
// info de cabecera de la OT más un resumen de items.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ESTADO_LISTO_DESPACHO = "Terminado";

export async function GET(_req: NextRequest) {
  try {
    const ots = await prisma.ordenTrabajo.findMany({
      where: {
        taller_status_codigo: ESTADO_LISTO_DESPACHO,
        // Solo OTs pendientes de guía. Una vez emitida la guía, la OT
        // desaparece de este listado y pasa a /facturacion/ot.
        guia_entrega_salida: null,
      },
      select: {
        id: true,
        ot: true,
        descripcion: true,
        fecha_recepcion: true,
        fecha_requerimiento_cliente: true,
        fecha_entrega: true,
        guia_entrega_salida: true,
        nro_informe_entrega: true,
        wo_cliente: true,
        po_cliente: true,
        ns: true,
        plaqueteo: true,
        cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
        codigo_reparacion: { select: { codigo: true, descripcion: true } },
        ot_status: true,
        taller_status: true,
        // Adjuntos de etapa "despacho" (la guía cuando se sube) y "po_cliente"
        // (PDF de la PO del cliente, requisito para generar la guía).
        adjuntos: {
          where: { etapa_codigo: { in: ["despacho", "po_cliente"] } },
          select: { id: true, nombre_archivo: true, r2_key: true, fecha_subida: true, tamano: true, etapa_codigo: true },
          orderBy: { fecha_subida: "desc" },
        },
        repuestos: {
          where: { status_oc_codigo: "ENTREGADO" },
          select: { id: true, cantidad: true, descripcion: true, material_codigo: true, unidad_medida: true },
        },
      },
      orderBy: [{ fecha_recepcion: "asc" }, { id: "asc" }],
    });

    const data = ots.map((o) => ({
      id: o.id,
      ot: o.ot,
      descripcion: o.descripcion,
      cliente: o.cliente?.nombre_comercial ?? o.cliente?.razon_social ?? null,
      cliente_codigo: o.cliente?.codigo ?? null,
      codigo_reparacion: o.codigo_reparacion
        ? `${o.codigo_reparacion.codigo} — ${o.codigo_reparacion.descripcion}`
        : null,
      fecha_recepcion: o.fecha_recepcion,
      fecha_requerimiento_cliente: o.fecha_requerimiento_cliente,
      fecha_entrega: o.fecha_entrega,
      taller_status: o.taller_status?.nombre ?? null,
      guia_entrega_salida: o.guia_entrega_salida,
      nro_informe_entrega: o.nro_informe_entrega,
      wo_cliente: o.wo_cliente,
      po_cliente: o.po_cliente,
      ns: o.ns,
      plaqueteo: o.plaqueteo,
      items_count: o.repuestos.length,
      // Separar adjuntos por etapa para que el frontend pueda validar la PO
      // del cliente (requisito para generar la guía).
      adjuntos_despacho: o.adjuntos.filter((a) => a.etapa_codigo === "despacho"),
      adjuntos_po_cliente: o.adjuntos.filter((a) => a.etapa_codigo === "po_cliente"),
      tiene_po_cliente: o.adjuntos.some((a) => a.etapa_codigo === "po_cliente"),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/despachos/mina error:", error);
    return NextResponse.json({ error: "Error al obtener OTs listas para despacho" }, { status: 500 });
  }
}

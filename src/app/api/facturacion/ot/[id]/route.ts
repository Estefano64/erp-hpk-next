// POST /api/facturacion/ot/[id]
//
// Registra la factura emitida al cliente para una OT entregada. Valida que la
// OT tenga TODOS los adjuntos requeridos antes de aceptar la operación:
//   - N° guía de remisión emitido (guia_entrega_salida)
//   - Al menos un archivo en etapa "despacho" (guía firmada/cargo)
//
// Al guardar:
//   - nro_factura, fecha_facturacion en OrdenTrabajo
//   - taller_status → "Cobranza" (queda pendiente de cobro)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  nro_factura: z.string().trim().min(1).max(100),
  fecha_facturacion: z.string().optional().nullable(),
  monto: z.coerce.number().min(0).optional().nullable(),
  observaciones: z.string().trim().max(500).optional().nullable(),
});

const ESTADO_ENTREGADO = "Entregado";
const ESTADO_COBRANZA = "Cobranza";

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null) {
      return NextResponse.json({ error: "OT inválida" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "Facturacion";

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      select: {
        id: true, ot: true, taller_status_codigo: true,
        guia_entrega_salida: true,
        adjuntos: {
          where: { etapa_codigo: "despacho" },
          select: { id: true },
        },
      },
    });
    if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

    if (ot.taller_status_codigo !== ESTADO_ENTREGADO && ot.taller_status_codigo !== ESTADO_COBRANZA) {
      return NextResponse.json({
        error: `La OT debe estar en estado "${ESTADO_ENTREGADO}" para facturar (está en "${ot.taller_status_codigo ?? "—"}").`,
      }, { status: 409 });
    }

    // Validación de adjuntos requeridos
    const faltantes: string[] = [];
    if (!ot.guia_entrega_salida) faltantes.push("N° guía de remisión");
    if (ot.adjuntos.length === 0) faltantes.push("Archivo de guía firmada (adjunto etapa despacho)");
    if (faltantes.length > 0) {
      return NextResponse.json({
        error: `Faltan documentos requeridos para facturar: ${faltantes.join(", ")}`,
        faltantes,
      }, { status: 400 });
    }

    const esActualizacion = ot.taller_status_codigo === ESTADO_COBRANZA;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ordenTrabajo.update({
        where: { id: otId },
        data: {
          nro_factura: d.nro_factura,
          fecha_facturacion: parseDateOnly(d.fecha_facturacion) ?? new Date(),
          monto_cotizacion: d.monto ?? undefined,
          taller_status_codigo: ESTADO_COBRANZA,
          usuario_actualiza: usuario,
          fecha_actualizacion: new Date(),
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: esActualizacion ? "EDICION" : "CAMBIO_ESTADO",
          descripcion: esActualizacion
            ? `Factura actualizada: ${d.nro_factura}`
            : `Factura emitida: ${d.nro_factura} — OT pasa a "${ESTADO_COBRANZA}"`,
          usuario,
          datos_adicionales: d.observaciones ?? null,
        },
      });
      return u;
    });

    return NextResponse.json({
      data: updated,
      message: esActualizacion ? "Factura actualizada" : "Factura emitida y OT marcada como Cobranza",
    });
  } catch (error) {
    console.error("POST /api/facturacion/ot/[id] error:", error);
    return NextResponse.json({ error: "Error al registrar factura" }, { status: 500 });
  }
}

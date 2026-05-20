// POST /api/despachos/mina/[id]
//
// Genera la guía de remisión a la mina para una OT. Actualiza:
//   - guia_entrega_salida (nro guía)
//   - fecha_entrega
//   - taller_status_codigo → "Entregado" (pasa al flujo de facturación)
//   - registra en OTHistorial
//
// Para subir el archivo de la guía, usar POST /api/ordenes-trabajo/[id]/adjuntos
// con etapa=despacho (módulo de adjuntos existente).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  guia_entrega_salida: z.string().trim().min(1).max(100),
  fecha_entrega: z.string().optional().nullable(),
  nro_informe_entrega: z.string().trim().max(100).optional().nullable(),
  observaciones: z.string().trim().max(500).optional().nullable(),
});

const ESTADO_LISTO_DESPACHO = "Terminado";
const ESTADO_DESPACHADO = "Entregado";

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId)) {
      return NextResponse.json({ error: "OT inválida" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "Despacho";

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      select: {
        id: true, ot: true, taller_status_codigo: true,
        guia_entrega_salida: true, fecha_entrega: true,
      },
    });
    if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    if (ot.taller_status_codigo !== ESTADO_LISTO_DESPACHO && ot.taller_status_codigo !== ESTADO_DESPACHADO) {
      return NextResponse.json({
        error: `La OT no está en estado "${ESTADO_LISTO_DESPACHO}" — está en "${ot.taller_status_codigo ?? "—"}".`,
      }, { status: 409 });
    }

    const fechaEntrega = d.fecha_entrega ? parseDateOnly(d.fecha_entrega) : new Date();
    const esActualizacion = ot.taller_status_codigo === ESTADO_DESPACHADO;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ordenTrabajo.update({
        where: { id: otId },
        data: {
          guia_entrega_salida: d.guia_entrega_salida,
          fecha_entrega: fechaEntrega,
          nro_informe_entrega: d.nro_informe_entrega ?? undefined,
          taller_status_codigo: ESTADO_DESPACHADO,
          usuario_actualiza: usuario,
          fecha_actualizacion: new Date(),
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: esActualizacion ? "EDICION" : "CAMBIO_ESTADO",
          descripcion: esActualizacion
            ? `Guía de remisión actualizada: ${d.guia_entrega_salida}`
            : `Guía de remisión emitida: ${d.guia_entrega_salida} — OT pasa a "${ESTADO_DESPACHADO}"`,
          usuario,
          datos_adicionales: d.observaciones ?? null,
        },
      });
      return u;
    });

    return NextResponse.json({ data: updated, message: esActualizacion ? "Guía actualizada" : "Guía emitida y OT marcada como Entregado" });
  } catch (error) {
    console.error("POST /api/despachos/mina/[id] error:", error);
    return NextResponse.json({ error: "Error al generar guía" }, { status: 500 });
  }
}

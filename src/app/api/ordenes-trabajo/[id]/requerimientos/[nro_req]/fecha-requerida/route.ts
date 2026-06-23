import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string; nro_req: string }> };

const Schema = z.object({
  fecha_requerida: z.string().nullable(),
});

// POST /api/ordenes-trabajo/[id]/requerimientos/[nro_req]/fecha-requerida
// Setea fecha_requerida en TODOS los items del nro_req que están editables (BORRADOR o SIN_APROBACION).
// Body: { fecha_requerida: "YYYY-MM-DD" | null }
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id, nro_req } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const nroReq = decodeURIComponent(nro_req).trim();
    if (!nroReq) {
      return NextResponse.json({ error: "nro_req requerido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const fecha = parseDateOnly(parsed.data.fecha_requerida);
    const usuario = (await getAuditUser(req)) ?? "sistema";

    // Validar contra fecha_recepcion de la OT
    if (fecha) {
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: otId },
        select: { fecha_recepcion: true },
      });
      if (ot?.fecha_recepcion && fecha < ot.fecha_recepcion) {
        return NextResponse.json(
          { error: "La fecha requerida no puede ser anterior a la recepción de la OT." },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.oTRepuesto.updateMany({
        where: {
          ot_id: otId,
          nro_req: nroReq,
          status_requerimiento_codigo: { in: ["BORRADOR", "SIN_APROBACION"] },
        },
        data: { fecha_requerida: fecha },
      });
      if (updated.count === 0) {
        throw new Error("NO_ITEMS_EDITABLES");
      }
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: fecha
            ? `Fecha requerida = ${fecha.toISOString().slice(0, 10)} en ${updated.count} item(s) de ${nroReq}.`
            : `Fecha requerida limpiada en ${updated.count} item(s) de ${nroReq}.`,
          usuario,
        },
      });
      return { actualizados: updated.count };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_ITEMS_EDITABLES") {
      return NextResponse.json(
        { error: "No hay items editables (BORRADOR o SIN_APROBACION) en este requerimiento." },
        { status: 409 },
      );
    }
    console.error("POST fecha-requerida bulk error:", error);
    return NextResponse.json({ error: "Error al actualizar fecha requerida" }, { status: 500 });
  }
}

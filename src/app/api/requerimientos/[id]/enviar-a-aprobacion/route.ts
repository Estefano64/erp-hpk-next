import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { maybePromoveOTaRecursosSolicitados } from "@/lib/ot-status";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/enviar-a-aprobacion
// BORRADOR → SIN_APROBACION. Cualquier usuario autenticado puede enviarlo;
// después solo el admin puede tocarlo (desde el módulo /requerimientos).
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: { status_requerimiento_codigo: true, ot_id: true, nro_req: true },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.status_requerimiento_codigo !== "BORRADOR") {
      return NextResponse.json({
        error: `Solo se puede enviar a aprobación desde BORRADOR. Estado actual: ${current.status_requerimiento_codigo}`,
      }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "SIN_APROBACION",
          fecha_envio_aprobacion: new Date(),
          usuario_envia: usuario,
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
          tipo_operacion: "Otro",
          descripcion: `Requerimiento ${current.nro_req ?? id} enviado a aprobación`,
          usuario,
        },
      });
      await maybePromoveOTaRecursosSolicitados(tx, current.ot_id, usuario);
      return r;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST enviar-a-aprobacion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

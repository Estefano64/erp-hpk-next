import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditOTStatusChange, getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const EVAL_OPERACION_CODIGO = "EVAL";
const TALLER_STATUS_AL_FINALIZAR = "Pdt proceso";

/**
 * POST /api/ordenes-trabajo/[id]/evaluacion/finalizar
 *
 * Marca la evaluación como terminada:
 * 1. Valida que al menos haya capturas
 * 2. Marca la PlanificacionOT EVAL como "Terminado" + fecha_fin
 * 3. Cambia taller_status de la OT a "Pdt proceso"
 * 4. Dispara auditoría automática en OTHistorial
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const ot = await tx.ordenTrabajo.findUnique({
        where: { id: otId },
        select: { id: true, taller_status_codigo: true, ot_status_codigo: true, recursos_status_codigo: true },
      });
      if (!ot) throw Object.assign(new Error("OT no encontrada"), { code: "NOT_FOUND" });

      const planEval = await tx.planificacionOT.findFirst({
        where: { ot_id: otId, operacion_codigo: EVAL_OPERACION_CODIGO },
        include: { _count: { select: { capturas: true } } },
      });
      if (!planEval) {
        throw Object.assign(
          new Error("No hay tarea de evaluación (EVAL) asignada a esta OT."),
          { code: "NO_PLAN" },
        );
      }
      if (planEval._count.capturas === 0) {
        throw Object.assign(
          new Error("No hay capturas de evaluación. Llená al menos un campo antes de finalizar."),
          { code: "NO_CAPTURES" },
        );
      }

      await tx.planificacionOT.update({
        where: { id: planEval.id },
        data: { estado: "realizado", fecha_fin: new Date() },
      });

      const before = { taller_status_codigo: ot.taller_status_codigo };
      await tx.ordenTrabajo.update({
        where: { id: otId },
        data: { taller_status_codigo: TALLER_STATUS_AL_FINALIZAR },
      });
      const after = { taller_status_codigo: TALLER_STATUS_AL_FINALIZAR };
      const cambios = await auditOTStatusChange(tx, otId, before, after, usuario);

      return {
        ot_id: otId,
        capturas: planEval._count.capturas,
        taller_status_anterior: before.taller_status_codigo,
        taller_status_nuevo: TALLER_STATUS_AL_FINALIZAR,
        auditoria_cambios: cambios,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "NO_PLAN" || err?.code === "NO_CAPTURES") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/ordenes-trabajo/[id]/evaluacion/finalizar error:", error);
    return NextResponse.json({ error: "Error al finalizar evaluación" }, { status: 500 });
  }
}

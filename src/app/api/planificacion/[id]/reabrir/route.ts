import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { hasAnyRole } from "@/lib/permisos";
import { duracionRealTarea, rollupEstadoTarea } from "@/lib/plan-sesion";
import { splitRecursos } from "@/lib/recursos";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/planificacion/:id/reabrir — acción EXTRAORDINARIA del planner/admin.
// Revierte una tarea que un técnico finalizó por error: las sesiones cerradas
// como "finalizado" pasan a "pausa", la tarea vuelve a "pausado" y se limpia
// fecha_fin_real. El tiempo trabajado se conserva (las sesiones mantienen su
// inicio/fin). Después el técnico puede "Retomar" para seguir.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    if (!hasAnyRole(session, "planner", "admin")) {
      return NextResponse.json({ error: "Solo Planificación puede reabrir una tarea finalizada." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const planId = Number(id);
    if (!Number.isFinite(planId) || planId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const plan = await prisma.planificacionOT.findUnique({
      where: { id: planId },
      select: { id: true, estado: true, tecnico: true, ot_id: true, descripcion: true, horas_extras: true, horas_extras_qty: true },
    });
    if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    if (plan.estado !== "realizado") {
      return NextResponse.json({ error: "La tarea no está finalizada; no hay nada que reabrir." }, { status: 409 });
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      // Las sesiones finalizadas pasan a "pausa" (conservan inicio/fin → conservan tiempo).
      await tx.planificacionOTSesion.updateMany({
        where: { planificacion_ot_id: planId, cierre: "finalizado" },
        data: { cierre: "pausa" },
      });

      const todas = await tx.planificacionOTSesion.findMany({
        where: { planificacion_ot_id: planId },
        select: { tecnico: true, inicio: true, fin: true, cierre: true },
      });
      const horas = duracionRealTarea(todas, !!plan.horas_extras, plan.horas_extras_qty);
      const estadoTarea = rollupEstadoTarea(splitRecursos(plan.tecnico), todas);

      await tx.planificacionOT.update({
        where: { id: planId },
        data: { estado: estadoTarea, fecha_fin_real: null, horas_reales: horas },
      });

      if (plan.ot_id) {
        await tx.oTHistorial.create({
          data: {
            ot_id: plan.ot_id,
            tipo_operacion: "PLANIFICACION",
            descripcion: `Tarea reabierta (estaba finalizada): "${plan.descripcion}" → ${estadoTarea}.`,
            usuario,
          },
        });
      }

      return { estado: estadoTarea, horas_reales: horas };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/reabrir error:", error);
    return NextResponse.json({ error: "Error al reabrir la tarea" }, { status: 500 });
  }
}

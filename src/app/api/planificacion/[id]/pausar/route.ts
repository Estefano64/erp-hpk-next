import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumarHorasReales, rollupEstadoTarea } from "@/lib/plan-sesion";
import { splitRecursos } from "@/lib/recursos";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/planificacion/:id/pausar — el técnico interrumpe la tarea.
// Cierra la sesión abierta de este técnico con cierre="pausa". Recalcula
// horas_reales sumando todas las sesiones cerradas. Estado pasa a "pausado".
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const obs = typeof body.observaciones === "string" ? body.observaciones.trim() : "";
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const userId = Number((session.user as { id?: string }).id);
    const me = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { trabajador: { select: { nombre: true } } },
    });
    if (!me?.trabajador) {
      return NextResponse.json({ error: "Tu usuario no está enlazado a un trabajador" }, { status: 403 });
    }
    const tecnicoNombre = me.trabajador.nombre;

    const { id } = await ctx.params;
    const planId = Number(id);

    const abierta = await prisma.planificacionOTSesion.findFirst({
      where: { planificacion_ot_id: planId, tecnico: tecnicoNombre, fin: null },
    });
    if (!abierta) {
      return NextResponse.json({ error: "No tenés una sesión abierta para esta tarea" }, { status: 409 });
    }

    const now = new Date();
    await prisma.planificacionOTSesion.update({
      where: { id: abierta.id },
      data: { fin: now, cierre: "pausa", comentario: obs || null },
    });

    // Recalcular horas reales + estado rollup. Si otro técnico sigue activo, la
    // tarea no queda "pausado" global (refleja el estado real del conjunto).
    const todas = await prisma.planificacionOTSesion.findMany({
      where: { planificacion_ot_id: planId },
      select: { tecnico: true, inicio: true, fin: true, cierre: true },
    });
    const horas = sumarHorasReales(todas);
    const plan = await prisma.planificacionOT.findUnique({ where: { id: planId }, select: { tecnico: true, observaciones: true } });
    const estadoTarea = rollupEstadoTarea(splitRecursos(plan?.tecnico), todas);

    // Observaciones del técnico (acumulativas): se anexan a las existentes.
    let observaciones: string | undefined;
    if (obs) {
      observaciones = plan?.observaciones ? `${plan.observaciones}\n${obs}` : obs;
    }

    await prisma.planificacionOT.update({
      where: { id: planId },
      data: { estado: estadoTarea, horas_reales: horas, ...(observaciones !== undefined ? { observaciones } : {}) },
    });

    return NextResponse.json({ ok: true, horas_reales: horas, fin: now.toISOString() });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/pausar error:", error);
    return NextResponse.json({ error: "Error al pausar" }, { status: 500 });
  }
}

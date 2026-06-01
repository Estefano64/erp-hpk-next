import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumarHorasReales, rollupEstadoTarea } from "@/lib/plan-sesion";
import { splitRecursos } from "@/lib/recursos";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/planificacion/:id/finalizar — el técnico da por terminada la tarea.
// Si hay una sesión abierta del mismo técnico, la cierra (cierre="finalizado")
// y suma su duración. Setea fecha_fin_real=now y estado="realizado".
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

    const plan = await prisma.planificacionOT.findUnique({
      where: { id: planId },
      select: { id: true, estado: true, observaciones: true, tecnico: true },
    });
    if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    if (plan.estado === "realizado") {
      return NextResponse.json({ error: "La tarea ya está finalizada" }, { status: 409 });
    }

    const now = new Date();

    // Cierra cualquier sesión abierta del mismo técnico sobre esta tarea.
    const abierta = await prisma.planificacionOTSesion.findFirst({
      where: { planificacion_ot_id: planId, tecnico: tecnicoNombre, fin: null },
    });
    if (abierta) {
      await prisma.planificacionOTSesion.update({
        where: { id: abierta.id },
        data: { fin: now, cierre: "finalizado", comentario: obs || null },
      });
    }

    // Recalcular total de horas reales + estado rollup (multi-técnico).
    const todas = await prisma.planificacionOTSesion.findMany({
      where: { planificacion_ot_id: planId },
      select: { tecnico: true, inicio: true, fin: true, cierre: true },
    });
    const horas = sumarHorasReales(todas);
    // La tarea solo queda "realizado" cuando TODOS los técnicos asignados
    // terminaron; si falta alguno, no se cierra ni bloquea al resto.
    const estadoTarea = rollupEstadoTarea(splitRecursos(plan.tecnico), todas);
    const tareaCompleta = estadoTarea === "realizado";

    const observaciones = obs
      ? (plan.observaciones ? `${plan.observaciones}\n${obs}` : obs)
      : undefined;

    await prisma.planificacionOT.update({
      where: { id: planId },
      data: {
        estado: estadoTarea,
        fecha_fin_real: tareaCompleta ? now : null,
        horas_reales: horas,
        ...(observaciones !== undefined ? { observaciones } : {}),
      },
    });

    return NextResponse.json({ ok: true, horas_reales: horas, tareaCompleta, estado: estadoTarea });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/finalizar error:", error);
    return NextResponse.json({ error: "Error al finalizar" }, { status: 500 });
  }
}

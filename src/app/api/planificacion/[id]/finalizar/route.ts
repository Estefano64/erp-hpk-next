import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumarHorasReales } from "@/lib/plan-sesion";

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
      select: { id: true, estado: true, observaciones: true },
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
        data: { fin: now, cierre: "finalizado" },
      });
    }

    // Recalcular total de horas reales.
    const todas = await prisma.planificacionOTSesion.findMany({
      where: { planificacion_ot_id: planId },
      select: { inicio: true, fin: true },
    });
    const horas = sumarHorasReales(todas);

    const observaciones = obs
      ? (plan.observaciones ? `${plan.observaciones}\n${obs}` : obs)
      : undefined;

    await prisma.planificacionOT.update({
      where: { id: planId },
      data: {
        estado: "realizado",
        fecha_fin_real: now,
        horas_reales: horas,
        ...(observaciones !== undefined ? { observaciones } : {}),
      },
    });

    return NextResponse.json({ ok: true, horas_reales: horas, fecha_fin_real: now.toISOString() });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/finalizar error:", error);
    return NextResponse.json({ error: "Error al finalizar" }, { status: 500 });
  }
}

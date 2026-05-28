import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/planificacion/:id/iniciar — el técnico arranca a trabajar la tarea.
// Reglas:
//   - El usuario debe estar enlazado a un Trabajador (campo trabajadorId).
//   - El técnico solo puede trabajar UNA tarea a la vez. Si hay otra sesión
//     abierta del mismo técnico, devuelve 409 con la tarea conflictiva.
//   - Crea una nueva fila en planificacion_ot_sesion con inicio=now.
//   - Setea estado="en_proceso" y (si era la primera vez) fecha_inicio_real.
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const userId = Number((session.user as { id?: string }).id);
    const me = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, roles: true, trabajador: { select: { trabajador_id: true, nombre: true } } },
    });
    if (!me?.trabajador) {
      return NextResponse.json({ error: "Tu usuario no está enlazado a un trabajador. Pedí al admin que lo configure." }, { status: 403 });
    }
    const tecnicoNombre = me.trabajador.nombre;

    const { id } = await ctx.params;
    const planId = Number(id);

    const plan = await prisma.planificacionOT.findUnique({
      where: { id: planId },
      select: { id: true, tecnico: true, estado: true, fecha_inicio_real: true },
    });
    if (!plan) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    // El técnico solo puede arrancar tareas que tenga asignadas (su nombre en
    // el campo `tecnico`, que puede tener múltiples separados por coma).
    const asignados = (plan.tecnico ?? "").split(",").map((s) => s.trim());
    if (!asignados.includes(tecnicoNombre) && !me.roles.includes("admin")) {
      return NextResponse.json({ error: "Esta tarea no está asignada a vos" }, { status: 403 });
    }
    if (plan.estado === "realizado") {
      return NextResponse.json({ error: "Esta tarea ya está finalizada" }, { status: 409 });
    }

    // ¿Tiene otra sesión abierta?
    const abiertaMia = await prisma.planificacionOTSesion.findFirst({
      where: { tecnico: tecnicoNombre, fin: null },
      include: { planificacion_ot: { select: { id: true, descripcion: true, ot_id: true } } },
    });
    if (abiertaMia) {
      // Si la abierta es la misma tarea, no duplicamos: devolvemos info.
      if (abiertaMia.planificacion_ot_id === planId) {
        return NextResponse.json({ ok: true, mensaje: "Ya tenías esta tarea en curso", sesion_id: abiertaMia.id });
      }
      return NextResponse.json({
        error: "Tenés otra tarea en curso. Pausala o finalizala antes de iniciar esta.",
        tareaEnCurso: {
          id: abiertaMia.planificacion_ot_id,
          descripcion: abiertaMia.planificacion_ot.descripcion,
          ot_id: abiertaMia.planificacion_ot.ot_id,
        },
      }, { status: 409 });
    }

    const now = new Date();
    const sesion = await prisma.planificacionOTSesion.create({
      data: { planificacion_ot_id: planId, tecnico: tecnicoNombre, inicio: now },
    });
    await prisma.planificacionOT.update({
      where: { id: planId },
      data: {
        estado: "en_proceso",
        // Solo seteamos fecha_inicio_real la primera vez (después no se toca).
        ...(plan.fecha_inicio_real ? {} : { fecha_inicio_real: now }),
      },
    });

    return NextResponse.json({ ok: true, sesion_id: sesion.id, inicio: now.toISOString() });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/iniciar error:", error);
    return NextResponse.json({ error: "Error al iniciar" }, { status: 500 });
  }
}

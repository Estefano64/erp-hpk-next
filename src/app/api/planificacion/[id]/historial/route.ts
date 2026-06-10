import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/planificacion/[id]/historial — eventos de ejecución de la tarea:
// cada sesión (inicio, fin, cómo se cerró: pausa/finalizado/cancelado) con el
// comentario que dejó el técnico. Alimenta el ícono de "historial" en Planificación.
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = Number(id);
    const tarea = await prisma.planificacionOT.findUnique({
      where: { id: planId },
      select: { id: true, es_correctivo: true, observaciones: true, fecha_inicio_real: true, fecha_fin_real: true },
    });
    if (!tarea) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const sesiones = await prisma.planificacionOTSesion.findMany({
      where: { planificacion_ot_id: planId },
      orderBy: { inicio: "asc" },
      select: { id: true, tecnico: true, inicio: true, fin: true, cierre: true, comentario: true, motivo_pausa: true },
    });

    return NextResponse.json({
      es_correctivo: tarea.es_correctivo,
      observaciones: tarea.observaciones,
      fecha_inicio_real: tarea.fecha_inicio_real,
      fecha_fin_real: tarea.fecha_fin_real,
      sesiones,
    });
  } catch (error) {
    console.error("GET /api/planificacion/[id]/historial error:", error);
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 500 });
  }
}

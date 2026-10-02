import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { generarTareasDesdeEvaluacion } from "@/lib/tareas-desde-evaluacion";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/ordenes-trabajo/[id]/planificacion/desde-evaluacion
// Genera (o completa) las tareas de la OT a partir de las recomendaciones
// marcadas en su hoja de evaluación. Idempotente: no duplica tareas existentes.
// Se puede correr en cualquier estado de la hoja; al aprobarla se corre solo.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const ev = await prisma.evaluacionTecnica.findFirst({
      where: { ot_id: otId },
      orderBy: [{ updatedAt: "desc" }],
      select: { id: true, estado: true },
    });
    if (!ev) {
      return NextResponse.json({ error: "La OT no tiene hoja de evaluación." }, { status: 400 });
    }

    const resultado = await prisma.$transaction((tx) => generarTareasDesdeEvaluacion(tx, ev.id, usuario));
    return NextResponse.json({ success: true, ...resultado });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    console.error("POST /api/ordenes-trabajo/[id]/planificacion/desde-evaluacion error:", error);
    return NextResponse.json({ error: "Error al generar tareas desde la hoja de evaluación" }, { status: 500 });
  }
}

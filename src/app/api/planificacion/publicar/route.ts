import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { splitRecursos } from "@/lib/recursos";

// POST /api/planificacion/publicar
// Body: { semana: string, tecnico: string, publicado: boolean }
// Marca (o desmarca) como "publicada" la planificación de un operario para una
// semana: el planner termina de planificarle y deja de ser borrador para el
// técnico. Actúa sobre todas las tareas de ese operario en esa semana_plan.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { semana?: string; tecnico?: string; publicado?: boolean };
    const semana = (body.semana ?? "").trim();
    const tecnico = (body.tecnico ?? "").trim();
    const publicado = !!body.publicado;
    if (!semana || !tecnico) {
      return NextResponse.json({ error: "Faltan 'semana' y 'tecnico'" }, { status: 400 });
    }

    // Tareas de esa semana asignadas a ese operario (tecnico puede ser multi: "A | B").
    const candidatas = await prisma.planificacionOT.findMany({
      where: { semana_plan: semana, tecnico: { not: null } },
      select: { id: true, tecnico: true },
    });
    const ids = candidatas.filter((t) => splitRecursos(t.tecnico).includes(tecnico)).map((t) => t.id);
    if (ids.length === 0) {
      return NextResponse.json({ count: 0, publicado });
    }
    const res = await prisma.planificacionOT.updateMany({
      where: { id: { in: ids } },
      data: { publicado },
    });
    return NextResponse.json({ count: res.count, publicado });
  } catch (error) {
    console.error("POST /api/planificacion/publicar error:", error);
    return NextResponse.json({ error: "Error al publicar" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { splitRecursos } from "@/lib/recursos";

// POST /api/planificacion/publicar
// Body: { semana: string, tecnico: string, publicado: boolean, rebasar?: boolean }
// Marca (o desmarca) como "publicada" la planificación de un operario para una
// semana: el planner termina de planificarle y deja de ser borrador para el
// técnico. Actúa sobre todas las tareas de ese operario en esa semana_plan.
//
// LÍNEA BASE: al publicar (publicado=true) se congela un snapshot del plan
// (fecha_inicio/fin, horas_estimadas, tecnico, semana) en las columnas *_base.
// Solo se setea si está vacío, para no perder el plan original cuando luego la
// tarea se mueva o un correctivo la empuje. `rebasar:true` fuerza re-snapshot.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { semana?: string; tecnico?: string; publicado?: boolean; ids?: unknown; rebasar?: boolean };
    const semana = (body.semana ?? "").trim();
    const tecnico = (body.tecnico ?? "").trim();
    const publicado = !!body.publicado;
    const rebasar = !!body.rebasar;

    // Resolver el conjunto de IDs a publicar.
    let idsToPublish: number[] = [];

    // Vía preferida: el cliente manda los IDs exactos a publicar (determinista).
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((n): n is number => Number.isInteger(n))
      : [];
    if (ids.length > 0) {
      idsToPublish = ids;
    } else {
      if (!semana || !tecnico) {
        return NextResponse.json({ error: "Faltan 'semana' y 'tecnico' (o 'ids')" }, { status: 400 });
      }
      // Fallback: tareas de esa semana asignadas a ese operario (tecnico puede ser multi: "A | B").
      // Publicar congela solo lo AGENDADO (con fecha); reabrir toma todas (limpia
      // flags `publicado` colgados de tareas sin agenda). Mismo criterio que el front.
      const candidatas = await prisma.planificacionOT.findMany({
        where: {
          semana_plan: semana,
          tecnico: { not: null },
          ...(publicado ? { fecha_inicio: { not: null } } : {}),
        },
        select: { id: true, tecnico: true },
      });
      idsToPublish = candidatas.filter((t) => splitRecursos(t.tecnico).includes(tecnico)).map((t) => t.id);
    }

    if (idsToPublish.length === 0) {
      return NextResponse.json({ count: 0, publicado });
    }

    const res = await prisma.planificacionOT.updateMany({
      where: { id: { in: idsToPublish } },
      data: { publicado },
    });

    // Snapshot de línea base solo al publicar. Copia columna→columna vía SQL.
    let baseCount = 0;
    if (publicado) {
      const cond = rebasar ? Prisma.empty : Prisma.sql`AND "fecha_inicio_base" IS NULL`;
      baseCount = await prisma.$executeRaw`
        UPDATE "planificacion_ot"
           SET "fecha_inicio_base"    = "fecha_inicio",
               "fecha_fin_base"       = "fecha_fin",
               "horas_estimadas_base" = "horas_estimadas",
               "tecnico_base"         = "tecnico",
               "semana_base"          = "semana_plan",
               "publicado_at"         = NOW()
         WHERE "id" = ANY(${idsToPublish})
           ${cond}
      `;
    }

    return NextResponse.json({ count: res.count, publicado, baseCount });
  } catch (error) {
    console.error("POST /api/planificacion/publicar error:", error);
    return NextResponse.json({ error: "Error al publicar" }, { status: 500 });
  }
}

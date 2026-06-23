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
// Por defecto solo se setea si está vacío, para no perder el plan original. Hay
// dos formas de FORZAR el re-snapshot: `rebasar:true` (toda la semana, incluso
// ya ejecutadas) o `rebasarIds:[...]` (subconjunto puntual: tareas no empezadas
// que el planner movió tras el envío y cuya foto quedó vieja).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { semana?: string; tecnico?: string; publicado?: boolean; ids?: unknown; rebasar?: boolean; rebasarIds?: unknown };
    const semana = (body.semana ?? "").trim();
    const tecnico = (body.tecnico ?? "").trim();
    const publicado = !!body.publicado;
    const rebasar = !!body.rebasar;
    // Subconjunto cuya foto hay que REFRESCAR a la fuerza aunque ya estuviera
    // enviada. Puede incluir ids que no están en `ids` (ya publicadas): igual se
    // re-fotografían. Solo aplica al enviar (publicado=true).
    const rebasarIds = Array.isArray(body.rebasarIds)
      ? (body.rebasarIds as unknown[]).filter((n): n is number => Number.isInteger(n))
      : [];

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

    // Al enviar, también tocamos las de rebasarIds que ya estaban publicadas
    // (no vienen en `ids` pero hay que setearles publicado=true y re-fotografiar).
    const toUpdate = publicado
      ? Array.from(new Set([...idsToPublish, ...rebasarIds]))
      : idsToPublish;
    if (toUpdate.length === 0) {
      return NextResponse.json({ count: 0, publicado });
    }

    const res = await prisma.planificacionOT.updateMany({
      where: { id: { in: toUpdate } },
      data: { publicado },
    });

    // Snapshot de línea base (foto del plan) solo al publicar. Copia col→col vía SQL.
    //   force=true  → pisa la foto con el plan actual (rebasar / mover ya enviada).
    //   force=false → solo escribe si está vacía (primera foto; no pisa la original).
    const fotografiar = (targetIds: number[], force: boolean): Promise<number> => {
      if (targetIds.length === 0) return Promise.resolve(0);
      const cond = force ? Prisma.empty : Prisma.sql`AND "fecha_inicio_base" IS NULL`;
      return prisma.$executeRaw`
        UPDATE "planificacion_ot"
           SET "fecha_inicio_base"    = "fecha_inicio",
               "fecha_fin_base"       = "fecha_fin",
               "horas_estimadas_base" = "horas_estimadas",
               "tecnico_base"         = "tecnico",
               "semana_base"          = "semana_plan",
               "publicado_at"         = NOW()
         WHERE "id" = ANY(${targetIds})
           ${cond}
      `;
    };

    let baseCount = 0;
    if (publicado) {
      if (rebasar) {
        // Re-enviar: rehace la foto de TODO lo publicado (incluso ya ejecutadas).
        baseCount = await fotografiar(idsToPublish, true);
      } else {
        // Enviar normal: refresca a la fuerza las de rebasarIds (no empezadas,
        // movidas tras el envío) y congela por primera vez el resto.
        const rebasarSet = new Set(rebasarIds);
        baseCount += await fotografiar(rebasarIds, true);
        baseCount += await fotografiar(idsToPublish.filter((id) => !rebasarSet.has(id)), false);
      }
    }

    return NextResponse.json({ count: res.count, publicado, baseCount });
  } catch (error) {
    console.error("POST /api/planificacion/publicar error:", error);
    return NextResponse.json({ error: "Error al publicar" }, { status: 500 });
  }
}

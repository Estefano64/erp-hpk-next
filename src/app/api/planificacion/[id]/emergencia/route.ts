import { NextRequest, NextResponse } from "next/server";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { prisma } from "@/lib/prisma";
import { calcularFinEstimado, normalizarAInicioHabil } from "@/lib/planification-hours";
import { splitRecursos } from "@/lib/recursos";

dayjs.extend(isoWeek);

type Ctx = { params: Promise<{ id: string }> };

function semanaCodigo(d: Date): string {
  const dj = dayjs(d);
  return `${dj.isoWeekYear()}W${String(dj.isoWeek()).padStart(2, "0")}`;
}

// POST /api/planificacion/[id]/emergencia
// Marca la tarea como CORRECTIVA (emergencia) y reacomoda automáticamente las
// tareas del MISMO día y operario(s) que arranquen en/después de ella:
//   - se empujan para después de la emergencia (respetando jornada y almuerzo);
//   - las que ya no entran en ese día se mandan al pool (sin fecha) para que el
//     planner las reubique.
// Solo afecta el día de la emergencia: los demás días quedan intactos.
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = Number(id);

    const result = await prisma.$transaction(async (tx) => {
      const T = await tx.planificacionOT.findUnique({ where: { id: planId } });
      if (!T) throw Object.assign(new Error("No encontrado"), { code: "NOT_FOUND" });

      // Marcar como correctiva SIN tocar el estado de ejecución (son conceptos
      // independientes: una correctiva puede estar en_proceso/pausado/realizado).
      await tx.planificacionOT.update({ where: { id: planId }, data: { es_correctivo: true } });

      // Sin fecha o sin operario no hay nada que reacomodar (queda en el pool roja).
      if (!T.fecha_inicio || !T.tecnico) {
        return { correctivo: planId, empujadas: [] as number[], alPool: [] as number[] };
      }

      const opsT = splitRecursos(T.tecnico);
      const dia = dayjs(T.fecha_inicio);
      const diaIni = dia.startOf("day").toDate();
      const diaFin = dia.endOf("day").toDate();
      const S = T.fecha_inicio; // inicio de la emergencia

      // Fin de la emergencia. Si es HE usa su fecha_fin; si no, lo calcula por jornada.
      const qtyT = Math.max(1, Number(T.qty_personal ?? 1));
      const finT = T.horas_extras && T.fecha_fin
        ? T.fecha_fin
        : calcularFinEstimado(T.fecha_inicio, Number(T.horas_estimadas ?? 0) * qtyT);

      // Candidatas: tareas del mismo día (cualquier hora), activas y NO emergencias.
      const candidatas = await tx.planificacionOT.findMany({
        where: {
          id: { not: planId },
          tecnico: { not: null },
          es_correctivo: false,
          fecha_inicio: { gte: diaIni, lte: diaFin },
          estado: { notIn: ["cancelado", "realizado"] },
        },
        orderBy: { fecha_inicio: "asc" },
      });
      // Afectadas: comparten operario Y no terminan antes de que arranque la
      // emergencia (es decir, arrancan después O se solapan con ella). Las que
      // terminan antes de S quedan donde están.
      const afectadas = candidatas.filter((c) => {
        if (!splitRecursos(c.tecnico).some((o) => opsT.includes(o))) return false;
        const termina = c.fecha_fin ?? c.fecha_inicio;
        return (c.fecha_inicio && c.fecha_inicio >= S) || (termina != null && termina > S);
      });

      // SOLO se reprograma lo que NO empezó: si una tarea ya tiene sesiones
      // (en proceso / pausada / con tramos reales), su plan es historia y no se
      // mueve. Las sesiones son la verdad; el técnico la pausa/reanuda aparte.
      const idsAfect = afectadas.map((a) => a.id);
      const conSesion = idsAfect.length
        ? new Set(
            (await tx.planificacionOTSesion.findMany({
              where: { planificacion_ot_id: { in: idsAfect } },
              select: { planificacion_ot_id: true },
            })).map((s) => s.planificacion_ot_id),
          )
        : new Set<number>();
      const aReprogramar = afectadas.filter((a) => !conSesion.has(a.id));

      const empujadas: number[] = [];
      const alPool: number[] = [];
      let cursor: Date = finT;

      for (const c of aReprogramar) {
        const inicioHabil = normalizarAInicioHabil(cursor);
        // Si el nuevo inicio cae en otro día (no entró en la jornada de hoy) → pool.
        if (!dayjs(inicioHabil).isSame(dia, "day")) {
          await tx.planificacionOT.update({
            where: { id: c.id },
            data: { fecha_inicio: null, fecha_fin: null },
          });
          alPool.push(c.id);
          continue;
        }
        const qty = Math.max(1, Number(c.qty_personal ?? 1));
        const fin = calcularFinEstimado(inicioHabil, Number(c.horas_estimadas ?? 0) * qty);
        await tx.planificacionOT.update({
          where: { id: c.id },
          data: { fecha_inicio: inicioHabil, fecha_fin: fin, semana_plan: semanaCodigo(inicioHabil) },
        });
        empujadas.push(c.id);
        cursor = fin;
      }

      return { correctivo: planId, empujadas, alPool };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("POST /api/planificacion/[id]/emergencia error:", error);
    return NextResponse.json({ error: "Error al marcar emergencia" }, { status: 500 });
  }
}

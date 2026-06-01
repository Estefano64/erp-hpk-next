import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { Prisma } from "@prisma/client";
import { calcularFinEstimado, normalizarAInicioHabil } from "@/lib/planification-hours";
import { splitRecursos } from "@/lib/recursos";

dayjs.extend(isoWeek);

function semanaCodigo(d: Date): string {
  const dj = dayjs(d);
  return `${dj.isoWeekYear()}W${String(dj.isoWeek()).padStart(2, "0")}`;
}

// Reacomodo por EMERGENCIA (correctiva): marca la tarea como correctiva y empuja
// las del mismo día/operario. Wrapper sobre cascadeReprogramar.
export async function cascadeEmergencia(
  tx: Prisma.TransactionClient,
  planId: number,
): Promise<{ empujadas: number[]; alPool: number[] }> {
  return cascadeReprogramar(tx, planId, { marcarCorrectivo: true });
}

// Reacomodo: empuja las tareas del MISMO día y operario(s) que arrancan en/después
// de la tarea `planId` (o se solapan). Las que no entran en el día van al pool.
// SOLO mueve lo que NO empezó (sin sesiones) ni está terminado. Lo usan:
//   - emergencia (marcarCorrectivo: true)
//   - "empujar al soltar" en el drag normal (marcarCorrectivo: false)
export async function cascadeReprogramar(
  tx: Prisma.TransactionClient,
  planId: number,
  opts: { marcarCorrectivo: boolean },
): Promise<{ empujadas: number[]; alPool: number[] }> {
  const T = await tx.planificacionOT.findUnique({ where: { id: planId } });
  if (!T) return { empujadas: [], alPool: [] };

  if (opts.marcarCorrectivo && !T.es_correctivo) {
    await tx.planificacionOT.update({ where: { id: planId }, data: { es_correctivo: true } });
  }

  if (!T.fecha_inicio || !T.tecnico) return { empujadas: [], alPool: [] };

  const opsT = splitRecursos(T.tecnico);
  const dia = dayjs(T.fecha_inicio);
  const diaIni = dia.startOf("day").toDate();
  const diaFin = dia.endOf("day").toDate();
  const S = T.fecha_inicio;

  const qtyT = Math.max(1, Number(T.qty_personal ?? 1));
  const finT = T.horas_extras && T.fecha_fin
    ? T.fecha_fin
    : calcularFinEstimado(T.fecha_inicio, Number(T.horas_estimadas ?? 0) * qtyT);

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
  const afectadas = candidatas.filter((c) => {
    if (!splitRecursos(c.tecnico).some((o) => opsT.includes(o))) return false;
    const termina = c.fecha_fin ?? c.fecha_inicio;
    return (c.fecha_inicio && c.fecha_inicio >= S) || (termina != null && termina > S);
  });

  // Solo lo NO empezado (sin sesiones): el plan de lo ya ejecutado es historia.
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
    if (!dayjs(inicioHabil).isSame(dia, "day")) {
      await tx.planificacionOT.update({ where: { id: c.id }, data: { fecha_inicio: null, fecha_fin: null } });
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

  return { empujadas, alPool };
}

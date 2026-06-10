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
  // cruzarDias: si una tarea empujada no entra en el día, en vez de mandarla al
  // pool se sigue ubicando en el siguiente día hábil (encadena hacia adelante).
  // Lo usa el "empujar al soltar". La emergencia deja cruzarDias=false (overflow
  // al pool, su comportamiento histórico).
  opts: { marcarCorrectivo: boolean; cruzarDias?: boolean },
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
      // cruzarDias: tomamos también las de días siguientes para re-encadenarlas
      // (así "empujar" desplaza toda la cola del operario, no solo el día).
      fecha_inicio: opts.cruzarDias ? { gte: diaIni } : { gte: diaIni, lte: diaFin },
      estado: { notIn: ["cancelado", "realizado"] },
      // Las HE viven fuera de la jornada (banda ≥18:00, reloj continuo): no
      // compiten por el horario de jornada y NO se empujan — re-encadenarlas con
      // calcularFinEstimado las metía a la jornada dejando el flag HE colgado.
      // (OR explícito: `not: true` excluiría los null por lógica SQL trivaluada.)
      OR: [{ horas_extras: false }, { horas_extras: null }],
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
    // Solo EMPUJAR, nunca adelantar (decisión 2026-06-09): si la cascada no la
    // alcanza (arranca en/después del cursor), la tarea se queda donde está —
    // se respetan los huecos que el planner dejó a propósito. Sigue siendo
    // obstáculo: el cursor avanza hasta su fin para encadenar a las siguientes.
    const origIni = c.fecha_inicio!;
    if (origIni.getTime() >= cursor.getTime()) {
      const qtyC = Math.max(1, Number(c.qty_personal ?? 1));
      cursor = c.fecha_fin ?? calcularFinEstimado(origIni, Number(c.horas_estimadas ?? 0) * qtyC);
      continue;
    }
    const inicioHabil = normalizarAInicioHabil(cursor);
    // Sin cruzarDias (emergencia): lo que no entra en el día va al pool.
    // Con cruzarDias (empujar): se sigue ubicando en el siguiente día hábil.
    if (!opts.cruzarDias && !dayjs(inicioHabil).isSame(dia, "day")) {
      // Al pool: además de las fechas se resetea el estado (programado → abierto)
      // y el flag publicado (sin agenda no hay plan congelado). Conserva su
      // semana_plan: queda en la bandeja "esta semana sin hora" para reubicarla.
      await tx.planificacionOT.update({
        where: { id: c.id },
        data: { fecha_inicio: null, fecha_fin: null, estado: "abierto", publicado: false },
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

  return { empujadas, alPool };
}

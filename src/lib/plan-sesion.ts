// Helpers compartidos para los endpoints iniciar/pausar/finalizar de tareas de
// planificación. Suma duraciones de las sesiones cerradas y devuelve las horas
// reales acumuladas.

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Lima";

// Ventana de CONTEO del tiempo real: más ancha que la jornada (8–18) a pedido
// del equipo (2026-06-10): quien arranca minutos antes de las 8 o se queda un
// rato después de las 18 lo suma como hora NORMAL (no es HE). El tope
// 07:00–20:00 L–V sigue protegiendo contra sesiones olvidadas (la noche y el
// fin de semana no cuentan; el planner regulariza la Dur. real si hace falta).
const CONTEO_INI_MIN = 7 * 60;
const CONTEO_FIN_MIN = 20 * 60;
const ALM_INI_MIN = 12 * 60 + 30;
const ALM_FIN_MIN = 13 * 60 + 30;

/**
 * Tiempo REAL trabajado entre dos instantes (hora de Perú):
 *  - cuenta dentro de la ventana 07:00–20:00, L–V (reloj corrido, sin recortar
 *    el "antes de las 8 / después de las 18" — eso es hora normal acá);
 *  - descuenta el almuerzo (12:30–13:30) SOLO si la sesión cubre la ventana
 *    completa (trabajó "de corrido"). Si el técnico pausó dentro de esa franja
 *    —p.ej. un día que el almuerzo se corre a 13:00— él ya manejó el descanso
 *    con su pausa y no se le descuenta nada extra (sin doble descuento).
 */
export function horasRealesEntre(inicio: Date, fin: Date): number {
  if (fin.getTime() <= inicio.getTime()) return 0;
  let totalMin = 0;
  let dia = dayjs(inicio).tz(TZ).startOf("day");
  const finDj = dayjs(fin).tz(TZ);
  let guard = 0;
  while (dia.isBefore(finDj) && guard++ < 120) {
    const dow = dia.day();
    if (dow !== 0 && dow !== 6) {
      const vIni = dia.add(CONTEO_INI_MIN, "minute").valueOf();
      const vFin = dia.add(CONTEO_FIN_MIN, "minute").valueOf();
      const segIni = Math.max(inicio.getTime(), vIni);
      const segFin = Math.min(fin.getTime(), vFin);
      if (segFin > segIni) totalMin += (segFin - segIni) / 60000;
      const aIni = dia.add(ALM_INI_MIN, "minute").valueOf();
      const aFin = dia.add(ALM_FIN_MIN, "minute").valueOf();
      if (inicio.getTime() <= aIni && fin.getTime() >= aFin) totalMin -= 60;
    }
    dia = dia.add(1, "day");
  }
  return Math.max(0, Math.round((totalMin / 60) * 100) / 100);
}

// Horas trabajadas en un conjunto de sesiones (ventana 07–20, almuerzo
// descontado solo si se trabajó de corrido — ver horasRealesEntre). Las PAUSAS
// quedan fuera porque cierran la sesión (la suma es por sesión).
export function horasHabilesDeSesiones(sesiones: { inicio: Date; fin: Date | null }[]): number {
  let h = 0;
  for (const s of sesiones) {
    if (s.fin) h += horasRealesEntre(s.inicio, s.fin);
  }
  return Math.round(h * 100) / 100;
}

// Duración REAL de UNA tarea = horas hábiles de sus sesiones + Horas Extra (HE),
// si la tarea está marcada como HE. La HE es trabajo fuera de jornada, así que se
// suma como la cantidad de HE (igual que HH = estimada × qty + HE, pero del lado real).
export function duracionRealTarea(
  sesiones: { inicio: Date; fin: Date | null }[],
  esHE: boolean,
  // Prisma entrega horas_extras_qty como Decimal; aceptamos cualquier numérico.
  horasExtrasQty: number | string | { toString(): string } | null | undefined,
): number {
  const base = horasHabilesDeSesiones(sesiones);
  const he = esHE ? Math.max(0, Number(horasExtrasQty ?? 0)) : 0;
  return Math.round((base + he) * 100) / 100;
}

// ── Estado POR TÉCNICO derivado de las sesiones ──────────────────────────────
// Una tarea puede tener varios técnicos (campo `tecnico` = "A | B"). Cada uno
// tiene su propio avance, que se deriva de SUS sesiones (no hace falta una tabla
// nueva: la sesión ya guarda `tecnico` + `cierre`).
export type EstadoTecnico = "sin_empezar" | "en_proceso" | "pausado" | "realizado";

export interface SesionLite {
  tecnico: string;
  inicio: Date;
  fin: Date | null;
  cierre: string | null;
}

/** Estado de UN técnico en una tarea, a partir de sus sesiones. */
export function estadoTecnico(sesionesDelTecnico: SesionLite[]): EstadoTecnico {
  if (sesionesDelTecnico.length === 0) return "sin_empezar";
  if (sesionesDelTecnico.some((s) => s.fin === null)) return "en_proceso";
  const ultima = [...sesionesDelTecnico].sort((a, b) => a.inicio.getTime() - b.inicio.getTime()).at(-1)!;
  return ultima.cierre === "finalizado" ? "realizado" : "pausado";
}

/**
 * Estado "rollup" de la TAREA a partir de los técnicos asignados y las sesiones.
 *  - realizado  → todos los asignados terminaron
 *  - en_proceso → alguno está trabajando ahora
 *  - pausado    → alguno pausó y nadie está activo
 *  - programado → asignados sin empezar
 */
export function rollupEstadoTarea(
  asignados: string[],
  sesiones: SesionLite[],
): "programado" | "en_proceso" | "pausado" | "realizado" {
  if (asignados.length === 0) {
    return sesiones.some((s) => s.fin === null) ? "en_proceso" : "programado";
  }
  const estados = asignados.map((t) => estadoTecnico(sesiones.filter((s) => s.tecnico === t)));
  if (estados.every((e) => e === "realizado")) return "realizado";
  if (estados.some((e) => e === "en_proceso")) return "en_proceso";
  if (estados.some((e) => e === "pausado")) return "pausado";
  return "programado";
}

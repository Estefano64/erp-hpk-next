// Helpers compartidos para los endpoints iniciar/pausar/finalizar de tareas de
// planificación. Suma duraciones de las sesiones cerradas y devuelve las horas
// reales acumuladas.

import { horasHabilesEntre } from "./planification-hours";

// Horas de JORNADA trabajadas en un conjunto de sesiones (jornada 8–18, sin
// almuerzo, L–V). Las PAUSAS quedan fuera porque cierran la sesión (la suma es
// por sesión). El tiempo fuera de jornada (noche / fin de semana) NO se cuenta:
// si el técnico se olvidó de marcar su fin de día, la jornada igual lo acota (y
// el planner puede ajustar la Dur. real a mano si hace falta).
export function horasHabilesDeSesiones(sesiones: { inicio: Date; fin: Date | null }[]): number {
  let h = 0;
  for (const s of sesiones) {
    if (s.fin) h += horasHabilesEntre(s.inicio, s.fin);
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

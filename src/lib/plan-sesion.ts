// Helpers compartidos para los endpoints iniciar/pausar/finalizar de tareas de
// planificación. Suma duraciones de las sesiones cerradas y devuelve las horas
// reales acumuladas.

import { minutosAlmuerzoEntre } from "./planification-hours";

// Horas trabajadas de UNA sesión = reloj continuo, descontando el ALMUERZO que
// la sesión cruce (12:30–13:30). Las PAUSAS ya quedan fuera porque cierran la
// sesión (la suma es por sesión, sin contar los huecos entre ellas). NO se
// recorta el fin de jornada: cada técnico marca su fin de día; si alguien se
// olvidó y dejó la sesión abierta, el planner regulariza la duración real a mano.
// HE = tiempo continuo sin descuento (es trabajo fuera de jornada, sin almuerzo).
function horasDeSesion(inicio: Date, fin: Date, esHE: boolean): number {
  const horasReloj = (fin.getTime() - inicio.getTime()) / 36e5;
  if (esHE) return horasReloj;
  return Math.max(0, horasReloj - minutosAlmuerzoEntre(inicio, fin) / 60);
}

export function sumarHorasReales(
  sesiones: { inicio: Date; fin: Date | null }[],
  esHE = false,
): number {
  let horas = 0;
  for (const s of sesiones) {
    if (s.fin) horas += horasDeSesion(s.inicio, s.fin, esHE);
  }
  return Math.round(horas * 100) / 100;
}

// Variante para sumas que MEZCLAN tareas (ej. el mes del técnico): cada sesión
// usa el flag HE de SU tarea.
export function sumarHorasRealesPorTarea(
  sesiones: { planificacion_ot_id: number; inicio: Date; fin: Date | null }[],
  esHEPorTarea: Map<number, boolean>,
): number {
  let horas = 0;
  for (const s of sesiones) {
    if (s.fin) horas += horasDeSesion(s.inicio, s.fin, esHEPorTarea.get(s.planificacion_ot_id) ?? false);
  }
  return Math.round(horas * 100) / 100;
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

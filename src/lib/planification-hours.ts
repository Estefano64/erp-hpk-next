/**
 * Cálculo de horas hábiles para planificación.
 *
 * Reglas:
 *  - Lunes a Viernes solamente (sábado y domingo no cuentan)
 *  - Jornada: 08:00 – 18:00
 *  - Descanso almuerzo: 12:30 – 13:30 (no cuenta como tiempo laborable)
 *  - Horas extras NO se cuentan acá (se suman aparte al HH total)
 *
 * Dado un inicio y una duración efectiva en horas, devuelve el fin estimado
 * "moviendo el reloj" a través de la agenda hábil.
 */

const JORNADA_INICIO_HORA = 8;
const JORNADA_FIN_HORA = 18;
const ALMUERZO_INICIO_HORA = 12;
const ALMUERZO_INICIO_MIN = 30;
const ALMUERZO_FIN_HORA = 13;
const ALMUERZO_FIN_MIN = 30;

const HORAS_MANANA = (12 * 60 + 30 - (JORNADA_INICIO_HORA * 60)) / 60; // 4.5
const HORAS_TARDE = (JORNADA_FIN_HORA * 60 - (13 * 60 + 30)) / 60;     // 4.5
const HORAS_DIA = HORAS_MANANA + HORAS_TARDE;                            // 9

function esFinDeSemana(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function siguienteDiaHabilAlInicio(d: Date): Date {
  const next = new Date(d);
  while (true) {
    next.setDate(next.getDate() + 1);
    next.setHours(JORNADA_INICIO_HORA, 0, 0, 0);
    if (!esFinDeSemana(next)) return next;
  }
}

/**
 * Mueve un Date al próximo "slot hábil" si cae fuera.
 *  - Antes de 8am → 8am del mismo día (si es hábil) o siguiente día hábil
 *  - Durante el almuerzo (12:30-13:30) → 13:30
 *  - Después de 18:00 → 8am del siguiente día hábil
 *  - Fin de semana → lunes 8am
 */
export function normalizarAInicioHabil(fecha: Date): Date {
  const d = new Date(fecha);
  if (esFinDeSemana(d)) return siguienteDiaHabilAlInicio(d);
  const totalMin = d.getHours() * 60 + d.getMinutes();
  const JORNADA_INICIO_MIN = JORNADA_INICIO_HORA * 60;
  const JORNADA_FIN_MIN = JORNADA_FIN_HORA * 60;
  const ALM_INI = ALMUERZO_INICIO_HORA * 60 + ALMUERZO_INICIO_MIN;
  const ALM_FIN = ALMUERZO_FIN_HORA * 60 + ALMUERZO_FIN_MIN;

  if (totalMin < JORNADA_INICIO_MIN) {
    d.setHours(JORNADA_INICIO_HORA, 0, 0, 0);
    return d;
  }
  if (totalMin >= JORNADA_FIN_MIN) {
    return siguienteDiaHabilAlInicio(d);
  }
  if (totalMin >= ALM_INI && totalMin < ALM_FIN) {
    d.setHours(ALMUERZO_FIN_HORA, ALMUERZO_FIN_MIN, 0, 0);
    return d;
  }
  return d;
}

/**
 * Calcula fin estimado dado un inicio y cantidad de horas efectivas.
 * Mantiene el reloj dentro de las ventanas hábiles.
 */
export function calcularFinEstimado(inicio: Date, horasEfectivas: number): Date {
  if (!horasEfectivas || horasEfectivas <= 0) return new Date(inicio);
  let cursor = normalizarAInicioHabil(inicio);
  let restantes = horasEfectivas * 60; // en minutos

  while (restantes > 0) {
    const cursorMin = cursor.getHours() * 60 + cursor.getMinutes();
    // Determinar fin del slot actual
    let finSlotMin: number;
    if (cursorMin < ALMUERZO_INICIO_HORA * 60 + ALMUERZO_INICIO_MIN) {
      finSlotMin = ALMUERZO_INICIO_HORA * 60 + ALMUERZO_INICIO_MIN;
    } else {
      finSlotMin = JORNADA_FIN_HORA * 60;
    }
    const slotMin = finSlotMin - cursorMin;
    if (slotMin <= 0) {
      cursor = normalizarAInicioHabil(cursor);
      continue;
    }
    const consumir = Math.min(slotMin, restantes);
    cursor = new Date(cursor.getTime() + consumir * 60_000);
    restantes -= consumir;
    if (restantes <= 0) return cursor;
    // Saltamos al próximo slot
    cursor = normalizarAInicioHabil(cursor);
  }
  return cursor;
}

/**
 * HH total = duración × qty_personal + horas_extras_qty
 */
export function calcularHH(params: {
  duracionHrs: number | null | undefined;
  qtyPersonal: number | null | undefined;
  horasExtras: boolean | null | undefined;
  horasExtrasQty: number | null | undefined;
}): number {
  const dur = Number(params.duracionHrs ?? 0);
  const qty = Math.max(1, Number(params.qtyPersonal ?? 1));
  const he = Number(params.horasExtrasQty ?? 0);
  const heOn = params.horasExtras ? he : 0;
  return dur * qty + heOn;
}

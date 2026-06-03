/**
 * Cálculo de horas hábiles para planificación.
 *
 * Reglas:
 *  - Lunes a Viernes solamente (sábado y domingo no cuentan)
 *  - Jornada: 08:00 – 18:00 (hora de Perú)
 *  - Descanso almuerzo: 12:30 – 13:30 (no cuenta como tiempo laborable)
 *  - Horas extras NO se cuentan acá (se suman aparte al HH total)
 *
 * IMPORTANTE (timezone): la jornada está definida en hora de PERÚ. Estas funciones
 * se ejecutan tanto en el cliente (Perú) como en el SERVIDOR (Railway en UTC). Si
 * usáramos getHours()/setHours() del Date nativo, en el servidor 08:00 Perú
 * (=13:00 UTC) se interpretaría dentro del almuerzo y se empujaría mal. Por eso
 * toda la aritmética horaria se hace en America/Lima vía dayjs.
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = "America/Lima";

const JORNADA_INICIO_HORA = 8;
const JORNADA_FIN_HORA = 18;
const ALMUERZO_INICIO_HORA = 12;
const ALMUERZO_INICIO_MIN = 30;
const ALMUERZO_FIN_HORA = 13;
const ALMUERZO_FIN_MIN = 30;

const JORNADA_INICIO_MIN = JORNADA_INICIO_HORA * 60;          // 480
const JORNADA_FIN_MIN = JORNADA_FIN_HORA * 60;                // 1080
const ALM_INI = ALMUERZO_INICIO_HORA * 60 + ALMUERZO_INICIO_MIN; // 750
const ALM_FIN = ALMUERZO_FIN_HORA * 60 + ALMUERZO_FIN_MIN;       // 810

type Dj = dayjs.Dayjs;

function esFinDeSemana(d: Dj): boolean {
  const dow = d.day();
  return dow === 0 || dow === 6;
}

function siguienteDiaHabilAlInicio(d: Dj): Dj {
  let next = d.add(1, "day").hour(JORNADA_INICIO_HORA).minute(0).second(0).millisecond(0);
  while (esFinDeSemana(next)) next = next.add(1, "day");
  return next;
}

/**
 * Mueve un instante al próximo "slot hábil" si cae fuera (todo en hora de Perú).
 *  - Antes de 8am → 8am del mismo día (si es hábil) o siguiente día hábil
 *  - Durante el almuerzo (12:30-13:30) → 13:30
 *  - Después de 18:00 → 8am del siguiente día hábil
 *  - Fin de semana → lunes 8am
 */
export function normalizarAInicioHabil(fecha: Date): Date {
  const d = dayjs(fecha).tz(TZ);
  if (esFinDeSemana(d)) return siguienteDiaHabilAlInicio(d).toDate();
  const totalMin = d.hour() * 60 + d.minute();
  if (totalMin < JORNADA_INICIO_MIN) return d.hour(JORNADA_INICIO_HORA).minute(0).second(0).millisecond(0).toDate();
  if (totalMin >= JORNADA_FIN_MIN) return siguienteDiaHabilAlInicio(d).toDate();
  if (totalMin >= ALM_INI && totalMin < ALM_FIN) return d.hour(ALMUERZO_FIN_HORA).minute(ALMUERZO_FIN_MIN).second(0).millisecond(0).toDate();
  return d.toDate();
}

/**
 * Calcula fin estimado dado un inicio y cantidad de horas efectivas.
 * Mantiene el reloj dentro de las ventanas hábiles (hora de Perú).
 */
export function calcularFinEstimado(inicio: Date, horasEfectivas: number): Date {
  if (!horasEfectivas || horasEfectivas <= 0) return new Date(inicio);
  let cursor = dayjs(normalizarAInicioHabil(inicio)).tz(TZ);
  let restantes = horasEfectivas * 60; // en minutos
  let guard = 0;
  while (restantes > 0 && guard++ < 10000) {
    const cMin = cursor.hour() * 60 + cursor.minute();
    const finSlotMin = cMin < ALM_INI ? ALM_INI : JORNADA_FIN_MIN;
    const slotMin = finSlotMin - cMin;
    if (slotMin <= 0) {
      cursor = dayjs(normalizarAInicioHabil(cursor.toDate())).tz(TZ);
      continue;
    }
    const consumir = Math.min(slotMin, restantes);
    cursor = cursor.add(consumir, "minute");
    restantes -= consumir;
    if (restantes <= 0) return cursor.toDate();
    cursor = dayjs(normalizarAInicioHabil(cursor.toDate())).tz(TZ);
  }
  return cursor.toDate();
}

/**
 * Horas HÁBILES (jornada menos almuerzo, sólo L–V, hora de Perú) entre dos
 * instantes. Útil para prorratear la carga de una tarea que cruza el fin de
 * semana entre sus dos semanas.
 */
export function horasHabilesEntre(inicio: Date, fin: Date): number {
  if (fin.getTime() <= inicio.getTime()) return 0;
  const finMs = fin.getTime();
  let cursor = dayjs(normalizarAInicioHabil(inicio)).tz(TZ);
  let minutos = 0;
  let guard = 0;
  while (cursor.toDate().getTime() < finMs && guard++ < 10000) {
    const cMin = cursor.hour() * 60 + cursor.minute();
    const finSlotMin = cMin < ALM_INI ? ALM_INI : JORNADA_FIN_MIN;
    const slotEnd = cursor.hour(Math.floor(finSlotMin / 60)).minute(finSlotMin % 60).second(0).millisecond(0);
    const segEnd = Math.min(slotEnd.toDate().getTime(), finMs);
    if (segEnd > cursor.toDate().getTime()) minutos += (segEnd - cursor.toDate().getTime()) / 60000;
    cursor = dayjs(normalizarAInicioHabil(new Date(segEnd))).tz(TZ);
  }
  return Math.round((minutos / 60) * 100) / 100;
}

/**
 * Minutos de ALMUERZO (12:30–13:30 hora de Perú) que caen dentro de [inicio, fin].
 * Se usa para descontar el almuerzo de la duración real de una sesión que lo cruza
 * (sin recortar el resto: las horas fuera de jornada NO se tocan; el técnico marca
 * su fin de día y el planner regulariza los casos excepcionales).
 */
export function minutosAlmuerzoEntre(inicio: Date, fin: Date): number {
  if (fin.getTime() <= inicio.getTime()) return 0;
  const iniMs = inicio.getTime();
  const finMs = fin.getTime();
  let total = 0;
  let dia = dayjs(inicio).tz(TZ).startOf("day");
  const finDia = dayjs(fin).tz(TZ).endOf("day");
  let guard = 0;
  while (dia.toDate().getTime() <= finDia.toDate().getTime() && guard++ < 4000) {
    const lunchIni = dia.hour(ALMUERZO_INICIO_HORA).minute(ALMUERZO_INICIO_MIN).second(0).millisecond(0).toDate().getTime();
    const lunchFin = dia.hour(ALMUERZO_FIN_HORA).minute(ALMUERZO_FIN_MIN).second(0).millisecond(0).toDate().getTime();
    const a = Math.max(iniMs, lunchIni);
    const b = Math.min(finMs, lunchFin);
    if (b > a) total += (b - a) / 60000;
    dia = dia.add(1, "day");
  }
  return total;
}

/**
 * Fin estimado para trabajo en HORAS EXTRA (banda vespertina ≥ 18:00). Tiempo de
 * reloj CONTINUO: no descuenta almuerzo ni jornada (es tz-agnóstico).
 */
export function calcularFinHorasExtra(inicio: Date, horasTotales: number): Date {
  if (!horasTotales || horasTotales <= 0) return new Date(inicio);
  return new Date(inicio.getTime() + horasTotales * 3_600_000);
}

/**
 * Fin estimado que respeta si la tarea es en horas extra o en jornada normal.
 * Punto único de verdad usado por cliente y servidor.
 */
export function calcularFin(inicio: Date, horasTotales: number, esHorasExtra: boolean): Date {
  return esHorasExtra
    ? calcularFinHorasExtra(inicio, horasTotales)
    : calcularFinEstimado(inicio, horasTotales);
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

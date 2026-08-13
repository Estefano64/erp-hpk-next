// Helpers compartidos de las APIs del dashboard de Logística.
//
// 1. Rango de fechas en UTC: las columnas involucradas (fecha_solicitud,
//    fecha_facturacion, fecha_movimiento, fecha_despacho, ...) son @db.Date
//    → medianoche UTC. Los límites del rango deben construirse también en
//    UTC; con dayjs() local (Lima UTC-5) los registros del día 1 de cada
//    mes caían fuera del mes al correr en dev local. En Railway (TZ=UTC)
//    coincidían de casualidad — esto lo hace independiente de la TZ.
//
// 2. Separación de monedas: los montos NUNCA se suman entre monedas.
//    Todo agregado monetario se reporta como { usd, sol }.

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(utc);
dayjs.extend(isoWeek);

export type MontoPorMoneda = { usd: number; sol: number };

export function montoCero(): MontoPorMoneda {
  return { usd: 0, sol: 0 };
}

// SOL y PEN son etiquetas históricas del mismo sol peruano; el resto
// (USD o null) se trata como dólares — el default de la app es USD.
export function esSol(moneda: string | null | undefined): boolean {
  return moneda === "SOL" || moneda === "PEN";
}

export function sumarMonto(acc: MontoPorMoneda, monto: number, moneda: string | null | undefined): void {
  if (!Number.isFinite(monto)) return;
  if (esSol(moneda)) acc.sol += monto;
  else acc.usd += monto;
}

/** Rango [desde, hasta) en UTC para modo anio|mes|sem. */
export function rangoUTC(
  modo: string,
  anio: number,
  mes: number | null,
  sem: number | null,
): { desde: Date; hasta: Date } {
  if (modo === "mes" && mes != null) {
    return {
      desde: new Date(Date.UTC(anio, mes - 1, 1)),
      hasta: new Date(Date.UTC(anio, mes, 1)),
    };
  }
  if (modo === "sem" && sem != null) {
    // Semana ISO `sem` del año: el 4 de enero siempre cae en la semana 1.
    const desde = dayjs.utc(`${anio}-01-04`).startOf("isoWeek").add(sem - 1, "week");
    return { desde: desde.toDate(), hasta: desde.add(7, "day").toDate() };
  }
  return {
    desde: new Date(Date.UTC(anio, 0, 1)),
    hasta: new Date(Date.UTC(anio + 1, 0, 1)),
  };
}

/** Límites [1-ene, 1-ene siguiente) del año en UTC. */
export function anioUTC(anio: number): { inicio: Date; fin: Date } {
  return { inicio: new Date(Date.UTC(anio, 0, 1)), fin: new Date(Date.UTC(anio + 1, 0, 1)) };
}

/** Mes 0-11 de una columna fecha-pura (@db.Date) sin corrimiento de TZ. */
export function mesUTC(d: Date | string): number {
  return d instanceof Date ? d.getUTCMonth() : dayjs.utc(d).month();
}

/** Semana ISO de una columna fecha-pura (@db.Date) sin corrimiento de TZ. */
export function isoWeekUTC(d: Date | string): number {
  return dayjs.utc(d).isoWeek();
}

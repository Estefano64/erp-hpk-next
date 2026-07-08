// Días que una OT lleva (o estuvo) en el taller. Compartido por el listado de
// OTs externas y el detalle de OT, y alineado con el dashboard de Producción:
//
//   - OT entregada (taller_status Entregado/Cobranza): días entre la recepción
//     y la salida (fecha_despacho → fecha_entrega → fecha_facturacion, en ese
//     orden de respaldo — históricamente solo facturación se llenó bien).
//     Si no hay ninguna fecha de salida, devuelve null (mostrar un contador
//     que sigue creciendo para una OT que ya salió sería mentir).
//   - OT no entregada: días desde la recepción hasta hoy (sigue corriendo).
//
// Las fechas de OT son solo-día (medianoche UTC) — se normalizan con
// dateOnlyLocal para no correrse un día en Lima (ver reference en @/lib/dates).

import { dateOnlyLocal } from "@/lib/dates";

export interface DiasTallerInput {
  fecha_recepcion?: string | Date | null;
  fecha_despacho?: string | Date | null;
  fecha_entrega?: string | Date | null;
  fecha_facturacion?: string | Date | null;
  taller_status_codigo?: string | null;
}

export interface DiasTaller {
  dias: number;
  // true = la OT sigue en taller y el contador corre hasta hoy.
  enCurso: boolean;
}

const MS_DIA = 86_400_000;

export function diasEnTaller(ot: DiasTallerInput): DiasTaller | null {
  const recep = dateOnlyLocal(ot.fecha_recepcion ?? null);
  if (!recep) return null;

  const entregada =
    ot.taller_status_codigo === "Entregado" || ot.taller_status_codigo === "Cobranza";

  if (entregada) {
    const salida =
      dateOnlyLocal(ot.fecha_despacho ?? null) ??
      dateOnlyLocal(ot.fecha_entrega ?? null) ??
      dateOnlyLocal(ot.fecha_facturacion ?? null);
    if (!salida) return null;
    const dias = Math.round((salida.getTime() - recep.getTime()) / MS_DIA);
    return dias >= 0 ? { dias, enCurso: false } : null;
  }

  // Medianoche LOCAL de hoy (no usar dateOnlyLocal(new Date()): ese helper
  // lee las partes UTC, pensado para columnas solo-día, no para "ahora").
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const dias = Math.round((hoy.getTime() - recep.getTime()) / MS_DIA);
  return dias >= 0 ? { dias, enCurso: true } : null;
}

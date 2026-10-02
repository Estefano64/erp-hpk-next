// Seguimiento de servicios externos (requerimientos tipo SER).
//
// Un SER aprobado sale del taller a un proveedor para cotizar (cromado, NDT,
// rectificado...). Cada intento es un ServicioEnvio. Este módulo es PURO y
// client-safe: deriva el estado del ciclo y el checklist documental a partir
// de los envíos; nada se persiste. Lo usan la pestaña Requerimientos (OT y
// global), la vista de Logística "Servicios externos" y los endpoints.
//
// Ciclo (por envío):
//   salida (guía)  → cotización ACEPTADA → trabajo → llegada (guía) = RECIBIDO
//                  → cotización RECHAZADA → devolución (guía) → nuevo envío
//
// Regla acordada (2026-10): la llegada ES la recepción del servicio y puede
// ocurrir antes de que exista la OC. La OC se genera después con proveedor y
// precio prellenados desde la cotización aceptada.

export const COTIZACION_RESULTADOS = ["ACEPTADA", "RECHAZADA"] as const;
export type CotizacionResultado = (typeof COTIZACION_RESULTADOS)[number];

export const ADJUNTO_TIPOS = [
  "GUIA_SALIDA",
  "COTIZACION",
  "GUIA_DEVOLUCION",
  "GUIA_LLEGADA",
  "INFORME",
  "FACTURA",
] as const;
export type AdjuntoTipo = (typeof ADJUNTO_TIPOS)[number];

export const ADJUNTO_LABELS: Record<AdjuntoTipo, string> = {
  GUIA_SALIDA: "Guía de salida",
  COTIZACION: "Cotización",
  GUIA_DEVOLUCION: "Guía de devolución",
  GUIA_LLEGADA: "Guía de llegada",
  INFORME: "Informe",
  FACTURA: "Factura",
};

// Estado del ciclo de un SER, derivado de su último envío.
export const SERVICIO_ESTADOS = [
  "NO_APLICA",        // el requerimiento no está aprobado todavía (o está anulado)
  "PENDIENTE_ENVIO",  // aprobado, sin envíos (o el último terminó devuelto)
  "EN_COTIZACION",    // salió, sin resultado de cotización
  "RECHAZADO",        // cotización rechazada, esperando la devolución
  "DEVUELTO",         // volvió con guía de devolución → habilita nuevo envío
  "EN_TRABAJO",       // cotización aceptada, el proveedor está trabajando
  "RECIBIDO",         // volvió con el servicio hecho (= recepción)
] as const;
export type ServicioEstado = (typeof SERVICIO_ESTADOS)[number];

export const SERVICIO_ESTADO_LABELS: Record<ServicioEstado, string> = {
  NO_APLICA: "—",
  PENDIENTE_ENVIO: "Pendiente de envío",
  EN_COTIZACION: "En cotización",
  RECHAZADO: "Cotización rechazada",
  DEVUELTO: "Devuelto",
  EN_TRABAJO: "En trabajo",
  RECIBIDO: "Recibido",
};

// Color de Tag antd por estado (semántico, no hex).
export const SERVICIO_ESTADO_COLORS: Record<ServicioEstado, string> = {
  NO_APLICA: "default",
  PENDIENTE_ENVIO: "default",
  EN_COTIZACION: "processing",
  RECHAZADO: "warning",
  DEVUELTO: "warning",
  EN_TRABAJO: "blue",
  RECIBIDO: "success",
};

// Forma mínima de un envío que necesita este módulo. Coincide con las
// columnas de ServicioEnvio; las fechas pueden venir como Date (server) o
// string ISO (client).
export interface EnvioLite {
  id: number;
  proveedor_id?: number | null;
  fecha_salida: Date | string;
  cotizacion_resultado?: string | null;
  monto_cotizacion?: number | string | null;
  moneda_cotizacion?: string | null;
  fecha_devolucion?: Date | string | null;
  fecha_llegada?: Date | string | null;
  nro_factura?: string | null;
  guia_salida?: string | null;
  guia_devolucion?: string | null;
  guia_llegada?: string | null;
  adjuntos?: { tipo: string }[];
}

/** Último envío = el de mayor id (se crean en orden cronológico). */
export function ultimoEnvio<T extends { id: number }>(envios: T[]): T | null {
  if (!envios.length) return null;
  return envios.reduce((a, b) => (b.id > a.id ? b : a));
}

/** Envío con cotización ACEPTADA (el que manda para OC / costos). Último si hay varios. */
export function envioAceptado<T extends EnvioLite>(envios: T[]): T | null {
  const aceptados = envios.filter((e) => e.cotizacion_resultado === "ACEPTADA");
  return ultimoEnvio(aceptados);
}

export function estadoDeEnvio(e: EnvioLite): ServicioEstado {
  if (e.fecha_llegada) return "RECIBIDO";
  if (e.cotizacion_resultado === "ACEPTADA") return "EN_TRABAJO";
  if (e.cotizacion_resultado === "RECHAZADA") return e.fecha_devolucion ? "DEVUELTO" : "RECHAZADO";
  return "EN_COTIZACION";
}

/**
 * Estado del ciclo de un SER.
 * - Si el requerimiento no está APROBADO (o está anulado) → NO_APLICA.
 * - Sin envíos → PENDIENTE_ENVIO.
 * - Con envíos → estado del último. Un último envío DEVUELTO se muestra como
 *   tal (no como pendiente) para que logística vea que hay que re-enviar.
 */
export function estadoServicio(
  statusRequerimiento: string | null | undefined,
  envios: EnvioLite[],
): ServicioEstado {
  if (statusRequerimiento !== "APROBADO") return "NO_APLICA";
  const u = ultimoEnvio(envios);
  if (!u) return "PENDIENTE_ENVIO";
  return estadoDeEnvio(u);
}

/** ¿El servicio ya fue recibido (volvió con el trabajo hecho)? */
export function servicioRecibido(envios: EnvioLite[]): boolean {
  return envios.some((e) => e.cotizacion_resultado === "ACEPTADA" && !!e.fecha_llegada);
}

/** ¿Puede registrarse un envío nuevo? Solo si no hay uno en curso. */
export function puedeEnviar(statusRequerimiento: string | null | undefined, envios: EnvioLite[]): boolean {
  const est = estadoServicio(statusRequerimiento, envios);
  return est === "PENDIENTE_ENVIO" || est === "DEVUELTO";
}

// ── Checklist documental ─────────────────────────────────────────────
// Acordado con el equipo (2026-10): guía de salida, cotización, guía de
// llegada, informe (opcional: nunca bloquea), OC y factura.
export type DocEstado = "ok" | "falta" | "opcional" | "na";

export interface DocItem {
  key: "guia_salida" | "cotizacion" | "guia_llegada" | "informe" | "oc" | "factura";
  label: string;
  estado: DocEstado;
}

export interface ChecklistInput {
  envios: EnvioLite[];
  // po_id del OTRepuesto: la OC existe cuando no es null.
  po_id: number | null | undefined;
}

function tieneAdjunto(e: EnvioLite | null, tipo: AdjuntoTipo): boolean {
  return !!e?.adjuntos?.some((a) => a.tipo === tipo);
}

/**
 * Checklist documental del SER. Se evalúa sobre el envío ACEPTADO (si hay);
 * si todavía no hay cotización aceptada, sobre el último envío. Un documento
 * cuenta como "ok" si tiene número o PDF (el número solo también vale: la
 * regla es "se registra número y PDF", pero no bloqueamos por el PDF).
 */
export function checklistDocumental(input: ChecklistInput): DocItem[] {
  const base = envioAceptado(input.envios) ?? ultimoEnvio(input.envios);
  const na = (): DocEstado => "na";
  if (!base) {
    return [
      { key: "guia_salida", label: "Guía salida", estado: "falta" },
      { key: "cotizacion", label: "Cotización", estado: "falta" },
      { key: "guia_llegada", label: "Guía llegada", estado: na() },
      { key: "informe", label: "Informe", estado: "opcional" },
      { key: "oc", label: "OC", estado: input.po_id != null ? "ok" : "falta" },
      { key: "factura", label: "Factura", estado: na() },
    ];
  }
  const aceptada = base.cotizacion_resultado === "ACEPTADA";
  const llego = !!base.fecha_llegada;
  const okOr = (cond: boolean): DocEstado => (cond ? "ok" : "falta");
  return [
    { key: "guia_salida", label: "Guía salida", estado: okOr(!!base.guia_salida || tieneAdjunto(base, "GUIA_SALIDA")) },
    { key: "cotizacion", label: "Cotización", estado: okOr(!!base.cotizacion_resultado && (base.monto_cotizacion != null || tieneAdjunto(base, "COTIZACION"))) },
    { key: "guia_llegada", label: "Guía llegada", estado: aceptada ? okOr(!!base.guia_llegada || tieneAdjunto(base, "GUIA_LLEGADA")) : na() },
    { key: "informe", label: "Informe", estado: aceptada && llego ? (tieneAdjunto(base, "INFORME") ? "ok" : "opcional") : na() },
    { key: "oc", label: "OC", estado: aceptada ? okOr(input.po_id != null) : na() },
    { key: "factura", label: "Factura", estado: aceptada && llego ? okOr(!!base.nro_factura || tieneAdjunto(base, "FACTURA")) : na() },
  ];
}

/** ¿Documentación completa? Solo cuentan los "falta"; opcional y n/a no bloquean. */
export function documentacionCompleta(items: DocItem[]): boolean {
  return !items.some((d) => d.estado === "falta");
}

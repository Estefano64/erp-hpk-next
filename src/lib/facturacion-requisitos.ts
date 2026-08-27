// Qué PDFs hacen falta para poder facturar una OT, según su tipo.
//
// Hasta 2026-08-27 la lista era una sola para todos: Guía de llegada,
// Cotización, PO cliente, Informe de término y Guía de despacho. Eso no cierra
// para una OT de Bien (venta): no hay cilindro que llegue al taller ni
// reparación que informar, así que se le reclamaban tres documentos que nunca
// va a tener — en toda la base, las OTs BIE tienen CERO adjuntos en recepción,
// cotización y término. Ninguna podía quedar "lista para facturar".
//
// Reglas definidas con el usuario (2026-08-27):
//   BIE (Bien)     → PO cliente + Guía de despacho.
//   REP (Reparación) → Cotización + PO cliente + Guía de despacho. Se sacaron
//                      Guía de llegada e Informe de término: eran los dos
//                      faltantes más comunes (23 y 18 OTs) y no se consideran
//                      requisito para emitir la factura.
//   SER (Servicio) → SIN CAMBIOS (las 5 de siempre). Por pedido explícito: el
//                    tipo no se usa todavía (0 OTs en prod) y se deja quieto.
//
// El PDF de la factura NO figura acá: es la salida del proceso, no un
// requisito de entrada. Es lo que marca la OT como facturada, junto con la
// fecha — ver `facturada` en /api/facturacion/ot.

export const ETAPAS_FACTURACION = [
  "recepcion", "cotizacion", "po_cliente", "termino", "despacho",
] as const;

export type EtapaFacturacion = (typeof ETAPAS_FACTURACION)[number];

export const ETAPA_LABELS: Record<EtapaFacturacion | "facturacion", string> = {
  recepcion: "Guía de llegada",
  cotizacion: "Cotización",
  po_cliente: "PO cliente",
  termino: "Informe",
  despacho: "Guía de despacho",
  facturacion: "Factura",
};

// Las 5 históricas — se conservan como fallback para SER y para cualquier OT
// sin tipo declarado, así ningún caso queda sin regla definida.
const REQUISITOS_LEGACY: EtapaFacturacion[] = [...ETAPAS_FACTURACION];

const REQUISITOS_POR_TIPO: Record<string, EtapaFacturacion[]> = {
  BIE: ["po_cliente", "despacho"],
  REP: ["cotizacion", "po_cliente", "despacho"],
  SER: REQUISITOS_LEGACY,
};

/** Etapas cuyo PDF se exige para habilitar la facturación de esta OT. */
export function requisitosFacturacion(tipoCodigo: string | null | undefined): EtapaFacturacion[] {
  return REQUISITOS_POR_TIPO[tipoCodigo ?? ""] ?? REQUISITOS_LEGACY;
}

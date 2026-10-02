// Lado servidor del seguimiento de servicios externos (SER).
// Carga de requerimientos SER con sus envíos y helpers compartidos por los
// endpoints de /api/servicios-externos. La lógica pura (estado, checklist)
// vive en ./servicios-externos (client-safe).
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { formatOtCodigo, formatOtInternaCodigo } from "./ot-formato";
import {
  checklistDocumental,
  documentacionCompleta,
  envioAceptado,
  estadoServicio,
  type EnvioLite,
  type ServicioEstado,
} from "./servicios-externos";

export type TxClient = PrismaClient | Prisma.TransactionClient;

export const SELECT_ENVIO = {
  id: true,
  ot_repuesto_id: true,
  proveedor_id: true,
  proveedor: { select: { id: true, razon_social: true, nombre_comercial: true } },
  fecha_salida: true,
  guia_salida: true,
  cotizacion_resultado: true,
  fecha_cotizacion: true,
  nro_cotizacion: true,
  monto_cotizacion: true,
  moneda_cotizacion: true,
  fecha_devolucion: true,
  guia_devolucion: true,
  fecha_llegada: true,
  guia_llegada: true,
  recibido_por: true,
  nro_factura: true,
  observaciones: true,
  usuario_crea: true,
  usuario_actualiza: true,
  created_at: true,
  updated_at: true,
  adjuntos: {
    select: {
      id: true, tipo: true, nombre_archivo: true, r2_key: true, tipo_mime: true,
      tamano: true, usuario_sube: true, fecha_subida: true,
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.ServicioEnvioSelect;

export const SELECT_SER = {
  id: true,
  ot_id: true,
  orden_trabajo_interna_id: true,
  nro_req: true,
  item_req: true,
  tipo_codigo: true,
  descripcion: true,
  cantidad: true,
  cantidad_recibida: true,
  unidad_medida: true,
  precio_unitario: true,
  moneda: true,
  proveedor_id: true,
  proveedor: { select: { id: true, razon_social: true } },
  po_id: true,
  nro_oc: true,
  status_requerimiento_codigo: true,
  status_oc_codigo: true,
  fecha_requerida: true,
  fecha_entrega_real: true,
  fecha_aprobacion: true,
  orden_trabajo: {
    select: {
      id: true, ot: true, tipo_codigo: true, descripcion: true,
      cliente: { select: { razon_social: true } },
    },
  },
  orden_trabajo_interna: { select: { id: true, ot: true, descripcion: true } },
  servicio_items: {
    select: {
      id: true, item_req: true, tipo_codigo: true, descripcion: true, cantidad: true,
      cantidad_recibida: true, unidad_medida: true, precio_unitario: true, moneda: true,
      status_requerimiento_codigo: true, po_id: true, nro_oc: true,
    },
    orderBy: { id: "asc" as const },
  },
  servicio_envios: { select: SELECT_ENVIO, orderBy: { id: "asc" as const } },
} satisfies Prisma.OTRepuestoSelect;

export type SerRow = Prisma.OTRepuestoGetPayload<{ select: typeof SELECT_SER }>;

const dec = (v: Prisma.Decimal | number | null | undefined): number | null =>
  v == null ? null : Number(v);

/** Serializa un envío (Decimals → number) para la respuesta JSON. */
export function serializarEnvio(e: SerRow["servicio_envios"][number]) {
  return { ...e, monto_cotizacion: dec(e.monto_cotizacion) };
}

/**
 * Serializa un SER con todo lo que la UI necesita: envíos, ítems asociados,
 * estado derivado, checklist documental y código de OT legible.
 */
export function serializarSer(r: SerRow) {
  const envios = r.servicio_envios.map(serializarEnvio);
  const enviosLite: EnvioLite[] = envios;
  const estado: ServicioEstado = estadoServicio(r.status_requerimiento_codigo, enviosLite);
  const docs = checklistDocumental({ envios: enviosLite, po_id: r.po_id });
  const aceptado = envioAceptado(envios);
  const otCodigo = r.orden_trabajo
    ? formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, `OT-${r.orden_trabajo.id}`)
    : r.orden_trabajo_interna
      ? formatOtInternaCodigo(r.orden_trabajo_interna.ot, `OTI-${r.orden_trabajo_interna.id}`)
      : null;
  return {
    id: r.id,
    ot_id: r.ot_id,
    orden_trabajo_interna_id: r.orden_trabajo_interna_id,
    ot_codigo: otCodigo,
    ot_descripcion: r.orden_trabajo?.descripcion ?? r.orden_trabajo_interna?.descripcion ?? null,
    cliente: r.orden_trabajo?.cliente?.razon_social ?? null,
    nro_req: r.nro_req,
    item_req: r.item_req,
    descripcion: r.descripcion,
    cantidad: dec(r.cantidad),
    cantidad_recibida: dec(r.cantidad_recibida),
    unidad_medida: r.unidad_medida,
    precio_unitario: dec(r.precio_unitario),
    moneda: r.moneda,
    proveedor_id: r.proveedor_id,
    proveedor_nombre: r.proveedor?.razon_social ?? null,
    po_id: r.po_id,
    nro_oc: r.nro_oc,
    status_requerimiento_codigo: r.status_requerimiento_codigo,
    status_oc_codigo: r.status_oc_codigo,
    fecha_requerida: r.fecha_requerida,
    fecha_entrega_real: r.fecha_entrega_real,
    fecha_aprobacion: r.fecha_aprobacion,
    estado,
    docs,
    docs_completa: documentacionCompleta(docs),
    envio_aceptado_id: aceptado?.id ?? null,
    envios,
    items: r.servicio_items.map((it) => ({
      ...it,
      cantidad: dec(it.cantidad),
      cantidad_recibida: dec(it.cantidad_recibida),
      precio_unitario: dec(it.precio_unitario),
    })),
  };
}

export type SerSerializado = ReturnType<typeof serializarSer>;

/** Carga un SER por id con todo el seguimiento. null si no existe o no es SER. */
export async function cargarSer(tx: TxClient, repId: number): Promise<SerRow | null> {
  const r = await tx.oTRepuesto.findUnique({ where: { id: repId }, select: SELECT_SER });
  if (!r || r.tipo_codigo !== "SER") return null;
  return r;
}

/** Historial de OT (externa o interna) para una acción del seguimiento. */
export async function historialServicio(
  tx: TxClient,
  rep: { ot_id: number | null; orden_trabajo_interna_id: number | null },
  descripcion: string,
  usuario: string,
): Promise<void> {
  if (rep.ot_id != null) {
    await tx.oTHistorial.create({
      data: { ot_id: rep.ot_id, tipo_operacion: "SERVICIO", descripcion, usuario },
    });
  } else if (rep.orden_trabajo_interna_id != null) {
    await tx.oTHistorial.create({
      data: { orden_trabajo_interna_id: rep.orden_trabajo_interna_id, tipo_operacion: "SERVICIO", descripcion, usuario },
    });
  }
}

export { prisma };

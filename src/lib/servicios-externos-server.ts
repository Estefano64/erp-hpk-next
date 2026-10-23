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
  estadoDeEnvio,
  estadoServicio,
  type EnvioLite,
  type ServicioEstado,
} from "./servicios-externos";

export type TxClient = PrismaClient | Prisma.TransactionClient;

export const SELECT_ENVIO = {
  id: true,
  ot_repuesto_id: true,
  proveedor_id: true,
  lote_id: true,
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
  fecha_solicitud: true,
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

// ── Envío conjunto (lote) ────────────────────────────────────────────
// Resumen de cada envío de un lote, para que la UI muestre con qué otros
// servicios salió y arme los formularios por línea (cotización/llegada).
export interface LoteMiembro {
  envio_id: number;
  ot_repuesto_id: number;
  ot_codigo: string | null;
  nro_req: string | null;
  item_req: number | null;
  descripcion: string | null;
  cantidad: number | null;
  unidad_medida: string | null;
  moneda: string | null;
  estado: ServicioEstado;
  cotizacion_resultado: string | null;
  monto_cotizacion: number | null;
  moneda_cotizacion: string | null;
  fecha_devolucion: Date | null;
  fecha_llegada: Date | null;
  nro_factura: string | null;
}

/** Miembros de los lotes indicados, agrupados por lote_id (orden por envío). */
export async function cargarLotes(tx: TxClient, loteIds: (string | null | undefined)[]): Promise<Map<string, LoteMiembro[]>> {
  const ids = [...new Set(loteIds.filter((x): x is string => !!x))];
  const map = new Map<string, LoteMiembro[]>();
  if (!ids.length) return map;
  const rows = await tx.servicioEnvio.findMany({
    where: { lote_id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true, lote_id: true, fecha_salida: true, cotizacion_resultado: true, monto_cotizacion: true,
      moneda_cotizacion: true, fecha_devolucion: true, fecha_llegada: true, nro_factura: true,
      ot_repuesto: {
        select: {
          id: true, nro_req: true, item_req: true, descripcion: true, cantidad: true, unidad_medida: true, moneda: true,
          orden_trabajo: { select: { id: true, ot: true, tipo_codigo: true } },
          orden_trabajo_interna: { select: { id: true, ot: true } },
        },
      },
    },
  });
  for (const e of rows) {
    const rep = e.ot_repuesto;
    const m: LoteMiembro = {
      envio_id: e.id,
      ot_repuesto_id: rep.id,
      ot_codigo: rep.orden_trabajo
        ? formatOtCodigo(rep.orden_trabajo.ot, rep.orden_trabajo.tipo_codigo, `OT-${rep.orden_trabajo.id}`)
        : rep.orden_trabajo_interna
          ? formatOtInternaCodigo(rep.orden_trabajo_interna.ot, `OTI-${rep.orden_trabajo_interna.id}`)
          : null,
      nro_req: rep.nro_req,
      item_req: rep.item_req,
      descripcion: rep.descripcion,
      cantidad: dec(rep.cantidad),
      unidad_medida: rep.unidad_medida,
      moneda: rep.moneda,
      estado: estadoDeEnvio({
        id: e.id, fecha_salida: e.fecha_salida, cotizacion_resultado: e.cotizacion_resultado,
        fecha_devolucion: e.fecha_devolucion, fecha_llegada: e.fecha_llegada,
      }),
      cotizacion_resultado: e.cotizacion_resultado,
      monto_cotizacion: dec(e.monto_cotizacion),
      moneda_cotizacion: e.moneda_cotizacion,
      fecha_devolucion: e.fecha_devolucion,
      fecha_llegada: e.fecha_llegada,
      nro_factura: e.nro_factura,
    };
    const k = e.lote_id!;
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return map;
}

// ── Documentos que ya se suben en la OC (Compras) ────────────────────
// Guía, factura, comprobante de pago y guía de llegada se cargan en la OC
// (/compras). El seguimiento los muestra y los cuenta en el checklist para
// que logística no los suba dos veces.
export type OcDocTipo = "guia" | "factura" | "pago" | "guia_llegada";
export interface OcDocs {
  compra_id: number;
  numero_po: string;
  nro_factura: string | null;
  nro_guia: string | null;
  adjuntos: { tipo: OcDocTipo; nombre_archivo: string; r2_key: string }[];
  // Otras líneas de la OC que vienen de un requerimiento (no SER, no ítem
  // libre) y siguen pendientes: en la llegada se puede marcar que llegaron
  // con el servicio o que las usó el proveedor (ver reflejarRecepcionEnOC).
  lineas_pendientes: OcLineaPendiente[];
}
export interface OcLineaPendiente {
  id: number;
  tipo_codigo: string | null;
  material_codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad_medida: string | null;
}

export async function cargarDocsOC(tx: TxClient, poIds: (number | null | undefined)[]): Promise<Map<number, OcDocs>> {
  const ids = [...new Set(poIds.filter((x): x is number => x != null))];
  const map = new Map<number, OcDocs>();
  if (!ids.length) return map;
  const compras = await tx.compra.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, numero_po: true, nro_factura: true, nro_guia: true,
      guia_key: true, guia_nombre: true, factura_key: true, factura_nombre: true, pago_key: true, pago_nombre: true,
      adjuntos: { select: { tipo: true, nombre_archivo: true, r2_key: true }, orderBy: { id: "asc" } },
      ot_repuestos: {
        where: {
          OR: [{ tipo_codigo: null }, { tipo_codigo: { not: "SER" } }],
          AND: [{ OR: [{ solo_para_oc: false }, { solo_para_oc: null }] }],
          // Los ítems colgados de un SER ya se reciben con su llegada.
          servicio_padre_id: null,
          NOT: { status_oc_codigo: { in: ["ANULADO", "COMPLETO", "ENTREGADO", "CONSUMIDO_ALMACEN", "CONSUMIDO_OC_ABIERTA"] } },
        },
        select: { id: true, tipo_codigo: true, material_codigo: true, descripcion: true, oc_descripcion: true, cantidad: true, cantidad_recibida: true, unidad_medida: true },
        orderBy: { id: "asc" },
      },
    },
  });
  for (const c of compras) {
    const adjuntos: OcDocs["adjuntos"] = c.adjuntos
      .filter((a) => ["guia", "factura", "pago", "guia_llegada"].includes(a.tipo))
      .map((a) => ({ tipo: a.tipo as OcDocTipo, nombre_archivo: a.nombre_archivo, r2_key: a.r2_key }));
    // Campos legacy (un solo archivo por tipo), si no están ya como fila.
    const legacy: [OcDocTipo, string | null, string | null][] = [
      ["guia", c.guia_key, c.guia_nombre], ["factura", c.factura_key, c.factura_nombre], ["pago", c.pago_key, c.pago_nombre],
    ];
    for (const [tipo, key, nombre] of legacy) {
      if (key && !adjuntos.some((a) => a.r2_key === key)) adjuntos.push({ tipo, nombre_archivo: nombre ?? tipo, r2_key: key });
    }
    const lineas_pendientes: OcLineaPendiente[] = c.ot_repuestos
      .filter((r) => Number(r.cantidad_recibida ?? 0) < Number(r.cantidad) - 0.0001)
      .map((r) => ({
        id: r.id, tipo_codigo: r.tipo_codigo, material_codigo: r.material_codigo,
        descripcion: r.oc_descripcion ?? r.descripcion, cantidad: Number(r.cantidad), unidad_medida: r.unidad_medida,
      }));
    map.set(c.id, { compra_id: c.id, numero_po: c.numero_po, nro_factura: c.nro_factura, nro_guia: c.nro_guia, adjuntos, lineas_pendientes });
  }
  return map;
}

/**
 * Serializa un SER con todo lo que la UI necesita: envíos, ítems asociados,
 * estado derivado, checklist documental y código de OT legible. Con `lotes`
 * (ver cargarLotes), cada envío de un envío conjunto trae sus miembros; con
 * `ocs` (ver cargarDocsOC), los documentos ya cargados en su OC.
 */
export function serializarSer(r: SerRow, lotes?: Map<string, LoteMiembro[]>, ocs?: Map<number, OcDocs>) {
  const oc = r.po_id != null ? (ocs?.get(r.po_id) ?? null) : null;
  const envios = r.servicio_envios.map((e) => ({
    ...serializarEnvio(e),
    lote: e.lote_id ? (lotes?.get(e.lote_id) ?? []) : [],
  }));
  const enviosLite: EnvioLite[] = envios;
  const estado: ServicioEstado = estadoServicio(r.status_requerimiento_codigo, enviosLite, {
    cantidad: dec(r.cantidad), cantidad_recibida: dec(r.cantidad_recibida),
    fecha_aprobacion: r.fecha_aprobacion ?? r.fecha_solicitud,
  });
  const docs = checklistDocumental({
    envios: enviosLite,
    po_id: r.po_id,
    oc: oc ? {
      factura: !!oc.nro_factura || oc.adjuntos.some((a) => a.tipo === "factura"),
      guia_llegada: !!oc.nro_guia || oc.adjuntos.some((a) => a.tipo === "guia_llegada"),
    } : null,
  });
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
    oc_docs: oc,
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

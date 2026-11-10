"use client";

// Seguimiento de un servicio externo (requerimiento SER).
//
// Exporta:
//   - ServicioEstadoCell: celda compacta (Tag de estado + semáforo de docs +
//     botón que abre el drawer). Para la columna "Servicio" en las tablas de
//     requerimientos (pestaña de OT y pantalla global).
//   - ServicioSeguimientoDrawer: drawer con la línea de tiempo de envíos y las
//     acciones del ciclo (salida → cotización → devolución | llegada), los PDFs
//     por tipo, la factura y los ítems que agrega el proveedor.
//   - ServicioSalidaModal: "Generar seguimiento" para varios SER seleccionados
//     en /requerimientos (envío conjunto al mismo proveedor).
//   - ServicioLlegadaModal: "Registrar llegada" para varios SER Incompletos
//     seleccionados en /requerimientos.
//   - useServicioSeguimiento: carga /api/servicios-externos para un conjunto
//     de SER (por OT o por ids) y expone un mapa por repuesto_id.
//
// Las acciones solo se muestran si `puedeOperar` (logística/admin). El resto
// ve el seguimiento en modo lectura.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert, Button, Checkbox, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space,
  Table, Tag, Timeline, Tooltip, Typography, Upload, message,
} from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, ExclamationCircleOutlined, FileTextOutlined,
  EditOutlined, MinusCircleOutlined, PlusOutlined, SendOutlined, UploadOutlined, InboxOutlined, RollbackOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand, space } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { formatDateOnly, dateOnlyLocal } from "@/lib/dates";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";
import {
  ADJUNTO_LABELS, SEGUIMIENTO_DESDE, SERVICIO_ESTADO_COLORS, SERVICIO_ESTADO_LABELS,
  estadoDeEnvio, puedeLlegadaDirecta, type AdjuntoTipo, type DocItem, type ServicioEstado,
} from "@/lib/servicios-externos";

const { Text } = Typography;

// ── Tipos (espejo de serializarSer en el server) ─────────────────────
export interface EnvioAdjunto {
  id: number; tipo: string; nombre_archivo: string; r2_key: string; tipo_mime: string; tamano: number;
  usuario_sube: string | null; fecha_subida: string;
}
// Otro servicio del mismo envío conjunto (ver cargarLotes en el server).
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
  fecha_devolucion: string | null;
  fecha_llegada: string | null;
  nro_factura: string | null;
}
export interface Envio {
  id: number;
  ot_repuesto_id: number;
  proveedor_id: number | null;
  // Envío conjunto: varios servicios que salieron juntos al mismo proveedor.
  // `lote` trae a todos (incluido este); vacío o de 1 = envío individual.
  lote_id: string | null;
  lote: LoteMiembro[];
  proveedor: { id: number; razon_social: string; nombre_comercial: string | null } | null;
  fecha_salida: string;
  guia_salida: string | null;
  cotizacion_resultado: string | null;
  fecha_cotizacion: string | null;
  nro_cotizacion: string | null;
  monto_cotizacion: number | null;
  moneda_cotizacion: string | null;
  fecha_devolucion: string | null;
  guia_devolucion: string | null;
  fecha_llegada: string | null;
  guia_llegada: string | null;
  recibido_por: string | null;
  nro_factura: string | null;
  observaciones: string | null;
  usuario_crea: string | null;
  created_at: string;
  adjuntos: EnvioAdjunto[];
}
type OcDocTipo = "guia" | "factura" | "pago" | "guia_llegada";
export interface OcDocs {
  compra_id: number;
  numero_po: string;
  nro_factura: string | null;
  nro_guia: string | null;
  adjuntos: { tipo: OcDocTipo; nombre_archivo: string; r2_key: string }[];
  // Otras líneas pendientes de la OC (requerimientos de material).
  lineas_pendientes: {
    id: number; tipo_codigo: string | null; material_codigo: string | null; descripcion: string | null;
    cantidad: number; unidad_medida: string | null;
  }[];
}
const OC_DOC_LABEL: Record<OcDocTipo, string> = { guia: "Guía", factura: "Factura", pago: "Comprobante de pago", guia_llegada: "Guía de llegada" };
const OC_DOC_RESOURCE = {
  guia: "compra-guia", factura: "compra-factura", pago: "compra-pago", guia_llegada: "compra-guia-llegada",
} as const;
export interface ServicioItemAsociado {
  id: number; item_req: number | null; tipo_codigo: string | null; descripcion: string | null;
  cantidad: number | null; cantidad_recibida: number | null; unidad_medida: string | null;
  precio_unitario: number | null; moneda: string | null; status_requerimiento_codigo: string | null;
  po_id: number | null; nro_oc: string | null;
}
export interface ServicioSer {
  id: number;
  ot_id: number | null;
  orden_trabajo_interna_id: number | null;
  ot_codigo: string | null;
  ot_descripcion: string | null;
  cliente: string | null;
  nro_req: string | null;
  item_req: number | null;
  descripcion: string | null;
  descripcion_req: string | null;
  nro_guia: string | null;
  creado_en: string;
  creado_por: string | null;
  cantidad: number | null;
  cantidad_recibida: number | null;
  unidad_medida: string | null;
  precio_unitario: number | null;
  moneda: string | null;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  po_id: number | null;
  nro_oc: string | null;
  status_requerimiento_codigo: string | null;
  status_oc_codigo: string | null;
  fecha_requerida: string | null;
  fecha_entrega_real: string | null;
  fecha_aprobacion: string | null;
  estado: ServicioEstado;
  docs: DocItem[];
  docs_completa: boolean;
  envio_aceptado_id: number | null;
  // Documentos ya cargados en la OC (Compras): guía, factura, pago, guía de llegada.
  oc_docs: OcDocs | null;
  envios: Envio[];
  items: ServicioItemAsociado[];
}

type ProveedorOpt = { id: number; razon_social: string };

// ── Hook de carga ────────────────────────────────────────────────────
export function useServicioSeguimiento(params: { otId?: number; otInternaId?: number; todos?: boolean; enabled?: boolean }) {
  const { otId, otInternaId, todos = false, enabled = true } = params;
  const [data, setData] = useState<ServicioSer[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled || (!otId && !otInternaId && !todos)) return;
    setLoading(true);
    try {
      const qs = otId ? `ot_id=${otId}` : otInternaId ? `ot_interna_id=${otInternaId}` : "";
      const res = await fetch(`/api/servicios-externos?${qs}`);
      if (res.ok) {
        const j = await res.json();
        setData(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [otId, otInternaId, todos, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  const porRepuesto = useMemo(() => new Map(data.map((s) => [s.id, s])), [data]);
  return { data, porRepuesto, loading, reload };
}

// ── Semáforo documental ──────────────────────────────────────────────
export function DocsSemaforo({ docs, compact }: { docs: DocItem[]; compact?: boolean }) {
  const icon = (d: DocItem) => {
    if (d.estado === "ok") return <CheckCircleOutlined style={{ color: brand.success }} />;
    if (d.estado === "falta") return <CloseCircleOutlined style={{ color: brand.error }} />;
    if (d.estado === "opcional") return <ExclamationCircleOutlined style={{ color: brand.warning }} />;
    return <MinusCircleOutlined style={{ color: brand.textSecondary }} />;
  };
  const sufijo = (d: DocItem) =>
    d.estado === "ok" ? "" : d.estado === "falta" ? " (falta)" : d.estado === "opcional" ? " (opcional, no subido)" : " (no aplica aún)";
  return (
    <Space size={compact ? 2 : space.sm} wrap>
      {docs.map((d) => (
        <Tooltip key={d.key} title={`${d.label}${sufijo(d)}`}>
          <span style={{ fontSize: compact ? 12 : 14, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {icon(d)}
            {!compact && <Text style={{ fontSize: 11 }}>{d.label}</Text>}
          </span>
        </Tooltip>
      ))}
    </Space>
  );
}

function etiquetaMiembro(m: Pick<LoteMiembro, "ot_codigo" | "nro_req" | "item_req" | "descripcion">): string {
  return `${m.ot_codigo ?? "—"} · ${m.nro_req ?? "—"}/${m.item_req ?? "—"} · ${m.descripcion ?? "—"}`;
}

// ── Celda compacta para las tablas de requerimientos ─────────────────
export function ServicioEstadoCell({ ser, onOpen }: { ser: ServicioSer | undefined; onOpen: () => void }) {
  if (!ser) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
  const ultimo = ser.envios.length ? ser.envios[ser.envios.length - 1] : null;
  return (
    <Space orientation="vertical" size={2} style={{ lineHeight: 1.2 }}>
      <Tag
        color={SERVICIO_ESTADO_COLORS[ser.estado]}
        style={{ margin: 0, fontSize: 10, cursor: "pointer" }}
        onClick={onOpen}
      >
        {SERVICIO_ESTADO_LABELS[ser.estado]}
      </Tag>
      {ultimo?.proveedor && ser.estado !== "NO_APLICA" && (
        <Text type="secondary" style={{ fontSize: 10 }} ellipsis>{ultimo.proveedor.razon_social}</Text>
      )}
      {ultimo && ultimo.lote.length > 1 && ser.estado !== "NO_APLICA" && (
        <Tooltip title={<div>{ultimo.lote.map((m) => <div key={m.envio_id}>{etiquetaMiembro(m)}</div>)}</div>}>
          <Tag style={{ margin: 0, fontSize: 10 }}>Envío conjunto ({ultimo.lote.length})</Tag>
        </Tooltip>
      )}
      {ser.estado !== "NO_APLICA" && <DocsSemaforo docs={ser.docs} compact />}
      <Button type="link" size="small" style={{ padding: 0, height: 18, fontSize: 11 }} onClick={onOpen}>
        Seguimiento
      </Button>
    </Space>
  );
}

// ── Drawer de seguimiento ────────────────────────────────────────────
interface DrawerProps {
  ser: ServicioSer | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  puedeOperar: boolean;
}

// *_lote = la misma etapa para todo un envío conjunto (PATCH /envios/lote).
type Accion =
  | "salida" | "cotizacion" | "devolucion" | "llegada" | "llegada_directa" | "factura" | "items" | "editar"
  | "cotizacion_lote" | "devolucion_lote" | "llegada_lote" | "factura_lote"
  | null;

const esConjunto = (e: Envio | null | undefined) => !!e && e.lote.length > 1;

// Miembros del lote a los que aplica cada etapa conjunta.
function miembrosPara(a: Accion, e: Envio | null): LoteMiembro[] {
  if (!e) return [];
  switch (a) {
    case "cotizacion_lote": return e.lote.filter((m) => m.estado === "EN_COTIZACION");
    case "devolucion_lote": return e.lote.filter((m) => m.cotizacion_resultado === "RECHAZADA" && !m.fecha_devolucion);
    case "llegada_lote": return e.lote.filter((m) => m.estado === "EN_TRABAJO");
    case "factura_lote": return e.lote.filter((m) => m.estado === "RECIBIDO");
    default: return [];
  }
}

export function ServicioSeguimientoDrawer({ ser, open, onClose, onChanged, puedeOperar }: DrawerProps) {
  const { screens } = useResponsive();
  const [messageApi, ctx] = message.useMessage();
  const [accion, setAccion] = useState<Accion>(null);
  const [envioSel, setEnvioSel] = useState<Envio | null>(null);
  const [saving, setSaving] = useState(false);
  const [proveedores, setProveedores] = useState<ProveedorOpt[]>([]);
  // Otros SER pendientes de envío que pueden salir junto con este.
  const [candidatos, setCandidatos] = useState<ServicioSer[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open || !puedeOperar || proveedores.length) return;
    fetch("/api/proveedores?limit=10000")
      .then(async (r) => { if (r.ok) setProveedores(((await r.json()).data ?? []) as ProveedorOpt[]); })
      .catch(() => {});
  }, [open, puedeOperar, proveedores.length]);

  const ultimo = ser?.envios.length ? ser.envios[ser.envios.length - 1] : null;
  const puedeSalida = !!ser && ser.status_requerimiento_codigo === "APROBADO" &&
    (ser.estado === "PENDIENTE_ENVIO" || ser.estado === "DEVUELTO");

  function abrir(a: Accion, envio: Envio | null) {
    setAccion(a);
    setEnvioSel(envio);
    form.resetFields();
    if (a === "cotizacion" && ser) {
      // Servicio ya aceptado (con OC) que no se realizó: se propone RECHAZADA.
      form.setFieldsValue({
        fecha_cotizacion: dayjs(),
        ...(envio?.cotizacion_resultado === "ACEPTADA" ? { resultado: "RECHAZADA", nro_cotizacion: envio.nro_cotizacion ?? "" } : {}),
      });
    }
    if (a === "salida") {
      form.setFieldsValue({ fecha_salida: dayjs(), junto_con: [] });
      void cargarCandidatos();
    }
    if (a === "devolucion" || a === "devolucion_lote") form.setFieldsValue({ fecha_devolucion: dayjs() });
    if (a === "llegada_lote") form.setFieldsValue({ fecha_llegada: dayjs() });
    // Otras líneas de la OC: marcadas por defecto (casi siempre las usó el
    // proveedor en el servicio y nunca llegan al taller).
    if (a === "llegada" || a === "llegada_directa") {
      form.setFieldsValue({ fecha_llegada: dayjs(), lineas_oc: (ser?.oc_docs?.lineas_pendientes ?? []).map((l) => l.id) });
    }
    if (a === "factura" && envio) form.setFieldsValue({ nro_factura: envio.nro_factura ?? "" });
    // Corregir/cargar después los datos del envío (guías, N° cotización...):
    // la OC crea el seguimiento sola y la guía de salida queda vacía.
    if (a === "editar" && envio) {
      const fs = dateOnlyLocal(envio.fecha_salida);
      form.setFieldsValue({
        fecha_salida: fs ? dayjs(fs) : null,
        guia_salida: envio.guia_salida ?? "",
        nro_cotizacion: envio.nro_cotizacion ?? "",
        ...(envio.cotizacion_resultado === "RECHAZADA" ? { guia_devolucion: envio.guia_devolucion ?? "" } : {}),
        ...(envio.fecha_llegada ? { guia_llegada: envio.guia_llegada ?? "", recibido_por: envio.recibido_por ?? "" } : {}),
        observaciones: envio.observaciones ?? "",
      });
    }
    if (a === "cotizacion_lote" && envio && ser) {
      form.setFieldsValue({
        fecha_cotizacion: dayjs(),
        lineas: miembrosPara(a, envio).map((m) => ({ envio_id: m.envio_id, resultado: "ACEPTADA" })),
      });
    }
    if ((a === "devolucion_lote" || a === "llegada_lote" || a === "factura_lote") && envio) {
      const ms = miembrosPara(a, envio);
      // Factura: por defecto, los que llegaron en la misma tanda que este.
      const def = a === "factura_lote" ? ms.filter((m) => m.fecha_llegada === envio.fecha_llegada) : ms;
      form.setFieldsValue({
        envio_ids: def.map((m) => m.envio_id),
        ...(a === "factura_lote" ? { nro_factura: envio.nro_factura ?? "" } : {}),
      });
    }
    if (a === "items" && ser) form.setFieldsValue({ items: [{ tipo_codigo: "CAD", cantidad: 1, moneda: envio?.moneda_cotizacion ?? ser.moneda ?? "USD" }] });
  }
  function cerrarAccion() { setAccion(null); setEnvioSel(null); }

  async function cargarCandidatos() {
    if (!ser) return;
    try {
      const r = await fetch("/api/servicios-externos?solo_aprobados=1&estado=PENDIENTE_ENVIO,DEVUELTO");
      if (!r.ok) return;
      const lista = (((await r.json()).data ?? []) as ServicioSer[]).filter((s) => s.id !== ser.id);
      // Primero los de la misma OT.
      const misma = (s: ServicioSer) =>
        (ser.ot_id != null && s.ot_id === ser.ot_id) || (ser.orden_trabajo_interna_id != null && s.orden_trabajo_interna_id === ser.orden_trabajo_interna_id);
      lista.sort((a, b) => Number(misma(b)) - Number(misma(a)) || b.id - a.id);
      setCandidatos(lista);
    } catch { /* sin candidatos: el envío sale individual */ }
  }

  async function enviar() {
    if (!ser) return;
    let values: Record<string, unknown>;
    try { values = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      let res: Response;
      const fmt = (v: unknown) => (dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : v);
      if (accion === "salida") {
        res = await fetch("/api/servicios-externos/envios", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repuesto_ids: [ser.id, ...((values.junto_con as number[] | undefined) ?? [])],
            proveedor_id: values.proveedor_id,
            fecha_salida: fmt(values.fecha_salida),
            guia_salida: values.guia_salida ?? null,
            observaciones: values.observaciones ?? null,
          }),
        });
      } else if (accion?.endsWith("_lote") && envioSel?.lote_id) {
        const { lineas, envio_ids, ...comunes } = values as {
          lineas?: { envio_id: number; resultado: string }[];
          envio_ids?: number[];
        } & Record<string, unknown>;
        const body: Record<string, unknown> = { lote_id: envioSel.lote_id, accion: accion.replace("_lote", "") };
        for (const [k, v] of Object.entries(comunes)) body[k] = fmt(v);
        body.lineas = lineas ?? (envio_ids ?? []).map((id) => ({ envio_id: id }));
        res = await fetch("/api/servicios-externos/envios/lote", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else if (accion === "llegada_directa") {
        res = await fetch("/api/servicios-externos/llegada", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repuesto_ids: [ser.id],
            fecha_llegada: fmt(values.fecha_llegada),
            guia_llegada: values.guia_llegada || null,
            recibido_por: values.recibido_por || null,
            lineas_oc: values.lineas_oc ?? [],
          }),
        });
      } else if (accion === "items" && envioSel) {
        res = await fetch(`/api/servicios-externos/envios/${envioSel.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: values.items }),
        });
      } else if (envioSel) {
        const body: Record<string, unknown> = { accion };
        for (const [k, v] of Object.entries(values)) body[k] = fmt(v);
        res = await fetch(`/api/servicios-externos/envios/${envioSel.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        messageApi.error(j?.error ?? "No se pudo guardar.");
        return;
      }
      messageApi.success("Guardado.");
      cerrarAccion();
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function subirAdjunto(envio: Envio, tipo: AdjuntoTipo, file: File) {
    try {
      const meta = await uploadToR2({ file, uploadUrlEndpoint: `/api/servicios-externos/envios/${envio.id}/adjuntos/upload-url` });
      const r = await fetch(`/api/servicios-externos/envios/${envio.id}/adjuntos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, tipo }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        messageApi.error(j?.error ?? "No se pudo registrar el adjunto.");
        return;
      }
      const j = await r.json().catch(() => null);
      const n = Number(j?.compartido_con ?? 0);
      messageApi.success(`${ADJUNTO_LABELS[tipo]} subida${n > 0 ? ` (compartida con ${n} servicio${n > 1 ? "s" : ""} del envío conjunto)` : ""}.`);
      await onChanged();
    } catch (e) {
      messageApi.error((e as Error).message || "Error al subir.");
    }
  }

  async function borrarAdjunto(envio: Envio, adj: EnvioAdjunto) {
    const r = await fetch(`/api/servicios-externos/envios/${envio.id}/adjuntos`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjunto_id: adj.id }),
    });
    if (!r.ok) { messageApi.error("No se pudo eliminar el adjunto."); return; }
    await onChanged();
  }

  async function borrarEnvio(envio: Envio) {
    const r = await fetch(`/api/servicios-externos/envios/${envio.id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      messageApi.error(j?.error ?? "No se pudo eliminar el envío.");
      return;
    }
    messageApi.success("Envío eliminado.");
    await onChanged();
  }

  // Qué tipos de PDF aplican a un envío según su etapa.
  function tiposAdjuntoPara(e: Envio): AdjuntoTipo[] {
    const t: AdjuntoTipo[] = ["GUIA_SALIDA", "COTIZACION"];
    if (e.cotizacion_resultado === "RECHAZADA") t.push("GUIA_DEVOLUCION");
    // Guía de llegada y factura NO se suben acá: se cargan en la OC (Compras)
    // y el seguimiento solo las muestra (decisión del usuario 2026-10-15).
    if (e.cotizacion_resultado === "ACEPTADA" && e.fecha_llegada) t.push("INFORME");
    return t;
  }

  function AdjuntosEnvio({ envio }: { envio: Envio }) {
    const tipos = tiposAdjuntoPara(envio);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
        {tipos.map((tipo) => {
          const files = envio.adjuntos.filter((a) => a.tipo === tipo);
          return (
            <div key={tipo} style={{ display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 110 }}>{ADJUNTO_LABELS[tipo]}:</Text>
              {files.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
              {files.map((a) => (
                <Space key={a.id} size={2}>
                  <R2FileLink resource="servicio-envio-adjunto" resourceId={a.id} r2Key={a.r2_key} fileName={a.nombre_archivo} style={{ fontSize: 11 }} />
                  {puedeOperar && (
                    <Popconfirm title="¿Eliminar este archivo?" onConfirm={() => borrarAdjunto(envio, a)} okText="Sí" cancelText="No">
                      <Button type="text" size="small" danger icon={<DeleteOutlined style={{ fontSize: 11 }} />} style={{ height: 18, padding: "0 2px" }} />
                    </Popconfirm>
                  )}
                </Space>
              ))}
              {puedeOperar && (
                <Upload
                  showUploadList={false}
                  accept=".pdf,image/*"
                  beforeUpload={(file) => { void subirAdjunto(envio, tipo, file as File); return false; }}
                >
                  <Button size="small" type="dashed" icon={<UploadOutlined />} style={{ fontSize: 11, height: 20 }}>Subir</Button>
                </Upload>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const itemsCols: ColumnsType<ServicioItemAsociado> = [
    { title: "Ítem", dataIndex: "item_req", width: 50, align: "center" },
    { title: "Tipo", dataIndex: "tipo_codigo", width: 60, render: (v) => <Tag style={{ margin: 0, fontSize: 10 }}>{v}</Tag> },
    { title: "Descripción", dataIndex: "descripcion", ellipsis: true },
    { title: "Cant.", dataIndex: "cantidad", width: 70, align: "right", render: (v, r) => `${v ?? "—"} ${r.unidad_medida ?? ""}` },
    { title: "P. Unit.", dataIndex: "precio_unitario", width: 90, align: "right", render: (v, r) => v != null ? `${Number(v).toFixed(2)} ${r.moneda ?? ""}` : "—" },
    { title: "Recibido", dataIndex: "cantidad_recibida", width: 70, align: "right", render: (v) => v ?? 0 },
    { title: "OC", dataIndex: "nro_oc", width: 90, render: (v) => v ?? <Text type="secondary">—</Text> },
  ];

  function renderEnvio(e: Envio, idx: number) {
    const est = estadoDeEnvio(e);
    const monto = e.monto_cotizacion != null ? `${e.moneda_cotizacion ?? ""} ${Number(e.monto_cotizacion).toFixed(2)}` : null;
    const esUltimo = ultimo?.id === e.id;
    return (
      <div key={e.id} style={{ border: `1px solid ${brand.border}`, borderRadius: 6, padding: space.md, marginBottom: space.md }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm }}>
          <Space size={space.sm} wrap>
            <Text strong>Envío {idx + 1}</Text>
            <Tag color={SERVICIO_ESTADO_COLORS[est]} style={{ margin: 0 }}>{SERVICIO_ESTADO_LABELS[est]}</Tag>
            <Text>{e.proveedor?.razon_social ?? "Proveedor —"}</Text>
          </Space>
          <Space size={0}>
          {puedeOperar && (
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => abrir("editar", e)}>Editar datos</Button>
          )}
          {puedeOperar && !e.fecha_llegada && esUltimo && (
            <Popconfirm title={esConjunto(e) ? "¿Sacar este servicio del envío conjunto? Se elimina solo su envío; los demás servicios y los PDFs compartidos se conservan." : "¿Eliminar este envío y sus PDFs?"} onConfirm={() => borrarEnvio(e)} okText="Sí" cancelText="No">
              <Button size="small" danger type="text" icon={<DeleteOutlined />}>Eliminar</Button>
            </Popconfirm>
          )}
          </Space>
        </div>

        {esConjunto(e) && (
          <div style={{ marginTop: space.sm, padding: space.sm, borderRadius: 6, background: `color-mix(in srgb, ${brand.cyan} 6%, var(--erp-surface))` }}>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>
              Envío conjunto: {e.lote.length} servicios con la misma guía de salida. Cotización, devolución, llegada y PDFs se registran
              para todos; cada servicio guarda su propio resultado.
            </Text>
            {e.lote.map((m) => (
              <div key={m.envio_id} style={{ display: "flex", alignItems: "center", gap: space.sm, flexWrap: "wrap", fontSize: 12 }}>
                <Tag color={SERVICIO_ESTADO_COLORS[m.estado]} style={{ margin: 0, fontSize: 10 }}>{SERVICIO_ESTADO_LABELS[m.estado]}</Tag>
                <Text strong={m.envio_id === e.id} style={{ fontSize: 12 }}>{etiquetaMiembro(m)}</Text>
                {m.monto_cotizacion != null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>{m.moneda_cotizacion ?? ""} {m.monto_cotizacion.toFixed(2)}</Text>
                )}
              </div>
            ))}
            {/* Acciones de todo el envío conjunto, sin importar desde qué
                servicio se abrió el seguimiento. */}
            {puedeOperar && (() => {
              const nCot = miembrosPara("cotizacion_lote", e).length;
              const nLle = miembrosPara("llegada_lote", e).length;
              const nDev = miembrosPara("devolucion_lote", e).length;
              if (!nCot && !nLle && !nDev) return null;
              return (
                <Space size={space.xs} wrap style={{ marginTop: space.sm }}>
                  {nCot > 0 && <Button size="small" type="primary" onClick={() => abrir("cotizacion_lote", e)}>Registrar cotización ({nCot})</Button>}
                  {nLle > 0 && <Button size="small" type="primary" onClick={() => abrir("llegada_lote", e)}>Registrar llegada ({nLle})</Button>}
                  {nDev > 0 && <Button size="small" onClick={() => abrir("devolucion_lote", e)}>Guía de devolución ({nDev})</Button>}
                </Space>
              );
            })()}
          </div>
        )}

        <Timeline
          style={{ marginTop: space.md }}
          items={[
            {
              color: "blue",
              dot: <SendOutlined />,
              children: (
                <div>
                  <Text strong style={{ fontSize: 12 }}>Salida</Text>{" "}
                  <Text style={{ fontSize: 12 }}>{formatDateOnly(e.fecha_salida)}</Text>
                  {e.guia_salida && <Text style={{ fontSize: 12 }}> · guía {e.guia_salida}</Text>}
                  {e.observaciones && <div><Text type="secondary" style={{ fontSize: 11 }}>{e.observaciones}</Text></div>}
                </div>
              ),
            },
            {
              color: e.cotizacion_resultado === "ACEPTADA" ? "green" : e.cotizacion_resultado === "RECHAZADA" ? "red" : "gray",
              dot: <FileTextOutlined />,
              children: (
                <div>
                  <Text strong style={{ fontSize: 12 }}>Cotización</Text>{" "}
                  {e.cotizacion_resultado ? (
                    <Text style={{ fontSize: 12 }}>
                      {e.cotizacion_resultado === "ACEPTADA" ? "aceptada" : "rechazada"}
                      {e.fecha_cotizacion ? ` el ${formatDateOnly(e.fecha_cotizacion)}` : ""}
                      {e.nro_cotizacion ? ` · N° ${e.nro_cotizacion}` : ""}
                      {monto ? ` · ${monto}` : ""}
                    </Text>
                  ) : (
                    <Space size={space.sm}>
                      <Text type="secondary" style={{ fontSize: 12 }}>pendiente</Text>
                      {puedeOperar && esUltimo && (
                        <Button size="small" type="primary" onClick={() => abrir(esConjunto(e) ? "cotizacion_lote" : "cotizacion", e)}>Registrar resultado</Button>
                      )}
                    </Space>
                  )}
                </div>
              ),
            },
            ...(e.cotizacion_resultado === "RECHAZADA" ? [{
              color: e.fecha_devolucion ? "orange" : "gray",
              dot: <RollbackOutlined />,
              children: (
                <div>
                  <Text strong style={{ fontSize: 12 }}>Devolución</Text>{" "}
                  {e.fecha_devolucion ? (
                    <Text style={{ fontSize: 12 }}>{formatDateOnly(e.fecha_devolucion)}{e.guia_devolucion ? ` · guía ${e.guia_devolucion}` : ""}</Text>
                  ) : (
                    <Space size={space.sm}>
                      <Text type="secondary" style={{ fontSize: 12 }}>sin guía (opcional)</Text>
                      {puedeOperar && <Button size="small" onClick={() => abrir(esConjunto(e) ? "devolucion_lote" : "devolucion", e)}>Registrar guía de devolución</Button>}
                    </Space>
                  )}
                </div>
              ),
            }] : []),
            ...(e.cotizacion_resultado === "ACEPTADA" ? [{
              color: e.fecha_llegada ? "green" : "gray",
              dot: <InboxOutlined />,
              children: (
                <div>
                  <Text strong style={{ fontSize: 12 }}>Llegada (recepción)</Text>{" "}
                  {e.fecha_llegada ? (
                    <Text style={{ fontSize: 12 }}>
                      {formatDateOnly(e.fecha_llegada)}
                      {e.guia_llegada ? ` · guía ${e.guia_llegada}` : ""}
                      {e.recibido_por ? ` · recibió ${e.recibido_por}` : ""}
                    </Text>
                  ) : (
                    <Space size={space.sm}>
                      <Text type="secondary" style={{ fontSize: 12 }}>incompleto (en trabajo)</Text>
                      {puedeOperar && <Button size="small" type="primary" onClick={() => abrir(esConjunto(e) ? "llegada_lote" : "llegada", e)}>Registrar llegada</Button>}
                      {puedeOperar && esUltimo && (
                        <Button size="small" danger onClick={() => abrir("cotizacion", e)}>No se realizó (devolver)</Button>
                      )}
                    </Space>
                  )}
                  {e.fecha_llegada && (
                    <div style={{ marginTop: 2 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Guía de llegada (PDF) y factura: se cargan en la OC, en Compras.
                      </Text>
                    </div>
                  )}
                </div>
              ),
            }] : []),
          ]}
        />

        <div style={{ marginTop: space.xs }}>
          <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>Documentos</Text>
          <AdjuntosEnvio envio={e} />
        </div>
      </div>
    );
  }

  const tituloAccion: Record<Exclude<Accion, null>, string> = {
    salida: "Registrar salida a proveedor",
    cotizacion: "Resultado de la cotización",
    devolucion: "Guía de devolución del componente",
    llegada: "Registrar llegada del servicio (recepción)",
    llegada_directa: "Registrar llegada del servicio (ya tiene OC)",
    factura: "Factura del proveedor",
    items: "Ítems agregados por el proveedor",
    editar: "Editar datos del envío",
    cotizacion_lote: "Cotización del envío conjunto",
    devolucion_lote: "Guía de devolución del envío conjunto",
    llegada_lote: "Llegada del envío conjunto (recepción)",
    factura_lote: "Factura del envío conjunto",
  };
  const miembrosAccion = miembrosPara(accion, envioSel);
  const miembroPorEnvio = new Map(miembrosAccion.map((m) => [m.envio_id, m]));

  return (
    <>
      {ctx}
      <Drawer
        open={open}
        onClose={onClose}
        placement={screens.md ? "right" : "bottom"}
        size={screens.md ? 720 : "90vh"}
        title={ser ? (
          <Space size={space.sm} wrap>
            <span>Servicio: {ser.descripcion ?? `Item ${ser.id}`}</span>
            <Tag color={SERVICIO_ESTADO_COLORS[ser.estado]} style={{ margin: 0 }}>{SERVICIO_ESTADO_LABELS[ser.estado]}</Tag>
          </Space>
        ) : "Servicio"}
        destroyOnHidden
      >
        {ser && (
          <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
            <div style={{ display: "grid", gridTemplateColumns: screens.md ? "1fr 1fr" : "1fr", gap: space.xs, fontSize: 12 }}>
              <div><Text type="secondary">OT:</Text> {ser.ot_id != null || ser.orden_trabajo_interna_id != null ? <Link href={ser.ot_id != null ? `/ordenes-trabajo/${ser.ot_id}` : `/ordenes-trabajo-internas/${ser.orden_trabajo_interna_id}`} style={{ fontWeight: 600 }}>{ser.ot_codigo ?? "—"}</Link> : <Text strong>{ser.ot_codigo ?? "—"}</Text>} {ser.cliente && <Text type="secondary">· {ser.cliente}</Text>}</div>
              <div><Text type="secondary">Req:</Text> {ser.nro_req ?? "—"} · ítem {ser.item_req ?? "—"}</div>
              <div><Text type="secondary">Estado req:</Text> {ser.status_requerimiento_codigo ?? "—"}</div>
              <div><Text type="secondary">OC:</Text> {ser.po_id != null ? <Link href={`/compras/${ser.po_id}/editar`}>{ser.nro_oc ?? ser.oc_docs?.numero_po ?? ser.po_id}</Link> : <Text type="secondary">sin OC</Text>}</div>
              <div><Text type="secondary">Cantidad:</Text> {ser.cantidad ?? 1} {ser.unidad_medida ?? ""} · recibido {ser.cantidad_recibida ?? 0}</div>
              <div><Text type="secondary">Precio ref.:</Text> {ser.precio_unitario != null ? `${ser.moneda ?? "USD"} ${ser.precio_unitario.toFixed(2)}` : "—"}</div>
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>Documentación</Text>
              <DocsSemaforo docs={ser.docs} />
            </div>

            {ser.oc_docs && (
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>
                  Documentos de la OC {ser.oc_docs.numero_po} (se suben en Compras)
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
                  {ser.oc_docs.nro_guia && <Text style={{ fontSize: 12 }}>N° guía: {ser.oc_docs.nro_guia}</Text>}
                  {ser.oc_docs.nro_factura && <Text style={{ fontSize: 12 }}>N° factura: {ser.oc_docs.nro_factura}</Text>}
                  {ser.oc_docs.adjuntos.map((a) => (
                    <div key={a.r2_key} style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                      <Text type="secondary" style={{ fontSize: 11, minWidth: 130 }}>{OC_DOC_LABEL[a.tipo]}:</Text>
                      <R2FileLink resource={OC_DOC_RESOURCE[a.tipo]} resourceId={ser.oc_docs!.compra_id} r2Key={a.r2_key} fileName={a.nombre_archivo} style={{ fontSize: 11 }} />
                    </div>
                  ))}
                  {!ser.oc_docs.adjuntos.length && !ser.oc_docs.nro_guia && !ser.oc_docs.nro_factura && (
                    <Text type="secondary" style={{ fontSize: 11 }}>Todavía no se cargaron documentos en la OC.</Text>
                  )}
                </div>
              </div>
            )}

            {ser.status_requerimiento_codigo !== "APROBADO" && (
              <Alert type="info" showIcon style={{ fontSize: 12 }}
                message="El seguimiento arranca cuando el requerimiento está aprobado." />
            )}

            {ser.estado === "RECIBIDO" && ser.po_id == null && (
              <Alert type="warning" showIcon style={{ fontSize: 12 }}
                message="Servicio recibido sin OC. Generá la OC desde Requerimientos aprobados: proveedor y precio ya vienen prellenados." />
            )}

            {ser.estado === "NO_APLICA" && ser.status_requerimiento_codigo === "APROBADO" && (
              <Alert type="info" showIcon style={{ fontSize: 12 }}
                message={`Servicio anterior al seguimiento (aprobado antes del ${formatDateOnly(SEGUIMIENTO_DESDE)}): se gestionaba por almacén y no figura como pendiente.`} />
            )}

            {puedeOperar && puedeLlegadaDirecta(ser.estado, ser.po_id) && (
              <Alert type="warning" showIcon style={{ fontSize: 12 }}
                message={ser.estado === "DEVUELTO"
                  ? `Tiene OC ${ser.nro_oc ?? ser.oc_docs?.numero_po ?? ""} aunque la última cotización fue rechazada.`
                  : `Tiene OC ${ser.nro_oc ?? ser.oc_docs?.numero_po ?? ""} pero nunca salió por el seguimiento.`}
                description="Si ya volvió con el trabajo hecho, registrá la llegada directa: se crea el envío con el proveedor de la OC y la cotización aceptada."
                action={<Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => abrir("llegada_directa", null)}>Registrar llegada</Button>} />
            )}

            {puedeOperar && puedeSalida && (
              <Button type="primary" icon={<SendOutlined />} onClick={() => abrir("salida", null)}>
                {ser.estado === "DEVUELTO" ? "Nuevo envío a proveedor" : "Registrar salida a proveedor"}
              </Button>
            )}

            <div>
              {ser.envios.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>Sin envíos todavía.</Text>
              ) : (
                [...ser.envios].reverse().map((e, i) => renderEnvio(e, ser.envios.length - 1 - i))
              )}
            </div>

            {ser.items.length > 0 && (
              <div>
                <Text strong style={{ fontSize: 12, display: "block", marginBottom: space.xs }}>Ítems asociados al servicio</Text>
                <Table<ServicioItemAsociado>
                  rowKey="id" size="small" pagination={false} dataSource={ser.items} columns={itemsCols}
                  scroll={{ x: 600 }}
                />
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={accion != null}
        title={accion ? tituloAccion[accion] : ""}
        onCancel={cerrarAccion}
        onOk={enviar}
        confirmLoading={saving}
        okText="Guardar"
        cancelText="Cancelar"
        width={modalWidth(screens, accion === "items" ? 820 : accion === "cotizacion_lote" ? 720 : 520)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          {accion === "salida" && (
            <>
              <Form.Item name="proveedor_id" label="Proveedor" rules={[{ required: true, message: "Elegí el proveedor" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Proveedor que cotiza"
                  options={proveedores.map((p) => ({ value: p.id, label: p.razon_social }))} />
              </Form.Item>
              <Form.Item name="fecha_salida" label="Fecha de salida" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="guia_salida" label="N° guía de salida"><Input placeholder="Ej. 001-000441" /></Form.Item>
              <Form.Item
                name="junto_con"
                label="Enviar junto con (misma guía y proveedor)"
                extra="Otros servicios aprobados pendientes de envío. La cotización, la llegada y los PDFs se registran después para todos juntos."
              >
                <Select
                  mode="multiple" allowClear showSearch optionFilterProp="label"
                  placeholder={candidatos.length ? "Opcional: sumar otros servicios" : "No hay otros servicios pendientes de envío"}
                  options={candidatos.map((c) => ({ value: c.id, label: etiquetaMiembro(c) }))}
                />
              </Form.Item>
              <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
              <Text type="secondary" style={{ fontSize: 11 }}>El PDF de la guía se sube después, en el envío.</Text>
            </>
          )}
          {accion === "cotizacion" && (
            <>
              <Form.Item name="resultado" label="Resultado" rules={[{ required: true, message: "Elegí el resultado" }]}>
                <Select options={[{ value: "ACEPTADA", label: "Aceptada — el proveedor hace el trabajo" }, { value: "RECHAZADA", label: "Rechazada — devuelve el componente" }]} />
              </Form.Item>
              <Form.Item name="fecha_cotizacion" label="Fecha"><DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="nro_cotizacion" label="N° cotización"><Input /></Form.Item>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Si es aceptada, el proveedor queda prellenado para la OC. Los montos se ponen al generar la OC en Requerimientos.
              </Text>
              {envioSel?.cotizacion_resultado === "ACEPTADA" && (
                <Alert type="warning" showIcon style={{ fontSize: 12, marginTop: space.sm }}
                  message="Este servicio ya estaba aceptado (con OC). Si el proveedor no lo realizó, dejalo como Rechazada: pasa a Devuelto, su línea sale de la OC (que se recalcula; si era la única, la OC se anula) y el requerimiento vuelve a Requerimientos para generar otra OC." />
              )}
            </>
          )}
          {accion === "editar" && envioSel && (
            <>
              <Form.Item name="fecha_salida" label="Fecha de salida" rules={[{ required: true, message: "Poné la fecha de salida" }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="guia_salida" label="N° guía de salida"><Input placeholder="Ej. 001-000441" /></Form.Item>
              <Form.Item name="nro_cotizacion" label="N° cotización"><Input /></Form.Item>
              {envioSel.cotizacion_resultado === "RECHAZADA" && (
                <Form.Item name="guia_devolucion" label="N° guía de devolución"><Input /></Form.Item>
              )}
              {envioSel.fecha_llegada && (
                <>
                  <Form.Item name="guia_llegada" label="N° guía de llegada"><Input /></Form.Item>
                  <Form.Item name="recibido_por" label="Recibido por"><Input /></Form.Item>
                </>
              )}
              <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
              {esConjunto(envioSel) && (
                <Alert type="info" showIcon style={{ fontSize: 11 }}
                  message={`Envío conjunto: la guía y la fecha de salida se corrigen en los ${envioSel.lote.length} servicios. La guía de llegada, en los que llegaron con la misma guía.`} />
              )}
            </>
          )}
          {accion === "devolucion" && (
            <>
              <Form.Item name="fecha_devolucion" label="Fecha de devolución" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="guia_devolucion" label="N° guía de devolución"><Input /></Form.Item>
            </>
          )}
          {(accion === "llegada" || accion === "llegada_directa") && (
            <>
              <Form.Item name="fecha_llegada" label="Fecha de llegada" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="guia_llegada" label="N° guía de llegada"><Input /></Form.Item>
              <Form.Item name="recibido_por" label="Recibido por"><Input /></Form.Item>
              {(ser?.oc_docs?.lineas_pendientes.length ?? 0) > 0 && (
                <Form.Item
                  name="lineas_oc"
                  label={`Otros ítems de la OC ${ser?.oc_docs?.numero_po ?? ""}`}
                  extra="Marcados: los usó el proveedor en el servicio (o llegaron con él) y quedan recibidos sin entrar al almacén. Desmarcá los que sí llegan al taller: esos se reciben por Movimientos."
                >
                  <Checkbox.Group
                    style={{ display: "flex", flexDirection: "column", gap: space.xs }}
                    options={(ser?.oc_docs?.lineas_pendientes ?? []).map((l) => ({
                      value: l.id,
                      label: (
                        <span style={{ fontSize: 12 }}>
                          {l.tipo_codigo && <Tag style={{ margin: 0, marginRight: space.xs, fontSize: 10 }}>{l.tipo_codigo}</Tag>}
                          {l.material_codigo ? `${l.material_codigo} · ` : ""}{l.descripcion ?? "—"} — {l.cantidad} {l.unidad_medida ?? ""}
                        </span>
                      ),
                    }))}
                  />
                </Form.Item>
              )}
              <Alert type="info" showIcon style={{ fontSize: 11 }}
                message={ser?.po_id != null
                  ? "Esto marca el servicio, sus ítems asociados y los ítems detallados en la PO como recibidos, y actualiza la OC."
                  : "Esto marca el servicio y sus ítems asociados como recibidos, aunque todavía no exista la OC."} />
            </>
          )}
          {accion === "cotizacion_lote" && (
            <>
              <Space size={space.sm} style={{ display: "flex" }} wrap>
                <Form.Item name="fecha_cotizacion" label="Fecha"><DatePicker format="DD/MM/YYYY" /></Form.Item>
                <Form.Item name="nro_cotizacion" label="N° cotización"><Input style={{ width: 160 }} /></Form.Item>
              </Space>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>
                Resultado por servicio: si el proveedor solo hace algunos, marcá los demás como rechazados: quedan Devueltos y
                libres para enviarse a otro proveedor (la guía de devolución se registra aparte, es opcional).
              </Text>
              <Form.List name="lineas">
                {(fields) => (
                  <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                    {fields.map((f) => {
                      const m = miembroPorEnvio.get(form.getFieldValue(["lineas", f.name, "envio_id"]));
                      return (
                        <div key={f.key} style={{ display: "grid", gridTemplateColumns: screens.md ? "1fr 210px" : "1fr", gap: space.xs, alignItems: "end", borderBottom: `1px solid ${brand.border}`, paddingBottom: space.xs }}>
                          <Form.Item name={[f.name, "envio_id"]} hidden><Input /></Form.Item>
                          <Text style={{ fontSize: 12 }}>{m ? etiquetaMiembro(m) : "—"}</Text>
                          <Form.Item name={[f.name, "resultado"]} label="Resultado" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                            <Select options={[{ value: "ACEPTADA", label: "Aceptada (lo hace)" }, { value: "RECHAZADA", label: "Rechazada (lo devuelve)" }]} />
                          </Form.Item>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Form.List>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: space.sm }}>
                En los aceptados, el proveedor queda prellenado para la OC. Los montos se ponen al generar la OC en Requerimientos.
              </Text>
            </>
          )}
          {(accion === "devolucion_lote" || accion === "llegada_lote" || accion === "factura_lote") && (
            <>
              <Form.Item
                name="envio_ids"
                label={accion === "devolucion_lote" ? "Servicios que vuelven sin hacer" : accion === "llegada_lote" ? "Servicios que llegaron" : "Servicios de esta factura"}
                rules={[{ required: true, type: "array", min: 1, message: "Elegí al menos un servicio" }]}
              >
                <Checkbox.Group style={{ display: "flex", flexDirection: "column", gap: space.xs }}
                  options={miembrosAccion.map((m) => ({ value: m.envio_id, label: <span style={{ fontSize: 12 }}>{etiquetaMiembro(m)}</span> }))} />
              </Form.Item>
              {accion === "devolucion_lote" && (
                <>
                  <Form.Item name="fecha_devolucion" label="Fecha de devolución" rules={[{ required: true }]}>
                    <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name="guia_devolucion" label="N° guía de devolución"><Input /></Form.Item>
                </>
              )}
              {accion === "llegada_lote" && (
                <>
                  <Form.Item name="fecha_llegada" label="Fecha de llegada" rules={[{ required: true }]}>
                    <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name="guia_llegada" label="N° guía de llegada"><Input /></Form.Item>
                  <Form.Item name="recibido_por" label="Recibido por"><Input /></Form.Item>
                  <Alert type="info" showIcon style={{ fontSize: 11 }}
                    message="Los servicios marcados (y sus ítems asociados) quedan recibidos, aunque todavía no exista la OC. Los que no marques siguen en trabajo." />
                </>
              )}
            </>
          )}
          {accion === "items" && (
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
                  {fields.map((f) => (
                    <div key={f.key} style={{ display: "grid", gridTemplateColumns: screens.md ? "80px 1fr 80px 80px 110px 80px 32px" : "1fr 1fr", gap: space.xs, alignItems: "end" }}>
                      <Form.Item name={[f.name, "tipo_codigo"]} label="Tipo" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select options={[{ value: "CAD", label: "CAD" }, { value: "MAC", label: "MAC" }]} />
                      </Form.Item>
                      <Form.Item shouldUpdate noStyle>
                        {() => form.getFieldValue(["items", f.name, "tipo_codigo"]) === "MAC" ? (
                          <Form.Item name={[f.name, "material_codigo"]} label="Cód. material" rules={[{ required: true, message: "Código" }]} style={{ marginBottom: 0 }}>
                            <Input placeholder="Código de catálogo" />
                          </Form.Item>
                        ) : (
                          <Form.Item name={[f.name, "descripcion"]} label="Descripción" rules={[{ required: true, message: "Descripción" }]} style={{ marginBottom: 0 }}>
                            <Input placeholder="Ej. Barra cromada D40x450" />
                          </Form.Item>
                        )}
                      </Form.Item>
                      <Form.Item name={[f.name, "cantidad"]} label="Cant." rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0.01} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item name={[f.name, "unidad_medida"]} label="UM" style={{ marginBottom: 0 }}>
                        <Input placeholder="UNIDAD" />
                      </Form.Item>
                      <Form.Item name={[f.name, "precio_unitario"]} label="P. Unit." style={{ marginBottom: 0 }}>
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item name={[f.name, "moneda"]} label="Mon." style={{ marginBottom: 0 }}>
                        <Select options={[{ value: "USD", label: "USD" }, { value: "SOL", label: "SOL" }]} />
                      </Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />
                    </div>
                  ))}
                  <Form.Item shouldUpdate noStyle>
                    {() => fields.some((f) => form.getFieldValue(["items", f.name, "tipo_codigo"]) === "MAC") ? (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Para MAC, la descripción se toma del catálogo; si querés otra, agregala como CAD.
                      </Text>
                    ) : null}
                  </Form.Item>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ tipo_codigo: "CAD", cantidad: 1, moneda: envioSel?.moneda_cotizacion ?? ser?.moneda ?? "USD" })}>
                    Agregar ítem
                  </Button>
                  <Alert type="info" showIcon style={{ fontSize: 11 }}
                    message="Los ítems nacen aprobados, enganchados al servicio y con el proveedor del envío. Si el servicio ya llegó, quedan recibidos (llegan instalados)." />
                </div>
              )}
            </Form.List>
          )}
        </Form>
      </Modal>
    </>
  );
}

// ── Generar seguimiento desde una selección ──────────────────────────
// En /requerimientos (vista por ítem) logística selecciona varios SER —igual
// que para crear la OC— y registra la salida de todos juntos al mismo
// proveedor: un envío conjunto (lote) con la misma guía.
export function ServicioSalidaModal({ open, sers, onClose, onDone }: {
  open: boolean;
  sers: ServicioSer[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { screens } = useResponsive();
  const [messageApi, ctx] = message.useMessage();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [proveedores, setProveedores] = useState<ProveedorOpt[]>([]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ fecha_salida: dayjs(), proveedor_id: undefined, guia_salida: "", observaciones: "" });
    if (proveedores.length) return;
    fetch("/api/proveedores?limit=10000")
      .then(async (r) => { if (r.ok) setProveedores(((await r.json()).data ?? []) as ProveedorOpt[]); })
      .catch(() => {});
  }, [open, form, proveedores.length]);

  async function guardar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const res = await fetch("/api/servicios-externos/envios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_ids: sers.map((s) => s.id),
          proveedor_id: v.proveedor_id,
          fecha_salida: dayjs.isDayjs(v.fecha_salida) ? v.fecha_salida.format("YYYY-MM-DD") : v.fecha_salida,
          guia_salida: v.guia_salida || null,
          observaciones: v.observaciones || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        messageApi.error(j?.error ?? "No se pudo registrar la salida.");
        return;
      }
      messageApi.success(sers.length > 1 ? `Envío conjunto de ${sers.length} servicios registrado.` : "Salida registrada.");
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {ctx}
      <Modal
        open={open}
        title={sers.length > 1 ? `Generar seguimiento — envío conjunto (${sers.length} servicios)` : "Generar seguimiento — salida a proveedor"}
        onCancel={onClose}
        onOk={guardar}
        confirmLoading={saving}
        okText="Registrar salida"
        cancelText="Cancelar"
        width={modalWidth(screens, 620)}
        destroyOnHidden
      >
        <div style={{ marginBottom: space.md, padding: space.sm, borderRadius: 6, background: `color-mix(in srgb, ${brand.cyan} 6%, var(--erp-surface))` }}>
          {sers.map((s) => (
            <div key={s.id} style={{ fontSize: 12 }}>
              <Tag color={SERVICIO_ESTADO_COLORS[s.estado]} style={{ margin: 0, marginRight: space.xs, fontSize: 10 }}>{SERVICIO_ESTADO_LABELS[s.estado]}</Tag>
              {etiquetaMiembro(s)}
            </div>
          ))}
        </div>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="proveedor_id" label="Proveedor" rules={[{ required: true, message: "Elegí el proveedor" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Proveedor que cotiza"
              options={proveedores.map((p) => ({ value: p.id, label: p.razon_social }))} />
          </Form.Item>
          <Form.Item name="fecha_salida" label="Fecha de salida" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="guia_salida" label="N° guía de salida"><Input placeholder="Ej. 001-000441" /></Form.Item>
          <Form.Item name="observaciones" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
          {sers.length > 1 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Después, en el seguimiento de cualquiera de ellos, la cotización, la llegada y los PDFs se registran para todos;
              cada servicio guarda su propio resultado (el proveedor puede hacer solo algunos).
            </Text>
          )}
        </Form>
      </Modal>
    </>
  );
}

// ── Registrar llegada desde una selección ────────────────────────────
// En /requerimientos y en Servicios externos (vista por servicio) logística
// selecciona los SER Incompletos que volvieron —aunque sean de guías
// distintas— y registra la llegada (= recepción) de todos con la misma guía.
// Si sus OCs tienen otras líneas pendientes (material que el proveedor usó
// en el servicio), se pueden dar por recibidas acá mismo.
export function ServicioLlegadaModal({ open, sers, onClose, onDone }: {
  open: boolean;
  sers: ServicioSer[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const { screens } = useResponsive();
  const [messageApi, ctx] = message.useMessage();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Otras líneas pendientes de las OCs de los servicios seleccionados (una
  // vez por OC, aunque varios SER compartan la misma).
  const ocsConLineas = useMemo(() => {
    const m = new Map<number, { numero_po: string; lineas: OcDocs["lineas_pendientes"] }>();
    for (const s of sers) {
      const oc = s.oc_docs;
      if (!oc || !oc.lineas_pendientes.length || m.has(oc.compra_id)) continue;
      m.set(oc.compra_id, { numero_po: oc.numero_po, lineas: oc.lineas_pendientes });
    }
    return [...m.values()];
  }, [sers]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        fecha_llegada: dayjs(), guia_llegada: "", recibido_por: "",
        lineas_oc: ocsConLineas.flatMap((oc) => oc.lineas.map((l) => l.id)),
      });
    }
  }, [open, form, ocsConLineas]);

  async function guardar() {
    let v: Record<string, unknown>;
    try { v = await form.validateFields(); } catch { return; }
    setSaving(true);
    try {
      const res = await fetch("/api/servicios-externos/llegada", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repuesto_ids: sers.map((s) => s.id),
          fecha_llegada: dayjs.isDayjs(v.fecha_llegada) ? v.fecha_llegada.format("YYYY-MM-DD") : v.fecha_llegada,
          guia_llegada: v.guia_llegada || null,
          recibido_por: v.recibido_por || null,
          lineas_oc: Array.isArray(v.lineas_oc) ? v.lineas_oc : [],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        messageApi.error(j?.error ?? "No se pudo registrar la llegada.");
        return;
      }
      messageApi.success(`Llegada registrada: ${sers.length} servicio(s) completo(s).`);
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {ctx}
      <Modal
        open={open}
        title={`Registrar llegada (${sers.length} servicio${sers.length > 1 ? "s" : ""})`}
        onCancel={onClose}
        onOk={guardar}
        confirmLoading={saving}
        okText="Registrar llegada"
        cancelText="Cancelar"
        width={modalWidth(screens, 620)}
        destroyOnHidden
      >
        <div style={{ marginBottom: space.md, padding: space.sm, borderRadius: 6, background: `color-mix(in srgb, ${brand.cyan} 6%, var(--erp-surface))` }}>
          {sers.map((s) => {
            const u = s.envios.length ? s.envios[s.envios.length - 1] : null;
            return (
              <div key={s.id} style={{ fontSize: 12 }}>
                {etiquetaMiembro(s)}
                {u?.proveedor && <Text type="secondary" style={{ fontSize: 11 }}> · {u.proveedor.razon_social}{u.guia_salida ? ` (guía salida ${u.guia_salida})` : ""}</Text>}
              </div>
            );
          })}
        </div>
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="fecha_llegada" label="Fecha de llegada" rules={[{ required: true }]}>
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="guia_llegada" label="N° guía de llegada"><Input /></Form.Item>
          <Form.Item name="recibido_por" label="Recibido por"><Input /></Form.Item>
          {ocsConLineas.length > 0 && (
            <Form.Item
              name="lineas_oc"
              label={`Otros ítems de la${ocsConLineas.length > 1 ? "s" : ""} OC ${ocsConLineas.map((oc) => oc.numero_po).join(", ")}`}
              extra="Marcados: los usó el proveedor en el servicio (o llegaron con él) y quedan recibidos sin entrar al almacén. Desmarcá los que sí llegan al taller: esos se reciben por Movimientos."
            >
              <Checkbox.Group
                style={{ display: "flex", flexDirection: "column", gap: space.xs }}
                options={ocsConLineas.flatMap((oc) => oc.lineas.map((l) => ({
                  value: l.id,
                  label: (
                    <span style={{ fontSize: 12 }}>
                      {ocsConLineas.length > 1 && <Text type="secondary" style={{ fontSize: 10, marginRight: space.xs }}>OC {oc.numero_po}</Text>}
                      {l.tipo_codigo && <Tag style={{ margin: 0, marginRight: space.xs, fontSize: 10 }}>{l.tipo_codigo}</Tag>}
                      {l.material_codigo ? `${l.material_codigo} · ` : ""}{l.descripcion ?? "—"} — {l.cantidad} {l.unidad_medida ?? ""}
                    </span>
                  ),
                })))}
              />
            </Form.Item>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>
            Los servicios (y sus ítems asociados) quedan Completos y recibidos, aunque todavía no exista la OC; si la OC existe, se actualiza.
            El PDF de la guía de llegada y la factura se cargan en la OC (Compras).
          </Text>
        </Form>
      </Modal>
    </>
  );
}

// Helper para filas de tablas: ¿la fecha requerida ya pasó sin recibir?
export function servicioAtrasado(ser: ServicioSer | undefined, hoy: Date): boolean {
  if (!ser || ser.estado === "RECIBIDO" || ser.estado === "NO_APLICA") return false;
  const f = dateOnlyLocal(ser.fecha_requerida);
  return !!f && f < hoy;
}

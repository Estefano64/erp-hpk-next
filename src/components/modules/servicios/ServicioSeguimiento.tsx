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
//   - useServicioSeguimiento: carga /api/servicios-externos para un conjunto
//     de SER (por OT o por ids) y expone un mapa por repuesto_id.
//
// Las acciones solo se muestran si `puedeOperar` (logística/admin). El resto
// ve el seguimiento en modo lectura.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space,
  Table, Tag, Timeline, Tooltip, Typography, Upload, message,
} from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, ExclamationCircleOutlined, FileTextOutlined,
  MinusCircleOutlined, PlusOutlined, SendOutlined, UploadOutlined, InboxOutlined, RollbackOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand, space } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { formatDateOnly, dateOnlyLocal } from "@/lib/dates";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";
import {
  ADJUNTO_LABELS, SERVICIO_ESTADO_COLORS, SERVICIO_ESTADO_LABELS,
  estadoDeEnvio, type AdjuntoTipo, type DocItem, type ServicioEstado,
} from "@/lib/servicios-externos";

const { Text } = Typography;

// ── Tipos (espejo de serializarSer en el server) ─────────────────────
export interface EnvioAdjunto {
  id: number; tipo: string; nombre_archivo: string; r2_key: string; tipo_mime: string; tamano: number;
  usuario_sube: string | null; fecha_subida: string;
}
export interface Envio {
  id: number;
  ot_repuesto_id: number;
  proveedor_id: number | null;
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
  adjuntos: EnvioAdjunto[];
}
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

type Accion = "salida" | "cotizacion" | "devolucion" | "llegada" | "factura" | "items" | null;

export function ServicioSeguimientoDrawer({ ser, open, onClose, onChanged, puedeOperar }: DrawerProps) {
  const { screens } = useResponsive();
  const [messageApi, ctx] = message.useMessage();
  const [accion, setAccion] = useState<Accion>(null);
  const [envioSel, setEnvioSel] = useState<Envio | null>(null);
  const [saving, setSaving] = useState(false);
  const [proveedores, setProveedores] = useState<ProveedorOpt[]>([]);
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
      form.setFieldsValue({ moneda_cotizacion: ser.moneda ?? "USD", fecha_cotizacion: dayjs() });
    }
    if (a === "salida") form.setFieldsValue({ fecha_salida: dayjs() });
    if (a === "devolucion") form.setFieldsValue({ fecha_devolucion: dayjs() });
    if (a === "llegada") form.setFieldsValue({ fecha_llegada: dayjs() });
    if (a === "factura" && envio) form.setFieldsValue({ nro_factura: envio.nro_factura ?? "" });
    if (a === "items" && ser) form.setFieldsValue({ items: [{ tipo_codigo: "CAD", cantidad: 1, moneda: envio?.moneda_cotizacion ?? ser.moneda ?? "USD" }] });
  }
  function cerrarAccion() { setAccion(null); setEnvioSel(null); }

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
            repuesto_ids: [ser.id],
            proveedor_id: values.proveedor_id,
            fecha_salida: fmt(values.fecha_salida),
            guia_salida: values.guia_salida ?? null,
            observaciones: values.observaciones ?? null,
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
      messageApi.success(`${ADJUNTO_LABELS[tipo]} subida.`);
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
    if (e.cotizacion_resultado === "ACEPTADA") {
      t.push("GUIA_LLEGADA");
      if (e.fecha_llegada) t.push("INFORME", "FACTURA");
    }
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
          {puedeOperar && !e.fecha_llegada && esUltimo && (
            <Popconfirm title="¿Eliminar este envío y sus PDFs?" onConfirm={() => borrarEnvio(e)} okText="Sí" cancelText="No">
              <Button size="small" danger type="text" icon={<DeleteOutlined />}>Eliminar</Button>
            </Popconfirm>
          )}
        </div>

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
                        <Button size="small" type="primary" onClick={() => abrir("cotizacion", e)}>Registrar resultado</Button>
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
                      <Text type="secondary" style={{ fontSize: 12 }}>pendiente</Text>
                      {puedeOperar && <Button size="small" type="primary" onClick={() => abrir("devolucion", e)}>Registrar devolución</Button>}
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
                      <Text type="secondary" style={{ fontSize: 12 }}>en trabajo</Text>
                      {puedeOperar && <Button size="small" type="primary" onClick={() => abrir("llegada", e)}>Registrar llegada</Button>}
                    </Space>
                  )}
                  {e.fecha_llegada && (
                    <div style={{ marginTop: 2 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Factura: {e.nro_factura ?? "—"}
                      </Text>
                      {puedeOperar && (
                        <Button type="link" size="small" style={{ fontSize: 11, padding: "0 4px", height: 18 }} onClick={() => abrir("factura", e)}>
                          {e.nro_factura ? "editar" : "registrar N°"}
                        </Button>
                      )}
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

        {e.cotizacion_resultado === "ACEPTADA" && puedeOperar && (
          <div style={{ marginTop: space.md }}>
            <Button size="small" icon={<PlusOutlined />} onClick={() => abrir("items", e)}>
              Agregar ítems del proveedor
            </Button>
          </div>
        )}
      </div>
    );
  }

  const tituloAccion: Record<Exclude<Accion, null>, string> = {
    salida: "Registrar salida a proveedor",
    cotizacion: "Resultado de la cotización",
    devolucion: "Registrar devolución del componente",
    llegada: "Registrar llegada del servicio (recepción)",
    factura: "Factura del proveedor",
    items: "Ítems agregados por el proveedor",
  };

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
              <div><Text type="secondary">OT:</Text> <Text strong>{ser.ot_codigo ?? "—"}</Text> {ser.cliente && <Text type="secondary">· {ser.cliente}</Text>}</div>
              <div><Text type="secondary">Req:</Text> {ser.nro_req ?? "—"} · ítem {ser.item_req ?? "—"}</div>
              <div><Text type="secondary">Estado req:</Text> {ser.status_requerimiento_codigo ?? "—"}</div>
              <div><Text type="secondary">OC:</Text> {ser.nro_oc ?? <Text type="secondary">sin OC</Text>}</div>
              <div><Text type="secondary">Cantidad:</Text> {ser.cantidad ?? 1} {ser.unidad_medida ?? ""} · recibido {ser.cantidad_recibida ?? 0}</div>
              <div><Text type="secondary">Precio ref.:</Text> {ser.precio_unitario != null ? `${ser.moneda ?? "USD"} ${ser.precio_unitario.toFixed(2)}` : "—"}</div>
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: space.xs }}>Documentación</Text>
              <DocsSemaforo docs={ser.docs} />
            </div>

            {ser.status_requerimiento_codigo !== "APROBADO" && (
              <Alert type="info" showIcon style={{ fontSize: 12 }}
                message="El seguimiento arranca cuando el requerimiento está aprobado." />
            )}

            {ser.estado === "RECIBIDO" && ser.po_id == null && (
              <Alert type="warning" showIcon style={{ fontSize: 12 }}
                message="Servicio recibido sin OC. Generá la OC desde Requerimientos aprobados: proveedor y precio ya vienen prellenados." />
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
        width={modalWidth(screens, accion === "items" ? 820 : 520)}
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
              <Space size={space.sm} style={{ display: "flex" }}>
                <Form.Item name="monto_cotizacion" label="Monto total cotizado" style={{ flex: 1 }}>
                  <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item name="moneda_cotizacion" label="Moneda">
                  <Select style={{ width: 90 }} options={[{ value: "USD", label: "USD" }, { value: "SOL", label: "SOL" }]} />
                </Form.Item>
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Si es aceptada, proveedor y precio quedan prellenados para la OC.
              </Text>
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
          {accion === "llegada" && (
            <>
              <Form.Item name="fecha_llegada" label="Fecha de llegada" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="guia_llegada" label="N° guía de llegada"><Input /></Form.Item>
              <Form.Item name="recibido_por" label="Recibido por"><Input /></Form.Item>
              <Form.Item name="nro_factura" label="N° factura (si ya llegó)"><Input /></Form.Item>
              <Alert type="info" showIcon style={{ fontSize: 11 }}
                message="Esto marca el servicio y sus ítems asociados como recibidos, aunque todavía no exista la OC." />
            </>
          )}
          {accion === "factura" && (
            <Form.Item name="nro_factura" label="N° factura del proveedor"><Input /></Form.Item>
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

// Helper para filas de tablas: ¿la fecha requerida ya pasó sin recibir?
export function servicioAtrasado(ser: ServicioSer | undefined, hoy: Date): boolean {
  if (!ser || ser.estado === "RECIBIDO" || ser.estado === "NO_APLICA") return false;
  const f = dateOnlyLocal(ser.fecha_requerida);
  return !!f && f < hoy;
}

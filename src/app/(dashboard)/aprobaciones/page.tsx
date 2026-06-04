"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Tabs, Table, Tag, Space, Button, Input, Select, Row, Col,
  Statistic, Popconfirm, Empty, Tooltip, Popover, Divider, Badge, App,
  Alert, Segmented, Modal, Upload,
} from "antd";
import type { UploadFile } from "antd";
import {
  CheckOutlined, CloseOutlined, ReloadOutlined, EyeOutlined, FileProtectOutlined,
  ShoppingCartOutlined, InboxOutlined, InfoCircleOutlined, HistoryOutlined,
  ClockCircleOutlined, CheckCircleOutlined, PaperClipOutlined, DeleteOutlined,
} from "@ant-design/icons";
import { uploadToR2 } from "@/lib/r2-client";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns, filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { useCachedFetch } from "@/lib/useCachedFetch";

import { formatDateOnly, formatDateOnlyShort } from "@/lib/dates";
import { R2FileLink } from "@/components/R2FileLink";
const { Title, Text } = Typography;

// ── Tipos del payload del endpoint /api/aprobaciones ──────────────────────
interface OCItem {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  descripcion: string | null;
  cantidad: number | string;
  precio_unitario: number | string | null;
  comentario_aprobacion?: string | null;
  material: { codigo: string; descripcion: string } | null;
  orden_trabajo: { id: number; ot: string | null } | null;
  // Adjuntos cargados al crear el requerimiento — el aprobador de OC los
  // ve antes de aceptar para revisar cotizaciones/specs/fotos.
  adjuntos?: { id: number; nombre_archivo: string; r2_key: string; tamano: number }[];
}
interface OCDetalle {
  id: number;
  cantidad: number | string;
  precio_unitario: number | string;
  total: number | string;
  material: { codigo: string; descripcion: string } | null;
}
interface OCPendiente {
  id: number;
  numero_po: string;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  status_oc_codigo: string | null;
  subtotal: number | string;
  impuesto: number | string;
  total: number | string;
  moneda_codigo: string | null;
  usuario_solicita: string;
  observaciones: string | null;
  proveedor: { id: number; razon_social: string; ruc: string | null } | null;
  orden_trabajo: { id: number; ot: string | null } | null;
  ubicacion: { codigo: string; nombre: string } | null;
  ot_repuestos: OCItem[];
  detalles: OCDetalle[];
}
interface ReqPendiente {
  id: number;
  ot_id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  descripcion: string | null;
  cantidad: number | string;
  unidad_medida: string | null;
  precio_unitario: number | string | null;
  moneda: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  usuario_solicita: string;
  orden_trabajo: {
    id: number; ot: string | null;
    descripcion: string | null;
    cod_rep_flota: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
  } | null;
  observaciones: string | null;
  material: { codigo: string; descripcion: string; precio: number | string | null; moneda_codigo: string | null; stock_actual: number | string | null } | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  adjuntos?: { id: number; nombre_archivo: string; r2_key: string; tamano: number }[];
}
interface HistorialItem {
  tipo: "OC" | "RQ";
  id: number;
  ref: string;
  descripcion: string;
  total: number | null;
  moneda: string | null;
  ot: string | null;
  ot_id: number | null;
  usuario: string | null;
  fecha: string | null;
  nuevo_estado: string;
}
interface AceptacionesPayload {
  ocs_pendientes: OCPendiente[];
  reqs_pendientes: ReqPendiente[];
  historial: HistorialItem[];
  counts: { ocs: number; reqs: number };
}

const TIPO_REQ_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };

interface ProveedorOpt { id: number; razon_social: string; ruc: string | null }

export default function AceptacionesPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();

  const [data, setData] = useState<AceptacionesPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [filterTipo, setFilterTipo] = useState<"ALL" | "OC" | "RQ">("ALL");
  const [filterOt, setFilterOt] = useState("");
  const [filterProveedor, setFilterProveedor] = useState<number | undefined>();

  // Selección bulk
  const [selOcs, setSelOcs] = useState<number[]>([]);
  const [selReqs, setSelReqs] = useState<number[]>([]);

  // Modal "Aprobar requerimiento" (con campo precio estimado opcional).
  const [aprobarModalReq, setAprobarModalReq] = useState<ReqPendiente | null>(null);
  const [aprobarPrecio, setAprobarPrecio] = useState<number | null>(null);
  const [aprobarMoneda, setAprobarMoneda] = useState<string>("USD");
  const [aprobarComentario, setAprobarComentario] = useState<string>("");
  // Archivos a adjuntar al req durante la aprobación (capturas, cotizaciones,
  // notas escaneadas). Se suben a R2 DESPUÉS de que el req se apruebe OK.
  const [aprobarArchivos, setAprobarArchivos] = useState<UploadFile[]>([]);
  const [aprobarSaving, setAprobarSaving] = useState(false);

  // Tab activo
  const [tab, setTab] = useState<"pendientes" | "historial">("pendientes");

  // Paginación por tabla
  const [pageOC, setPageOC] = useState(1);
  const [pageRQ, setPageRQ] = useState(1);
  const [pageHist, setPageHist] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  // Columnas ocultas
  const { ocultas: ocultasOC, setOcultas: setOcultasOC } = useColumnasOcultas("aceptaciones-oc-cols-v1");
  const { ocultas: ocultasRQ, setOcultas: setOcultasRQ } = useColumnasOcultas("aceptaciones-rq-cols-v1");
  const { ocultas: ocultasHist, setOcultas: setOcultasHist } = useColumnasOcultas("aceptaciones-hist-cols-v1");

  // Catálogo de proveedores para filtro
  type Wrapped<T> = { data: T[] } | null;
  const provRes = useCachedFetch<Wrapped<ProveedorOpt>>("/api/proveedores?limit=500");
  const proveedoresOpts = (provRes?.data ?? []).map((p) => ({
    value: p.id, label: `${p.razon_social}${p.ruc ? ` (${p.ruc})` : ""}`,
  }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("tipo", filterTipo);
      if (filterOt) params.set("ot", filterOt);
      if (filterProveedor) params.set("proveedor_id", String(filterProveedor));
      const res = await fetch(`/api/aprobaciones?${params}`);
      if (res.ok) setData(await res.json());
    } catch {
      message.error("Error al cargar aprobaciones");
    } finally {
      setLoading(false);
    }
  }, [filterTipo, filterOt, filterProveedor, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Acciones individuales ────────────────────────────────────────────
  function aceptarOC(id: number, numero_po: string) {
    // Comentario OPCIONAL. Igual mostramos el modal para que el aprobador
    // pueda dejar nota si quiere.
    let comentario = "";
    modal.confirm({
      title: `Aceptar OC ${numero_po}`,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            Comentario <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
          </Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Ej: aprobada con descuento negociado vía email"
            onChange={(e) => { comentario = e.target.value; }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "Aceptar OC",
      cancelText: "Cancelar",
      width: 480,
      onOk: () => doAceptarOC(id, numero_po, comentario),
    });
  }
  async function doAceptarOC(id: number, numero_po: string, comentario: string) {
    try {
      const txt = comentario.trim();
      const res = await fetch(`/api/compras/${id}/aceptar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comentario: txt || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al aceptar OC");
      message.success(`OC ${numero_po} aceptada.`);
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  }
  // Anular (rechazar) OC desde el panel de aprobaciones. Pide motivo opcional.
  // Distinto de aceptar: marca la OC como ANULADO, propaga a los OTRepuestos
  // vinculados, y registra el motivo en OTHistorial de cada OT afectada.
  function anularOC(id: number, numero_po: string) {
    let motivo = "";
    modal.confirm({
      title: `Rechazar OC ${numero_po}`,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            Motivo <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
            La OC pasará a ANULADA. Los items vinculados también quedan anulados.
          </Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Ej: precio incorrecto, proveedor cancelado, etc."
            onChange={(e) => { motivo = e.target.value; }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "Rechazar OC",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      width: 480,
      onOk: () => doAnularOC(id, numero_po, motivo),
    });
  }
  async function doAnularOC(id: number, numero_po: string, motivo: string) {
    try {
      const txt = motivo.trim();
      const res = await fetch(`/api/compras/${id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: txt || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al rechazar OC");
      message.success(`OC ${numero_po} rechazada.`);
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  }
  async function aprobarReq(
    id: number,
    ref: string,
    body?: { precio_estimado?: number; moneda?: string; comentario?: string },
  ) {
    try {
      const res = await fetch(`/api/requerimientos/${id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al aprobar requerimiento");
      message.success(`Req ${ref} aprobado.`);
      fetchData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  }

  // Abre el modal de aprobar con precio estimado.
  function openAprobarModal(r: ReqPendiente) {
    setAprobarModalReq(r);
    // Pre-cargar con el precio del item (si ya tiene), o el precio del material catálogo.
    const precioActual = r.precio_unitario != null
      ? Number(r.precio_unitario)
      : (r.material?.precio != null ? Number(r.material.precio) : null);
    setAprobarPrecio(precioActual);
    setAprobarMoneda(r.moneda ?? r.material?.moneda_codigo ?? "USD");
    setAprobarComentario("");
    setAprobarArchivos([]);
  }

  async function handleConfirmAprobar() {
    if (!aprobarModalReq) return;
    setAprobarSaving(true);
    try {
      const reqId = aprobarModalReq.id;
      const ref = `${aprobarModalReq.nro_req ?? "—"}/${aprobarModalReq.item_req ?? "—"}`;
      // Construimos el body con lo que tenga valor — todo es opcional al
      // server, pero solo mandamos las claves que el usuario completó.
      const body: { precio_estimado?: number; moneda?: string; comentario?: string } = {};
      if (aprobarPrecio != null && aprobarPrecio >= 0) {
        body.precio_estimado = aprobarPrecio;
        body.moneda = aprobarMoneda;
      }
      const com = aprobarComentario.trim();
      if (com.length > 0) body.comentario = com;
      await aprobarReq(reqId, ref, Object.keys(body).length > 0 ? body : undefined);

      // Después de aprobar OK, subir cualquier archivo adjunto vía R2 +
      // registrar en /api/requerimientos/{id}/adjuntos. Si una subida falla
      // no anulamos la aprobación; solo notificamos para que el usuario
      // pueda reintentar desde el detalle.
      // RcFile (de antd Upload) extiende File — convertimos al type base
      // para uploadToR2. El cast es seguro porque RcFile es File en runtime.
      const files: File[] = aprobarArchivos
        .map((f) => f.originFileObj as File | undefined)
        .filter((f): f is File => f != null);
      if (files.length > 0) {
        let ok = 0;
        let fail = 0;
        for (const file of files) {
          try {
            const meta = await uploadToR2({
              file,
              uploadUrlEndpoint: `/api/requerimientos/${reqId}/adjuntos/upload-url`,
            });
            const r = await fetch(`/api/requerimientos/${reqId}/adjuntos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(meta),
            });
            if (r.ok) ok++; else fail++;
          } catch {
            fail++;
          }
        }
        if (ok > 0) message.success(`${ok} adjunto(s) cargado(s).`);
        if (fail > 0) message.warning(`${fail} adjunto(s) fallaron — reintentá desde el detalle del req.`);
      }

      setAprobarModalReq(null);
    } finally {
      setAprobarSaving(false);
    }
  }
  function desaprobarReq(r: ReqPendiente) {
    let motivo = "";
    modal.confirm({
      title: `Desaprobar requerimiento ${r.nro_req ?? r.id}`,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            Motivo <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
          </Text>
          <Input.TextArea
            rows={3}
            placeholder="Ej: falta cotización del proveedor"
            onChange={(e) => { motivo = e.target.value; }}
            style={{ marginTop: 8 }}
            maxLength={500}
            showCount
          />
        </div>
      ),
      okText: "Desaprobar", okButtonProps: { danger: true },
      onOk: async () => {
        const txt = motivo.trim();
        const res = await fetch(`/api/requerimientos/${r.id}/desaprobar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: txt || null }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          message.error(err?.error ?? "Error.");
          return;
        }
        message.success("Desaprobado.");
        fetchData();
      },
    });
  }

  // ── Acciones bulk ───────────────────────────────────────────────────
  function bulkAceptarOC() {
    if (selOcs.length === 0) return;
    let comentario = "";
    modal.confirm({
      title: `Aceptar ${selOcs.length} OC(s)`,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            Comentario <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
            Si lo dejás, se aplica a todas las OCs del lote.
          </Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Ej: aprobadas tras revisión semanal"
            onChange={(e) => { comentario = e.target.value; }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "Aceptar todas",
      cancelText: "Cancelar",
      width: 480,
      onOk: async () => {
        const txt = comentario.trim();
        let ok = 0, errs = 0;
        for (const id of selOcs) {
          const res = await fetch(`/api/compras/${id}/aceptar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comentario: txt || null }),
          });
          if (res.ok) ok++; else errs++;
        }
        if (ok > 0) message.success(`${ok} OC(s) aceptada(s).`);
        if (errs > 0) message.warning(`${errs} con error.`);
        setSelOcs([]); fetchData();
      },
    });
  }
  async function bulkAprobarRQ() {
    if (selReqs.length === 0) return;
    // Pedimos comentario opcional ANTES de disparar la cascada de aprobar.
    // El mismo comentario va a TODOS los items del lote (los aprobaciones
    // posteriores pueden tocar el comentario uno por uno si hace falta).
    let comentario = "";
    modal.confirm({
      title: `Aprobar ${selReqs.length} requerimiento(s)`,
      content: (
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 12 }}>
            Comentario / recomendación{" "}
            <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
            Si lo dejás, se aplica a todos los items del lote.
          </Text>
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Ej: aprobar pero revisar fechas con cliente"
            onChange={(e) => { comentario = e.target.value; }}
            style={{ marginTop: 8 }}
          />
        </div>
      ),
      okText: "Aprobar todos",
      cancelText: "Cancelar",
      width: 480,
      onOk: async () => {
        const txt = comentario.trim();
        const body = txt ? { comentario: txt } : undefined;
        let ok = 0, errs = 0;
        for (const id of selReqs) {
          const res = await fetch(`/api/requerimientos/${id}/aprobar`, {
            method: "POST",
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
          });
          if (res.ok) ok++; else errs++;
        }
        if (ok > 0) message.success(`${ok} requerimiento(s) aprobado(s).`);
        if (errs > 0) message.warning(`${errs} con error.`);
        setSelReqs([]);
        fetchData();
      },
    });
  }

  // ── Popover preview de items de OC ──────────────────────────────────
  function popoverOC(o: OCPendiente) {
    // Trabajamos con los OCItem completos (no proyectamos) para tener acceso
    // a `adjuntos` y `id` del req original al renderizar.
    const usaOCRepuestos = o.ot_repuestos.length > 0;
    // Adjuntos agregados de TODOS los items del req — al aprobar OC el usuario
    // quiere verlos arriba sin abrir cada item. Cada uno conserva su id de req
    // para descargar vía R2FileLink.
    const adjuntosAgregados = usaOCRepuestos
      ? o.ot_repuestos.flatMap((it) =>
          (it.adjuntos ?? []).map((a) => ({ ...a, refReq: `${it.nro_req ?? "—"}/${it.item_req ?? "—"}` })),
        )
      : [];
    return (
      <div style={{ maxWidth: 540, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>
          {o.numero_po} — {o.proveedor?.razon_social ?? "Sin proveedor"}
        </div>
        <Row gutter={[8, 4]} style={{ marginBottom: 6 }}>
          <Col span={12}><span style={{ color: "#888" }}>OT:</span> <b>{o.orden_trabajo?.ot ?? "—"}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>Almacén:</span> <b>{o.ubicacion?.nombre ?? "—"}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>F. Solicitud:</span> <b>{formatDateOnly(o.fecha_solicitud)}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>F. Entrega Esp:</span> <b>{o.fecha_entrega_esperada ? formatDateOnly(o.fecha_entrega_esperada) : "—"}</b></Col>
          <Col span={24}><span style={{ color: "#888" }}>Total:</span> <b style={{ color: brand.navy }}>{o.moneda_codigo ?? "USD"} {Number(o.total).toFixed(2)}</b></Col>
        </Row>
        <Divider style={{ margin: "6px 0" }} />
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Items ({usaOCRepuestos ? o.ot_repuestos.length : o.detalles.length}):
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {usaOCRepuestos
            ? o.ot_repuestos.map((it) => {
                const ref = `${it.nro_req ?? "—"}/${it.item_req ?? "—"}`;
                const cod = it.material?.codigo ?? "—";
                const desc = it.material?.descripcion ?? it.descripcion ?? "—";
                const cant = Number(it.cantidad);
                const pu = it.precio_unitario != null ? Number(it.precio_unitario) : null;
                return (
                  <div key={it.id} style={{ padding: "2px 0", borderBottom: "1px dashed #eee", fontSize: 11 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Tag style={{ fontSize: 10, margin: 0 }}>{ref}</Tag>
                      <span style={{ color: "#888", minWidth: 70 }}>{cod}</span>
                      <span style={{ flex: 1 }}>{desc}</span>
                      <span style={{ minWidth: 60, textAlign: "right" }}>{cant}</span>
                      {pu != null && <span style={{ minWidth: 70, textAlign: "right", color: brand.navy }}>{pu.toFixed(2)}</span>}
                    </div>
                    {it.comentario_aprobacion && (
                      <div style={{ marginLeft: 4, marginTop: 2, color: brand.cyan, fontStyle: "italic", fontSize: 10 }}>
                        💬 {it.comentario_aprobacion}
                      </div>
                    )}
                  </div>
                );
              })
            : o.detalles.map((d) => (
                <div key={d.id} style={{ display: "flex", gap: 6, padding: "2px 0", borderBottom: "1px dashed #eee", fontSize: 11 }}>
                  <Tag style={{ fontSize: 10, margin: 0 }}>—</Tag>
                  <span style={{ color: "#888", minWidth: 70 }}>{d.material?.codigo ?? "—"}</span>
                  <span style={{ flex: 1 }}>{d.material?.descripcion ?? "—"}</span>
                  <span style={{ minWidth: 60, textAlign: "right" }}>{Number(d.cantidad)}</span>
                  <span style={{ minWidth: 70, textAlign: "right", color: brand.navy }}>{Number(d.precio_unitario).toFixed(2)}</span>
                </div>
              ))}
        </div>
        {adjuntosAgregados.length > 0 && (
          <>
            <Divider style={{ margin: "6px 0" }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Adjuntos ({adjuntosAgregados.length}):</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {adjuntosAgregados.map((a) => (
                <div key={a.id} style={{ fontSize: 11 }}>
                  <Tag style={{ fontSize: 9, margin: 0, marginRight: 4 }}>{a.refReq}</Tag>
                  <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                    📎 {a.nombre_archivo} ({(a.tamano / 1024).toFixed(1)} KB)
                  </R2FileLink>
                </div>
              ))}
            </div>
          </>
        )}
        {o.observaciones && (
          <>
            <Divider style={{ margin: "6px 0" }} />
            <Text type="secondary" style={{ fontSize: 11, fontStyle: "italic" }}>{o.observaciones}</Text>
          </>
        )}
      </div>
    );
  }

  // ── Popover preview de un requerimiento ─────────────────────────────
  function popoverRQ(r: ReqPendiente) {
    const precioCat = r.material?.precio != null ? Number(r.material.precio) : null;
    return (
      <div style={{ maxWidth: 400, fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>
          {r.nro_req ?? "—"}/{r.item_req ?? "—"} — {r.material?.descripcion ?? r.descripcion ?? "—"}
        </div>
        <Row gutter={[8, 4]}>
          <Col span={12}><span style={{ color: "#888" }}>OT:</span> <b>{r.orden_trabajo?.ot ?? "—"}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>Cliente:</span> <b>{r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "—"}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>Tipo:</span> <Tag color={TIPO_REQ_COLOR[r.tipo_codigo ?? ""] ?? "default"} style={{ margin: 0 }}>{r.tipo_codigo ?? "—"}</Tag></Col>
          <Col span={12}><span style={{ color: "#888" }}>Código:</span> <b>{r.material?.codigo ?? "—"}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>Cantidad:</span> <b>{Number(r.cantidad)} {r.unidad_medida ?? ""}</b></Col>
          <Col span={12}>
            <span style={{ color: "#888" }}>Stock:</span>{" "}
            <b style={{ color: Number(r.material?.stock_actual ?? 0) > 0 ? "#52c41a" : "#ff4d4f" }}>
              {r.material?.stock_actual != null ? Number(r.material.stock_actual) : "—"}
            </b>
          </Col>
          <Col span={12}>
            <span style={{ color: "#888" }}>Precio catálogo:</span>{" "}
            <b>{precioCat != null ? `${r.material?.moneda_codigo ?? "USD"} ${precioCat.toFixed(2)}` : "—"}</b>
          </Col>
          <Col span={12}><span style={{ color: "#888" }}>F. Solicitud:</span> <b>{formatDateOnly(r.fecha_solicitud)}</b></Col>
          <Col span={12}><span style={{ color: "#888" }}>F. Requerida:</span> <b>{r.fecha_requerida ? formatDateOnly(r.fecha_requerida) : "—"}</b></Col>
          <Col span={24}><span style={{ color: "#888" }}>Solicita:</span> <b>{r.usuario_solicita}</b></Col>
          {r.observaciones && (
            <Col span={24}>
              <span style={{ color: "#888" }}>Observaciones:</span>{" "}
              <span style={{ fontStyle: "italic" }}>{r.observaciones}</span>
            </Col>
          )}
          {r.adjuntos && r.adjuntos.length > 0 && (
            <Col span={24}>
              <div style={{ color: "#888", marginBottom: 4 }}>Adjuntos ({r.adjuntos.length}):</div>
              <Space size={4} wrap>
                {r.adjuntos.map((a) => (
                  <Tag key={a.id} style={{ fontSize: 10, margin: 0 }}>
                    <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                      📎 {a.nombre_archivo} ({(a.tamano / 1024).toFixed(1)} KB)
                    </R2FileLink>
                  </Tag>
                ))}
              </Space>
            </Col>
          )}
        </Row>
      </div>
    );
  }

  // ── Columnas: OCs pendientes ────────────────────────────────────────
  const ocs = data?.ocs_pendientes ?? [];
  const reqs = data?.reqs_pendientes ?? [];
  const historial = data?.historial ?? [];

  const ocColumns: ColumnsType<OCPendiente> = [
    numeracionColumn<OCPendiente>({ current: pageOC, pageSize }),
    {
      key: "numero_po", title: "Nro OC", width: 130,
      ...filtroPorColumna(ocs, "numero_po"),
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      render: (_, o) => <Tag color={brand.navy}>{o.numero_po}</Tag>,
    },
    {
      key: "proveedor", title: "Proveedor", width: 200, ellipsis: true,
      filters: [...new Set(ocs.map((o) => o.proveedor?.razon_social).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, o) => o.proveedor?.razon_social === value,
      render: (_, o) => o.proveedor?.razon_social ?? <Text type="secondary">—</Text>,
    },
    {
      key: "ot", title: "OT", width: 110,
      filters: [...new Set(ocs.map((o) => o.orden_trabajo?.ot).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, o) => o.orden_trabajo?.ot === value,
      render: (_, o) => o.orden_trabajo?.ot
        ? <a onClick={() => router.push(`/ordenes-trabajo/${o.orden_trabajo!.id}`)}><Tag>{o.orden_trabajo.ot}</Tag></a>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "items", title: "Items", width: 90, align: "center",
      sorter: (a, b) => a.ot_repuestos.length - b.ot_repuestos.length,
      render: (_, o) => {
        const adjCount = o.ot_repuestos.reduce(
          (acc, it) => acc + (it.adjuntos?.length ?? 0),
          0,
        );
        return (
          <Space size={4}>
            <Tag>{o.ot_repuestos.length || o.detalles.length}</Tag>
            {adjCount > 0 && (
              <Tooltip title={`${adjCount} adjunto(s) cargado(s) en los requerimientos — visibles en el popover de la OC`}>
                <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>📎 {adjCount}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      key: "total", title: "Total", width: 130, align: "right",
      sorter: (a, b) => Number(a.total) - Number(b.total),
      render: (_, o) => <span style={{ fontWeight: 600, color: brand.navy }}>{o.moneda_codigo ?? "USD"} {Number(o.total).toFixed(2)}</span>,
    },
    {
      key: "fecha_solicitud", title: "F. Solicitud", width: 100,
      sorter: (a, b) => a.fecha_solicitud.localeCompare(b.fecha_solicitud),
      render: (_, o) => <Text style={{ fontSize: 11 }}>{formatDateOnlyShort(o.fecha_solicitud)}</Text>,
    },
    {
      key: "fecha_entrega", title: "F. Entrega Esp.", width: 110,
      render: (_, o) => o.fecha_entrega_esperada ? <Text style={{ fontSize: 11 }}>{formatDateOnlyShort(o.fecha_entrega_esperada)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      key: "usuario", title: "Solicita", width: 130, ellipsis: true,
      ...filtroPorColumna(ocs, "usuario_solicita"),
      render: (_, o) => o.usuario_solicita,
    },
    {
      key: "acciones", title: "Acciones", width: 220, fixed: "right", align: "center",
      render: (_, o) => (
        <Space size={4}>
          <Tooltip title="Aprobar OC (pasa a En Proceso)">
            <Popconfirm
              title={`¿Aprobar OC ${o.numero_po}?`}
              description="La OC pasará a En Proceso y se registrará tu usuario como aprobador."
              onConfirm={() => aceptarOC(o.id, o.numero_po)}
              okText="Aprobar" cancelText="Cancelar"
            >
              <Button type="primary" size="small" icon={<CheckOutlined />}>Aprobar</Button>
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Rechazar OC (la anula)">
            <Button
              danger size="small" icon={<CloseOutlined />}
              onClick={() => anularOC(o.id, o.numero_po)}
            >
              Rechazar
            </Button>
          </Tooltip>
          <Tooltip title={o.orden_trabajo?.ot ? `Ver OT ${o.orden_trabajo.ot}` : "Ver compras"}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() =>
                router.push(
                  o.orden_trabajo?.id ? `/ordenes-trabajo/${o.orden_trabajo.id}` : "/compras",
                )
              }
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Columnas: RQs pendientes ────────────────────────────────────────
  const rqColumns: ColumnsType<ReqPendiente> = [
    numeracionColumn<ReqPendiente>({ current: pageRQ, pageSize }),
    {
      key: "nro_req", title: "Nro Req / Item", width: 140,
      ...filtroPorColumna(reqs, "nro_req"),
      render: (_, r) => (
        <Text strong style={{ fontSize: 12 }}>{r.nro_req ?? "—"}/{r.item_req ?? "—"}</Text>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 70, align: "center",
      filters: [...new Set(reqs.map((r) => r.tipo_codigo).filter(Boolean) as string[])].map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.tipo_codigo === value,
      render: (_, r) => <Tag color={TIPO_REQ_COLOR[r.tipo_codigo ?? ""] ?? "default"} style={{ margin: 0 }}>{r.tipo_codigo ?? "—"}</Tag>,
    },
    {
      key: "ot", title: "OT", width: 110,
      filters: [...new Set(reqs.map((r) => r.orden_trabajo?.ot).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.ot === value,
      render: (_, r) => r.orden_trabajo?.ot
        ? <a onClick={() => router.push(`/ordenes-trabajo/${r.orden_trabajo!.id}`)}><Tag>{r.orden_trabajo.ot}</Tag></a>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "cliente", title: "Mina / Cliente", width: 160, ellipsis: true,
      filters: [...new Set(reqs.map((r) =>
        r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social,
      ).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) =>
        (r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social) === value,
      render: (_, r) => {
        const c = r.orden_trabajo?.cliente;
        if (!c) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={c.razon_social}>
            <Tag color="purple" style={{ margin: 0 }}>
              📍 {c.nombre_comercial ?? c.razon_social}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "flota", title: "Flota", width: 130, ellipsis: true,
      filters: [...new Set(reqs.map((r) => r.orden_trabajo?.cod_rep_flota).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.cod_rep_flota === value,
      render: (_, r) => r.orden_trabajo?.cod_rep_flota
        ? <Tag color="geekblue" style={{ margin: 0 }}>{r.orden_trabajo.cod_rep_flota}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion_ot", title: "Descripción OT", width: 220, ellipsis: true,
      render: (_, r) => r.orden_trabajo?.descripcion
        ? <Tooltip title={r.orden_trabajo.descripcion}><span style={{ fontSize: 12 }}>{r.orden_trabajo.descripcion}</span></Tooltip>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion", title: "Material / Descripción", ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          {r.material?.codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material.codigo}</Tag>}
          {r.material?.descripcion ?? r.descripcion ?? "—"}
          {r.observaciones && (
            <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 2 }}>
              {r.observaciones}
            </div>
          )}
          {r.adjuntos && r.adjuntos.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Space size={4} wrap>
                {r.adjuntos.map((a) => (
                  <Tooltip key={a.id} title={`${a.nombre_archivo} (${(a.tamano / 1024).toFixed(1)} KB)`}>
                    <Tag style={{ fontSize: 10, margin: 0 }}>
                      <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                        📎 {a.nombre_archivo.length > 20 ? `${a.nombre_archivo.slice(0, 17)}...` : a.nombre_archivo}
                      </R2FileLink>
                    </Tag>
                  </Tooltip>
                ))}
              </Space>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "cantidad", title: "Cant.", width: 90, align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      key: "stock", title: "Stock", width: 80, align: "right",
      render: (_, r) => {
        if (r.material?.stock_actual == null) return <Text type="secondary">—</Text>;
        const st = Number(r.material.stock_actual);
        return <span style={{ color: st > 0 ? "#52c41a" : "#ff4d4f", fontWeight: 600 }}>{st}</span>;
      },
    },
    {
      key: "precio_cat", title: "P. catálogo", width: 110, align: "right",
      render: (_, r) => {
        if (r.material?.precio == null) return <Text type="secondary">—</Text>;
        return <span>{r.material.moneda_codigo ?? "USD"} {Number(r.material.precio).toFixed(2)}</span>;
      },
    },
    {
      key: "total_estimado", title: "P. Estimado Total", width: 140, align: "right",
      sorter: (a, b) => {
        const pa = Number(a.material?.precio ?? 0) * Number(a.cantidad ?? 0);
        const pb = Number(b.material?.precio ?? 0) * Number(b.cantidad ?? 0);
        return pa - pb;
      },
      render: (_, r) => {
        if (r.material?.precio == null) return <Text type="secondary">—</Text>;
        const total = Number(r.material.precio) * Number(r.cantidad);
        return (
          <Text strong style={{ color: brand.navy }}>
            {r.material.moneda_codigo ?? "USD"} {total.toFixed(2)}
          </Text>
        );
      },
    },
    {
      key: "fecha_solicitud", title: "F. Solicitud", width: 100,
      sorter: (a, b) => a.fecha_solicitud.localeCompare(b.fecha_solicitud),
      render: (_, r) => <Text style={{ fontSize: 11 }}>{formatDateOnlyShort(r.fecha_solicitud)}</Text>,
    },
    {
      key: "usuario", title: "Solicita", width: 130, ellipsis: true,
      ...filtroPorColumna(reqs, "usuario_solicita"),
      render: (_, r) => r.usuario_solicita,
    },
    {
      key: "acciones", title: "Acciones", width: 220, fixed: "right", align: "center",
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Aprobar requerimiento">
            <Button
              type="primary" size="small" icon={<CheckOutlined />}
              onClick={() => openAprobarModal(r)}
            >
              Aprobar
            </Button>
          </Tooltip>
          <Tooltip title="Rechazar (desaprobar) requerimiento">
            <Button
              danger size="small" icon={<CloseOutlined />}
              onClick={() => desaprobarReq(r)}
            >
              Rechazar
            </Button>
          </Tooltip>
          <Tooltip title={r.orden_trabajo?.ot ? `Ver OT ${r.orden_trabajo.ot}` : "Ver requerimientos"}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() =>
                router.push(
                  r.orden_trabajo?.id ? `/ordenes-trabajo/${r.orden_trabajo.id}` : "/requerimientos",
                )
              }
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── Columnas: historial ─────────────────────────────────────────────
  const histColumns: ColumnsType<HistorialItem> = [
    numeracionColumn<HistorialItem>({ current: pageHist, pageSize }),
    {
      key: "tipo", title: "Tipo", width: 70, align: "center",
      filters: [{ text: "OC", value: "OC" }, { text: "RQ", value: "RQ" }],
      onFilter: (value, h) => h.tipo === value,
      render: (_, h) => <Tag color={h.tipo === "OC" ? "blue" : "purple"} style={{ margin: 0 }}>{h.tipo}</Tag>,
    },
    {
      key: "ref", title: "Referencia", width: 140,
      render: (_, h) => <Text strong>{h.ref}</Text>,
    },
    {
      key: "ot", title: "OT", width: 110,
      render: (_, h) => h.ot
        ? <a onClick={() => h.ot_id && router.push(`/ordenes-trabajo/${h.ot_id}`)}><Tag>{h.ot}</Tag></a>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion", title: "Descripción", ellipsis: true,
      render: (_, h) => h.descripcion,
    },
    {
      key: "total", title: "Total", width: 130, align: "right",
      render: (_, h) => h.total != null ? <span style={{ color: brand.navy }}>{h.moneda ?? "USD"} {h.total.toFixed(2)}</span> : <Text type="secondary">—</Text>,
    },
    {
      key: "nuevo_estado", title: "Estado", width: 110, align: "center",
      render: (_, h) => <Tag color="green">{h.nuevo_estado}</Tag>,
    },
    {
      key: "usuario", title: "Aceptó/Aprobó", width: 140, ellipsis: true,
      render: (_, h) => h.usuario ?? <Text type="secondary">—</Text>,
    },
    {
      key: "fecha", title: "Fecha", width: 130,
      sorter: (a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""),
      render: (_, h) => h.fecha ? dayjs(h.fecha).format("DD/MM/YY HH:mm") : <Text type="secondary">—</Text>,
    },
  ];

  const { columnas: ocColumnsRz, components: ocComponents, resetAnchos: resetOcAnchos, TableDragWrapper: OcDragWrapper } =
    useColumnasRedimensionables<OCPendiente>(ocColumns, "aceptaciones-oc-cols-widths-v1", { data: ocs });
  const { columnas: rqColumnsRz, components: rqComponents, resetAnchos: resetRqAnchos, TableDragWrapper: RqDragWrapper } =
    useColumnasRedimensionables<ReqPendiente>(rqColumns, "aceptaciones-rq-cols-widths-v1", { data: reqs });
  const { columnas: histColumnsRz, components: histComponents, resetAnchos: resetHistAnchos, TableDragWrapper: HistDragWrapper } =
    useColumnasRedimensionables<HistorialItem>(histColumns, "aceptaciones-hist-cols-widths-v1", { data: historial });

  const totalPendientes = useMemo(() => ocs.length + reqs.length, [ocs, reqs]);

  // Sumas de los items seleccionados, agrupadas por moneda. Para OCs se usa el
  // `total`; para RQs se usa `cantidad * precio_unitario` (si falta alguno se
  // suma 0). Devuelve un array de strings tipo "USD 1,234.56".
  function formatSumasPorMoneda(sumas: Record<string, number>): string {
    const entries = Object.entries(sumas).filter(([, v]) => v > 0);
    if (entries.length === 0) return "";
    return entries
      .map(([m, v]) => `${m} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .join(" + ");
  }
  const montoSelOcs = useMemo(() => {
    const sumas: Record<string, number> = {};
    for (const id of selOcs) {
      const oc = ocs.find((o) => o.id === id);
      if (!oc) continue;
      const m = oc.moneda_codigo ?? "USD";
      sumas[m] = (sumas[m] ?? 0) + Number(oc.total ?? 0);
    }
    return formatSumasPorMoneda(sumas);
  }, [selOcs, ocs]);
  const montoSelReqs = useMemo(() => {
    const sumas: Record<string, number> = {};
    for (const id of selReqs) {
      const r = reqs.find((x) => x.id === id);
      if (!r) continue;
      const m = r.moneda ?? "USD";
      const sub = Number(r.cantidad ?? 0) * Number(r.precio_unitario ?? 0);
      sumas[m] = (sumas[m] ?? 0) + sub;
    }
    return formatSumasPorMoneda(sumas);
  }, [selReqs, reqs]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <FileProtectOutlined style={{ marginRight: 8 }} />
          Aceptaciones
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
      </div>

      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 14 } }}>
            <Statistic
              title="OC pendientes"
              value={ocs.length}
              prefix={<ShoppingCartOutlined style={{ color: "#faad14" }} />}
              styles={{ content: { color: "#faad14" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 14 } }}>
            <Statistic
              title="RQ pendientes"
              value={reqs.length}
              prefix={<InboxOutlined style={{ color: "#1890ff" }} />}
              styles={{ content: { color: "#1890ff" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 14 } }}>
            <Statistic
              title="Total pendientes"
              value={totalPendientes}
              prefix={<ClockCircleOutlined style={{ color: brand.navy }} />}
              styles={{ content: { color: brand.navy } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 14 } }}>
            <Statistic
              title="En historial"
              value={historial.length}
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={8}>
            <Segmented
              block
              value={filterTipo}
              onChange={(v) => setFilterTipo(v as typeof filterTipo)}
              options={[
                { value: "ALL", label: "Todos" },
                { value: "OC", label: "Solo OC" },
                { value: "RQ", label: "Solo RQ" },
              ]}
            />
          </Col>
          <Col xs={12} md={5}>
            <Input
              placeholder="OT"
              value={filterOt}
              onChange={(e) => setFilterOt(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} md={7}>
            <Select
              placeholder="Proveedor (sólo OC)"
              value={filterProveedor}
              onChange={setFilterProveedor}
              options={proveedoresOpts}
              allowClear showSearch optionFilterProp="label"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Button block icon={<ReloadOutlined />} onClick={() => { setFilterTipo("ALL"); setFilterOt(""); setFilterProveedor(undefined); }}>
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          {
            key: "pendientes",
            label: (
              <span>
                <ClockCircleOutlined /> Pendientes
                <Badge count={totalPendientes} style={{ background: brand.navy, marginLeft: 8 }} showZero />
              </span>
            ),
            children: (
              <>
                {/* OCs pendientes */}
                {(filterTipo === "ALL" || filterTipo === "OC") && (
                  <Card
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={
                      <Space>
                        <ShoppingCartOutlined />
                        <span>Órdenes de Compra pendientes</span>
                        <Tag color="orange">{ocs.length}</Tag>
                      </Space>
                    }
                    extra={
                      <Space>
                        {selOcs.length > 0 && montoSelOcs && (
                          <Tag color="blue" style={{ fontWeight: 600 }}>
                            Total seleccionado: {montoSelOcs}
                          </Tag>
                        )}
                        {selOcs.length > 0 && (
                          <Popconfirm
                            title={`¿Aprobar ${selOcs.length} OC(s) seleccionada(s)?`}
                            onConfirm={bulkAceptarOC}
                            okText="Aprobar" cancelText="Cancelar"
                          >
                            <Button type="primary" icon={<CheckOutlined />} size="small">
                              Aprobar seleccionadas ({selOcs.length})
                            </Button>
                          </Popconfirm>
                        )}
                        <ColumnasToggleButton<OCPendiente>
                          columns={ocColumns}
                          ocultas={ocultasOC}
                          setOcultas={setOcultasOC}
                          obligatorias={["__num", "numero_po", "acciones"]}
                        />
                        <Button onClick={resetOcAnchos}>Restablecer anchos</Button>
                      </Space>
                    }
                  >
                    {ocs.length === 0 ? (
                      <Empty description="No hay OCs pendientes." />
                    ) : (
                      <OcDragWrapper>
                                              <Table<OCPendiente>
                          rowKey="id"
                          columns={visibleColumns(ocColumnsRz, ocultasOC)}
                          components={ocComponents}
                          dataSource={ocs}
                          loading={loading}
                          size="small"
                          rowSelection={{
                            selectedRowKeys: selOcs,
                            onChange: (keys) => setSelOcs(keys as number[]),
                          }}
                          pagination={paginacionEstandar({
                            current: pageOC, pageSize, total: ocs.length,
                            onChange: (p, s) => { setPageOC(p); setPageSize(s); },
                            label: "OC pendientes",
                            placement: ["topEnd", "bottomEnd"],
                          })}
                          scroll={{ x: 1100 }}
                          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
                        />
                      </OcDragWrapper>
                    )}
                  </Card>
                )}

                {/* RQs pendientes */}
                {(filterTipo === "ALL" || filterTipo === "RQ") && (
                  <Card
                    size="small"
                    title={
                      <Space>
                        <InboxOutlined />
                        <span>Requerimientos pendientes</span>
                        <Tag color="blue">{reqs.length}</Tag>
                      </Space>
                    }
                    extra={
                      <Space>
                        {selReqs.length > 0 && montoSelReqs && (
                          <Tag color="blue" style={{ fontWeight: 600 }}>
                            Total seleccionado: {montoSelReqs}
                          </Tag>
                        )}
                        {selReqs.length > 0 && (
                          <Popconfirm
                            title={`¿Aprobar ${selReqs.length} requerimiento(s) seleccionado(s)?`}
                            onConfirm={bulkAprobarRQ}
                            okText="Aprobar" cancelText="Cancelar"
                          >
                            <Button type="primary" icon={<CheckOutlined />} size="small">
                              Aprobar seleccionados ({selReqs.length})
                            </Button>
                          </Popconfirm>
                        )}
                        <ColumnasToggleButton<ReqPendiente>
                          columns={rqColumns}
                          ocultas={ocultasRQ}
                          setOcultas={setOcultasRQ}
                          obligatorias={["__num", "nro_req", "acciones"]}
                        />
                        <Button onClick={resetRqAnchos}>Restablecer anchos</Button>
                      </Space>
                    }
                  >
                    {reqs.length === 0 ? (
                      <Empty description="No hay requerimientos pendientes." />
                    ) : (
                      <RqDragWrapper>
                                              <Table<ReqPendiente>
                          rowKey="id"
                          columns={visibleColumns(rqColumnsRz, ocultasRQ)}
                          components={rqComponents}
                          dataSource={reqs}
                          loading={loading}
                          size="small"
                          rowSelection={{
                            selectedRowKeys: selReqs,
                            onChange: (keys) => setSelReqs(keys as number[]),
                          }}
                          pagination={paginacionEstandar({
                            current: pageRQ, pageSize, total: reqs.length,
                            onChange: (p, s) => { setPageRQ(p); setPageSize(s); },
                            label: "requerimientos pendientes",
                            placement: ["topEnd", "bottomEnd"],
                          })}
                          scroll={{ x: 1300 }}
                          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
                        />
                      </RqDragWrapper>
                    )}
                  </Card>
                )}
              </>
            ),
          },
          {
            key: "historial",
            label: (
              <span>
                <HistoryOutlined /> Historial
                <Badge count={historial.length} style={{ background: "#52c41a", marginLeft: 8 }} showZero />
              </span>
            ),
            children: (
              <Card
                size="small"
                title={
                  <Space>
                    <HistoryOutlined />
                    <span>Últimas aceptaciones / aprobaciones</span>
                  </Space>
                }
                extra={
                  <Space>
                    <ColumnasToggleButton<HistorialItem>
                      columns={histColumns}
                      ocultas={ocultasHist}
                      setOcultas={setOcultasHist}
                      obligatorias={["__num", "tipo", "ref"]}
                    />
                    <Button onClick={resetHistAnchos}>Restablecer anchos</Button>
                  </Space>
                }
              >
                {historial.length === 0 ? (
                  <Empty description="Sin historial todavía." />
                ) : (
                  <HistDragWrapper>
                                      <Table<HistorialItem>
                      rowKey={(h) => `${h.tipo}-${h.id}`}
                      columns={visibleColumns(histColumnsRz, ocultasHist)}
                      components={histComponents}
                      dataSource={historial}
                      loading={loading}
                      size="small"
                      pagination={paginacionEstandar({
                        current: pageHist, pageSize, total: historial.length,
                        onChange: (p, s) => { setPageHist(p); setPageSize(s); },
                        label: "movimientos",
                        placement: ["topEnd", "bottomEnd"],
                      })}
                      scroll={{ x: 1100 }}
                      sticky={{ offsetHeader: 56, offsetScroll: 0 }}
                    />
                  </HistDragWrapper>
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Modal aprobar requerimiento — incluye campo precio estimado opcional. */}
      <Modal
        title={aprobarModalReq
          ? `Aprobar requerimiento ${aprobarModalReq.nro_req ?? "—"}/${aprobarModalReq.item_req ?? "—"}`
          : "Aprobar"}
        open={aprobarModalReq != null}
        onCancel={() => setAprobarModalReq(null)}
        onOk={handleConfirmAprobar}
        confirmLoading={aprobarSaving}
        okText="Aprobar"
        cancelText="Cancelar"
        destroyOnHidden
      >
        {aprobarModalReq && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#666" }}>
              <div>
                <b>{aprobarModalReq.tipo_codigo}</b> —{" "}
                {aprobarModalReq.material?.descripcion ?? aprobarModalReq.descripcion ?? "—"}
              </div>
              <div style={{ marginTop: 4 }}>
                Cantidad:{" "}
                <b>
                  {Number(aprobarModalReq.cantidad).toLocaleString()}{" "}
                  {aprobarModalReq.unidad_medida ?? ""}
                </b>
              </div>
              {aprobarModalReq.orden_trabajo?.ot && (
                <div style={{ marginTop: 4 }}>
                  OT: <Tag>{aprobarModalReq.orden_trabajo.ot}</Tag>
                  {aprobarModalReq.orden_trabajo.cod_rep_flota && (
                    <Tag color="geekblue">{aprobarModalReq.orden_trabajo.cod_rep_flota}</Tag>
                  )}
                </div>
              )}
            </div>
            <div>
              <Text strong style={{ display: "block", marginBottom: 4 }}>
                Precio estimado <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
              </Text>
              <Space>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={aprobarPrecio ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAprobarPrecio(v === "" ? null : Number(v));
                  }}
                  placeholder="0.00"
                  style={{ width: 180 }}
                />
                <Select showSearch optionFilterProp="label"
                  value={aprobarMoneda}
                  onChange={setAprobarMoneda}
                  style={{ width: 100 }}
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "PEN", label: "PEN" },
                  ]}
                />
              </Space>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                Si lo dejás vacío, se aprueba sin tocar el precio actual del item.
              </div>
            </div>
            <div>
              <Text strong style={{ display: "block", marginBottom: 4 }}>
                Comentario / recomendación{" "}
                <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
              </Text>
              <Input.TextArea
                rows={3}
                maxLength={500}
                showCount
                placeholder="Ej: priorizar compra antes del 15, validar marca con técnico, etc."
                value={aprobarComentario}
                onChange={(e) => setAprobarComentario(e.target.value)}
              />
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                Si lo dejás, queda visible en la tabla de Requerimientos.
              </div>
            </div>

            {/* Adjuntos ya cargados al crear el req (read-only). */}
            {aprobarModalReq.adjuntos && aprobarModalReq.adjuntos.length > 0 && (
              <div>
                <Text strong style={{ display: "block", marginBottom: 4 }}>
                  Adjuntos del requerimiento ({aprobarModalReq.adjuntos.length})
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {aprobarModalReq.adjuntos.map((a) => (
                    <div key={a.id} style={{ fontSize: 12 }}>
                      <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                        📎 {a.nombre_archivo} ({(a.tamano / 1024).toFixed(1)} KB)
                      </R2FileLink>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Nuevos adjuntos a sumar durante la aprobación. Se suben a R2
                y registran en BD DESPUÉS del aprobar OK (no antes — si el
                aprobar falla, no querés archivos huérfanos en R2). */}
            <div>
              <Text strong style={{ display: "block", marginBottom: 4 }}>
                <PaperClipOutlined /> Adjuntar capturas / archivos{" "}
                <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
              </Text>
              <Upload
                fileList={aprobarArchivos}
                onChange={({ fileList }) => setAprobarArchivos(fileList)}
                beforeUpload={() => false} // evita upload automático — lo hacemos a mano después de aprobar
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              >
                <Button icon={<PaperClipOutlined />} size="small">Seleccionar archivos</Button>
              </Upload>
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                Imágenes, PDFs o documentos. Se cargan en Cloudflare como adjuntos del requerimiento
                — visibles después en la tabla y al aceptar la OC.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

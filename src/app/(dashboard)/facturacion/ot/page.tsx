"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Modal, Form, Input, DatePicker, InputNumber, App, Tooltip, Alert, Upload,
  Divider, Spin, List, Select,
} from "antd";
import {
  AuditOutlined, ReloadOutlined, FileDoneOutlined, EyeOutlined,
  WarningOutlined, PaperClipOutlined, CheckCircleOutlined, DownloadOutlined,
  UploadOutlined, FileTextOutlined, CarOutlined, CameraOutlined,
  SolutionOutlined, FolderOpenOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useEscrituraApi } from "@/lib/use-escritura";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { formatDateOnly, dateOnlyLocal } from "@/lib/dates";
import { useColumnasRedimensionables, STICKY_HEADER, paginacionEstandar } from "@/lib/tables";
import { uploadToR2, openR2File } from "@/lib/r2-client";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

// Los PDFs del expediente de la OT, en el orden del flujo (llegada → despacho).
// CUÁLES son requisito para facturar depende del tipo de OT y lo decide el
// backend (src/lib/facturacion-requisitos.ts): viaja por fila en `requeridas`.
// Un Bien, por ejemplo, no tiene guía de llegada ni informe de reparación —
// esos chips se muestran igual (por si alguien subió algo) pero no bloquean.
const PDFS_EXPEDIENTE: Array<{
  etapa: "recepcion" | "cotizacion" | "po_cliente" | "termino" | "despacho";
  label: string;
  abrev: string;
}> = [
  { etapa: "recepcion",  label: "Guía de llegada",  abrev: "G. Llegada" },
  { etapa: "cotizacion", label: "Cotización",       abrev: "Cotiz." },
  { etapa: "po_cliente", label: "PO del cliente",   abrev: "PO" },
  { etapa: "termino",    label: "Informe",          abrev: "Informe" },
  { etapa: "despacho",   label: "Guía de despacho", abrev: "G. Despacho" },
];

type PdfsPorEtapa = {
  recepcion: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
  cotizacion: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
  po_cliente: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
  termino: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
  despacho: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
  // No es un PDF requerido para facturar (se sube después) — se muestra como
  // chip informativo aparte.
  facturacion: Array<{ id: number; r2_key: string; nombre_archivo: string; fecha_subida: string }>;
};

interface OTLista {
  id: number;
  ot: string | null;
  cliente: string | null;
  codigo_reparacion: string | null;
  ns: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  fecha_entrega: string | null;
  // Fecha de despacho efectiva (fecha_despacho o, si falta, la de emisión de
  // la guía). Es el criterio de orden y de los filtros año/mes.
  fecha_despacho: string | null;
  fecha_facturacion: string | null;
  guia_entrega_salida: string | null;
  nro_informe_entrega: string | null;
  nro_factura: string | null;
  monto_cotizacion: number | string | null;
  taller_status: string | null;
  tipo_codigo: string | null;
  pdfs: PdfsPorEtapa;
  pdfs_ok: boolean;
  // Etapas cuyo PDF es requisito para ESTA OT (depende de su tipo).
  requeridas: Array<"recepcion" | "cotizacion" | "po_cliente" | "termino" | "despacho">;
  faltantes: string[];
  // ¿Ya se facturó? El backend exige LAS DOS señales del circuito real:
  // fecha de facturación cargada Y PDF de la factura subido. Nadie usó nunca
  // el "Registrar factura" de esta pantalla (0 OTs con nro_factura en prod),
  // así que mirar solo ese campo daba todas como pendientes.
  facturada: boolean;
  // Qué falta para darla por facturada (vacío si ya lo está).
  falta_factura: string[];
  // N° de factura leído del nombre del PDF — sugerencia para pre-llenar.
  nro_factura_pdf: string | null;
}

// ── Adjuntos del modal — ETAPAS y meta visual.
interface AdjuntoCompleto {
  id: number;
  orden_trabajo_id: number;
  etapa_codigo: string;
  nombre_archivo: string;
  r2_key: string;
  tipo_mime: string;
  tamano: number;
  fecha_subida: string;
}

const ETAPAS_ADJ: Array<{ key: string; label: string; icon: React.ReactNode; color: string }> = [
  { key: "recepcion",   label: "Recepción y GR cliente", icon: <CameraOutlined />,      color: "#1677ff" },
  { key: "evaluacion",  label: "Evaluación",             icon: <FileTextOutlined />,    color: "#722ed1" },
  { key: "cotizacion",  label: "Cotización",             icon: <FileTextOutlined />,    color: "#fa8c16" },
  { key: "po_cliente",  label: "PO Cliente",             icon: <SolutionOutlined />,    color: "#13c2c2" },
  { key: "termino",     label: "Término de reparación",  icon: <CheckCircleOutlined />, color: "#52c41a" },
  { key: "despacho",    label: "Despacho y GR",          icon: <CarOutlined />,         color: "#eb2f96" },
  { key: "facturacion", label: "Facturación",            icon: <FileTextOutlined />,    color: "#1d6f42" },
];

// Opciones del filtro de meses (multi-selección, no rango).
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
].map((label, i) => ({ value: i + 1, label }));

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FacturacionOTPage() {
  const { message: msg } = App.useApp();
  const router = useRouter();
  // Facturar es de logística/contabilidad (misma matriz que el servidor).
  const puedeFacturar = useEscrituraApi("/api/facturacion/ot/0", "POST");
  const { screens } = useResponsive();
  const [data, setData] = useState<OTLista[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [otSel, setOtSel] = useState<OTLista | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{
    nro_factura: string;
    fecha_facturacion: Dayjs;
    monto?: number;
    observaciones?: string;
  }>();
  // Adjuntos completos de la OT seleccionada (todas las etapas), cargados al
  // abrir el modal. Independientes del campo `adjuntos` (que solo trae despacho
  // + termino para el flag adjuntos_ok del listado).
  const [adjuntos, setAdjuntos] = useState<AdjuntoCompleto[]>([]);
  const [loadingAdj, setLoadingAdj] = useState(false);
  // Subida en curso por etapa (para feedback visual del botón).
  const [uploadingEtapa, setUploadingEtapa] = useState<string | null>(null);

  // Filtros año/mes (multi-selección, NO rango). El filtrado es server-side:
  // el universo de despachadas son ~3,000 OTs y traerlas todas con sus
  // adjuntos en cada carga es pesado. Arranca en el año más reciente.
  // Arranca en "pendientes": esta pantalla es la cola de trabajo de
  // facturación, así que las OTs con la factura ya cargada (fecha + PDF) no
  // deben estorbar. Siguen accesibles con el toggle — el endpoint devuelve
  // todas las despachadas — pero no se muestran por defecto.
  // Esta pantalla muestra SOLO pendientes (estado=pendientes fijo en el
  // fetch); lo facturado se consulta en /facturacion/facturas.
  const [filtroAnios, setFiltroAnios] = useState<number[]>([]);
  const [filtroMeses, setFiltroMeses] = useState<number[]>([]);
  // Rango de fechas de despacho (opcional; se combina con año/mes).
  const [filtroRango, setFiltroRango] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [aniosDisponibles, setAniosDisponibles] = useState<Array<{ anio: number; n: number }>>([]);
  // Conteos del universo filtrado (sin el estado) — para las pestañas.
  const [counts, setCounts] = useState<{ todas: number; pendientes: number; facturadas: number }>({ todas: 0, pendientes: 0, facturadas: 0 });
  const [aniosHidratado, setAniosHidratado] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Filtro de estado SERVER-side: siempre pendientes.
      params.set("estado", "pendientes");
      if (filtroAnios.length > 0) params.set("anios", filtroAnios.join(","));
      if (filtroMeses.length > 0) params.set("meses", filtroMeses.join(","));
      if (filtroRango?.[0]) params.set("desde", filtroRango[0].format("YYYY-MM-DD"));
      if (filtroRango?.[1]) params.set("hasta", filtroRango[1].format("YYYY-MM-DD"));
      const res = await fetch(`/api/facturacion/ot?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.counts) setCounts(json.counts);
      const anios = (json.anios_disponibles ?? []) as Array<{ anio: number; n: number }>;
      setAniosDisponibles(anios);
      // Primera carga: preseleccionar el año más reciente para no traer todo
      // el histórico de una. El usuario puede sumar años desde el filtro.
      if (!aniosHidratado) {
        setAniosHidratado(true);
        if (anios.length > 0) setFiltroAnios([anios[0].anio]);
      }
    } catch {
      msg.error("Error al cargar facturación de OTs");
    } finally {
      setLoading(false);
    }
  }, [msg, filtroAnios, filtroMeses, filtroRango, aniosHidratado]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchAdjuntos = useCallback(async (otId: number) => {
    setLoadingAdj(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/adjuntos`);
      if (!res.ok) throw new Error("Error");
      const json = await res.json();
      setAdjuntos((json.data ?? []) as AdjuntoCompleto[]);
    } catch {
      msg.error("No se pudieron cargar los adjuntos");
      setAdjuntos([]);
    } finally {
      setLoadingAdj(false);
    }
  }, [msg]);

  const abrirModal = (ot: OTLista) => {
    // El bloqueo por adjuntos faltantes solo aplica si NO se ha facturado aún
    // — la idea es que el modal sirva también para revisar adjuntos / subir
    // los que faltan, no solo para registrar el número de factura.
    setOtSel(ot);
    form.resetFields();
    form.setFieldsValue({
      // Si no hay número registrado, proponemos el que viene en el nombre del
      // PDF de la factura — el usuario solo confirma.
      nro_factura: ot.nro_factura ?? ot.nro_factura_pdf ?? "",
      fecha_facturacion: ot.fecha_facturacion ? dayjs(ot.fecha_facturacion) : dayjs(),
      monto: ot.monto_cotizacion != null ? Number(ot.monto_cotizacion) : undefined,
    });
    setAdjuntos([]);
    setModalOpen(true);
    void fetchAdjuntos(ot.id);
  };

  // Subida directa a R2 + registro en BD. Se usa para Factura PDF (etapa
  // "facturacion") y Guía de remisión (etapa "despacho").
  const handleUpload = async (file: File, etapa: string): Promise<boolean> => {
    if (!otSel) return false;
    setUploadingEtapa(etapa);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/ordenes-trabajo/${otSel.id}/adjuntos/upload-url`,
        extra: { etapa },
      });
      const res = await fetch(`/api/ordenes-trabajo/${otSel.id}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, etapa }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "No se pudo registrar el adjunto");
      }
      msg.success(`${file.name} subido (${etapa})`);
      await fetchAdjuntos(otSel.id);
      // El indicador "adjuntos_ok" del listado depende del backend — refrescar
      // la grilla principal para que el botón "Facturar" se habilite.
      fetchData();
      return true;
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "Error al subir archivo");
      return false;
    } finally {
      setUploadingEtapa(null);
    }
  };

  const handleGuardar = async () => {
    if (!otSel) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/facturacion/ot/${otSel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nro_factura: values.nro_factura,
          fecha_facturacion: values.fecha_facturacion ? values.fecha_facturacion.format("YYYY-MM-DD") : null,
          monto: values.monto ?? null,
          observaciones: values.observaciones ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      msg.success(json.message ?? "Factura registrada");
      setModalOpen(false);
      setOtSel(null);
      fetchData();
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  // El API ya filtra por estado en el SERVER (param `estado`), así que `data`
  // es exactamente la vista activa. Los KPIs "Pendientes"/"Facturadas" usan
  // los `counts` del endpoint (universo del filtro año/mes/rango); "Listas" y
  // "Faltan PDFs" se miden sobre las pendientes CARGADAS — de nada sirve
  // avisar que a una OT ya facturada le faltan PDFs.
  const pendientesCargadas = data.filter((o) => !o.facturada);
  const listas = pendientesCargadas.filter((o) => o.pdfs_ok).length;
  const faltanPdfs = pendientesCargadas.length - listas;

  const dataVista = data;

  const columns: ColumnsType<OTLista> = useMemo(() => [
    {
      key: "ot", title: "OT", width: 110,
      render: (_v, r) => (
        <Tag color={brand.navy} style={{ cursor: "pointer", margin: 0 }} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}>
          {r.ot ?? `#${r.id}`}
        </Tag>
      ),
    },
    {
      key: "cliente", title: "Cliente", width: 180, ellipsis: true,
      render: (_v, r) => r.cliente ?? "—",
    },
    {
      key: "codrep", title: "Código reparable", ellipsis: true,
      render: (_v, r) => r.codigo_reparacion ?? <Text type="secondary">—</Text>,
    },
    {
      key: "ns", title: "N° Serie", width: 110,
      render: (_v, r) => r.ns ?? <Text type="secondary">—</Text>,
    },
    {
      key: "wo_po", title: "WO / PO Cliente", width: 150,
      render: (_v, r) => (
        <div style={{ lineHeight: 1.2, fontSize: 11 }}>
          <div>{r.wo_cliente ?? "—"}</div>
          <div style={{ color: "#888" }}>{r.po_cliente ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "guia", title: "Guía", width: 140,
      render: (_v, r) => r.guia_entrega_salida
        ? <Tag color="blue" style={{ margin: 0 }}>{r.guia_entrega_salida}</Tag>
        : <Tag color="default">—</Tag>,
    },
    {
      // Fecha de despacho: viene del campo de la OT y, si está vacío, de la
      // emisión de la guía. Es el orden por defecto de la vista (desc).
      key: "fecha_despacho", title: "F. Despacho", width: 115, align: "center",
      sorter: (a, b) => (a.fecha_despacho ?? "").localeCompare(b.fecha_despacho ?? ""),
      render: (_v, r) => r.fecha_despacho
        ? formatDateOnly(r.fecha_despacho)
        : <Text type="secondary">—</Text>,
    },
    {
      // Un chip por PDF del expediente. Verde = subido (click para descargar).
      // Si falta: ámbar punteado cuando es requisito para ESTA OT, y gris
      // tenue cuando no aplica a su tipo (no bloquea). El tooltip lo aclara.
      // Al final, separado, el chip de la FACTURA: no es requisito para
      // facturar (se sube después), por eso va aparte y no bloquea nada.
      key: "pdfs", title: "PDFs del expediente", width: 400,
      render: (_v, r) => (
        <Space size={4} wrap>
          {PDFS_EXPEDIENTE.map((p) => {
            const archivos = r.pdfs[p.etapa];
            const tiene = archivos.length > 0;
            const primero = archivos[0];
            const esRequisito = r.requeridas.includes(p.etapa);
            return (
              <Tooltip
                key={p.etapa}
                title={tiene
                  ? `${p.label}: ${primero.nombre_archivo}${archivos.length > 1 ? ` (+${archivos.length - 1} más)` : ""} — click para abrir`
                  : esRequisito
                    ? `Falta: ${p.label}. Subilo desde el botón "Adjuntar y facturar".`
                    : `${p.label}: no aplica a una OT de tipo ${r.tipo_codigo ?? "—"}, no hace falta para facturar.`}
              >
                <Tag
                  color={tiene ? "green" : "default"}
                  style={{
                    margin: 0, fontSize: 11,
                    cursor: tiene ? "pointer" : "not-allowed",
                    borderStyle: tiene ? "solid" : "dashed",
                    // Un faltante que no aplica al tipo se apaga: está ahí por
                    // completitud, no como pendiente.
                    opacity: tiene ? 1 : esRequisito ? 0.7 : 0.35,
                  }}
                  icon={tiene ? <CheckCircleOutlined /> : esRequisito ? <WarningOutlined /> : undefined}
                  onClick={tiene
                    ? () => openR2File({ key: primero.r2_key, resource: "ot-adjunto", resourceId: primero.id })
                        .catch((e) => msg.error(e instanceof Error ? e.message : "Error al abrir"))
                    : undefined}
                >
                  {p.abrev}{archivos.length > 1 ? ` (${archivos.length})` : ""}
                </Tag>
              </Tooltip>
            );
          })}
          {(() => {
            // Chip de la FACTURA (etapa "facturacion"). Azul = ya subida;
            // gris "Sin factura" = todavía no. Nunca en rojo: no es un
            // requisito incumplido, es el paso siguiente del flujo.
            const archivos = r.pdfs.facturacion ?? [];
            const tiene = archivos.length > 0;
            const primero = archivos[0];
            return (
              <Tooltip
                title={tiene
                  ? `Factura: ${primero.nombre_archivo}${archivos.length > 1 ? ` (+${archivos.length - 1} más)` : ""} — click para abrir`
                  : "El PDF de la factura todavía no se subió. Se carga al facturar (queda en Adjuntos de la OT, etapa Facturación)."}
              >
                <Tag
                  color={tiene ? "blue" : "default"}
                  style={{
                    margin: 0, fontSize: 11,
                    cursor: tiene ? "pointer" : "default",
                    borderStyle: tiene ? "solid" : "dashed",
                    opacity: tiene ? 1 : 0.7,
                  }}
                  icon={tiene ? <FileDoneOutlined /> : <FileTextOutlined />}
                  onClick={tiene
                    ? () => openR2File({ key: primero.r2_key, resource: "ot-adjunto", resourceId: primero.id })
                        .catch((e) => msg.error(e instanceof Error ? e.message : "Error al abrir"))
                    : undefined}
                >
                  {tiene ? `Factura${archivos.length > 1 ? ` (${archivos.length})` : ""}` : "Sin factura"}
                </Tag>
              </Tooltip>
            );
          })()}
        </Space>
      ),
    },
    {
      // Con nro_factura vacío en TODAS las OTs de prod, esta columna mostraba
      // "Pendiente" en gris incluso para las ya facturadas. Ahora refleja el
      // estado real: número si lo hay, sino "Facturada" cuando el backend la
      // detectó por fecha o por PDF, y recién ahí "Pendiente".
      key: "fact", title: "N° Factura", width: 150,
      render: (_v, r) => {
        if (r.nro_factura) return <Tag color="green" style={{ margin: 0 }}>{r.nro_factura}</Tag>;
        if (r.facturada) {
          // Sin número registrado, pero el nombre del PDF suele traerlo.
          if (r.nro_factura_pdf) {
            return (
              <Tooltip title={`Detectado en el nombre del PDF. Abrí el botón de factura para registrarlo (el campo viene pre-llenado).`}>
                <Tag color="green" style={{ margin: 0, borderStyle: "dashed" }}>{r.nro_factura_pdf}</Tag>
              </Tooltip>
            );
          }
          return (
            <Tooltip title="Facturada (fecha + PDF) pero sin número registrado, y el nombre del PDF no lo trae. Cargalo desde el botón de factura.">
              <Tag color="green" style={{ margin: 0 }}>Facturada</Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip title={r.falta_factura.length > 0 ? `Falta: ${r.falta_factura.join(" y ")}.` : undefined}>
            <Tag color="default">Pendiente</Tag>
          </Tooltip>
        );
      },
    },
    {
      key: "fecha_fact", title: "F. Facturación", width: 110,
      render: (_v, r) => r.fecha_facturacion ? formatDateOnly(r.fecha_facturacion) : <Text type="secondary">—</Text>,
    },
    {
      key: "monto", title: "Monto", width: 110, align: "right",
      render: (_v, r) => r.monto_cotizacion != null ? (
        <Text strong style={{ color: brand.navy }}>{Number(r.monto_cotizacion).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</Text>
      ) : <Text type="secondary">—</Text>,
    },
    {
      key: "acc", title: "Acciones", width: 200, fixed: "right",
      render: (_v, r) => (
        <Space size={4}>
          <Tooltip title="Ver OT">
            <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)} />
          </Tooltip>
          {puedeFacturar && (
            <Tooltip title={r.facturada
              ? "Ya facturada — abrir para revisar PDFs o cargar el N° de factura"
              : r.pdfs_ok
                ? "Abrir factura + PDFs"
                : `Faltan PDFs: ${r.faltantes.join(", ")}. Podés subirlos desde la ventana.`}>
              <Button
                size="small"
                type="primary"
                icon={<FileDoneOutlined />}
                onClick={() => abrirModal(r)}
              >
                {r.facturada ? "Editar factura" : (r.pdfs_ok ? "Facturar" : "Adjuntar y facturar")}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ], [router, puedeFacturar]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <AuditOutlined style={{ marginRight: 8 }} />
          Facturación de OTs (mina)
        </Title>
        <Space wrap>
          {/* Esta pantalla es SOLO la cola de pendientes (2026-08-28); lo ya
              facturado se consulta en /facturacion/facturas. */}
          {/* Filtros año / mes: multi-selección (no rango). Los años salen del
              propio endpoint con su conteo; el filtrado ocurre en el server.
              optionFilterProp="label": sin esto, tipear en el select no
              filtraba (el match por defecto es contra el value numérico). */}
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Año(s)"
            value={filtroAnios}
            onChange={(v) => setFiltroAnios(v)}
            options={aniosDisponibles.map((a) => ({ value: a.anio, label: `${a.anio} (${a.n})` }))}
            style={{ minWidth: 160, maxWidth: 280 }}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Mes(es)"
            value={filtroMeses}
            onChange={(v) => setFiltroMeses(v)}
            options={MESES}
            style={{ minWidth: 150, maxWidth: 280 }}
            maxTagCount="responsive"
          />
          {/* Rango de fechas de despacho — se combina (Y) con año/mes. */}
          <DatePicker.RangePicker
            value={filtroRango}
            onChange={(v) => setFiltroRango(v)}
            format="DD/MM/YYYY"
            allowClear
            placeholder={["Desp. desde", "Desp. hasta"]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
          {/* La tabla no tiene búsqueda ni filtros de columna: el endpoint
              devuelve exactamente lo que se ve (OTs ya despachadas). */}
          <ExportarExcelButton<OTLista>
            endpoint="/api/facturacion/ot"
            filename="Facturacion-OT"
            // Exporta lo que se está viendo (respeta el toggle Todas /
            // Pendientes / Facturadas, además de los filtros año/mes).
            currentRows={dataVista}
            columns={[
              { key: "ot", label: "OT", value: (r) => r.ot ?? `#${r.id}` },
              { key: "cliente", label: "Cliente", value: (r) => r.cliente ?? "" },
              { key: "codrep", label: "Código reparable", value: (r) => r.codigo_reparacion ?? "" },
              { key: "ns", label: "N° Serie", value: (r) => r.ns ?? "" },
              { key: "wo", label: "WO Cliente", value: (r) => r.wo_cliente ?? "" },
              { key: "po", label: "PO Cliente", value: (r) => r.po_cliente ?? "" },
              { key: "guia", label: "Guía", value: (r) => r.guia_entrega_salida ?? "" },
              { key: "fecha_despacho", label: "F. Despacho", value: (r) => dateOnlyLocal(r.fecha_despacho) },
              {
                key: "adjuntos", label: "Adjuntos",
                value: (r) => r.pdfs_ok ? "Expediente completo" : `Faltan: ${r.faltantes.join(", ")}`,
              },
              { key: "pdf_factura", label: "PDF factura", value: (r) => (r.pdfs?.facturacion?.length ? "Sí" : "No") },
              { key: "estado_fact", label: "Estado", value: (r) => (r.facturada ? "Facturada" : "Pendiente") },
              { key: "fact", label: "N° Factura", value: (r) => r.nro_factura ?? "" },
              { key: "fact_pdf", label: "N° Factura (del PDF)", value: (r) => r.nro_factura_pdf ?? "" },
              { key: "falta_fact", label: "Falta para facturar", value: (r) => r.falta_factura.join(", ") },
              // Fecha como Date real y monto con formato — celdas tipadas.
              { key: "fecha_fact", label: "F. Facturación", value: (r) => dateOnlyLocal(r.fecha_facturacion) },
              { key: "monto", label: "Monto", value: (r) => r.monto_cotizacion != null ? Number(r.monto_cotizacion) : "", z: "#,##0.00" },
            ]}
          />
        </Space>
      </div>

      <Alert
        type="info" showIcon icon={<PaperClipOutlined />} style={{ marginBottom: 12 }}
        title="Requisitos para facturar"
        description="Por defecto se listan las OTs ya despachadas que todavía NO tienen la factura cargada. Una OT cuenta como facturada cuando tiene la fecha de facturación Y el PDF de la factura — ambas cosas se cargan desde el tab Adjuntos del detalle de la OT, etapa Facturación. Si le falta una de las dos sigue apareciendo acá. Con el toggle de arriba podés ver también las ya facturadas. Para facturar desde esta pantalla hacen falta además los PDFs del expediente, que dependen del tipo de OT: Reparación pide Cotización, PO cliente y Guía de despacho; Bien pide PO cliente y Guía de despacho. Los chips que no aplican al tipo se muestran apagados y no bloquean."
      />

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Pendientes de facturar" value={counts.pendientes} styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card
            size="small"
            hoverable
            onClick={() => router.push("/facturacion/facturas")}
            style={{ cursor: "pointer" }}
          >
            <Tooltip title="Con fecha de facturación cargada Y el PDF de la factura subido. Click para abrir la consulta de Facturas.">
              <Statistic title="Facturadas (ver Facturas →)" value={counts.facturadas} styles={{ content: { color: "#52c41a" } }} />
            </Tooltip>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Tooltip title="De las pendientes: ya tienen todos los PDFs que su tipo de OT exige, se pueden facturar ahora.">
              <Statistic title="Listas para facturar" value={listas} styles={{ content: { color: listas > 0 ? "#52c41a" : "#bfbfbf" } }} />
            </Tooltip>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Tooltip title="De las pendientes: les falta al menos uno de los PDFs que su tipo de OT exige.">
              <Statistic title="Faltan PDFs" value={faltanPdfs} styles={{ content: { color: faltanPdfs > 0 ? "#fa8c16" : "#bfbfbf" } }} />
            </Tooltip>
          </Card>
        </Col>
      </Row>

      {dataVista.length === 0 && !loading ? (
        <Empty description="No hay OTs despachadas pendientes de facturar en este período." />
      ) : (
        <Card>
          <TablaFacturacionOT
            columns={columns}
            data={dataVista}
            loading={loading}
            page={page}
            pageSize={pageSize}
            onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
          />
        </Card>
      )}

      <Modal
        title={otSel ? `Factura y adjuntos — ${otSel.ot ?? `OT #${otSel.id}`}` : ""}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleGuardar}
        okText={otSel?.facturada ? "Actualizar factura" : "Registrar factura"}
        cancelText="Cerrar"
        confirmLoading={saving}
        okButtonProps={{ disabled: !!(otSel && !otSel.pdfs_ok && !otSel.facturada) }}
        width={modalWidth(screens, 860)}
        destroyOnHidden
      >
        {otSel && (
          <div>
            <div style={{ marginBottom: 12, padding: 10, background: brand.bgPage, borderRadius: 4 }}>
              <div style={{ fontSize: 12 }}>
                <b>Cliente:</b> {otSel.cliente ?? "—"}<br />
                <b>Guía remisión:</b> {otSel.guia_entrega_salida ?? "—"} (entregada el {otSel.fecha_entrega ? formatDateOnly(otSel.fecha_entrega) : "—"})<br />
              </div>
            </div>

            {!otSel.pdfs_ok && (
              <Alert
                showIcon
                // Si la OT ya está facturada, los PDFs faltantes son un aviso
                // de expediente incompleto, no un bloqueo: el botón sigue
                // habilitado para cargarle el N° de factura.
                type={otSel.facturada ? "info" : "warning"}
                style={{ marginBottom: 12 }}
                title={otSel.facturada
                  ? "Esta OT ya está facturada, pero su expediente está incompleto"
                  : "Faltan PDFs requeridos para poder facturar"}
                description={otSel.facturada
                  ? `Faltantes: ${otSel.faltantes.join(", ")}. Podés subirlos desde "Subir archivo a esta OT" más abajo. No bloquean guardar el N° de factura.`
                  : `Faltantes: ${otSel.faltantes.join(", ")}. Subilos desde la sección "Subir archivo a esta OT" más abajo. Una vez completos, el botón "Registrar factura" se habilita.`}
              />
            )}

            <Form form={form} layout="vertical">
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="nro_factura"
                    label="N° Factura"
                    rules={[{ required: true, message: "Número requerido" }]}
                  >
                    <Input placeholder="Ej: F001-12345" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="fecha_facturacion"
                    label="Fecha factura"
                    rules={[{ required: true, message: "Fecha requerida" }]}
                  >
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="monto" label="Monto facturado">
                <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} />
              </Form.Item>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>

            <Divider titlePlacement="start">
              <Space size={4}>
                <UploadOutlined />
                <span>Subir archivo a esta OT</span>
              </Space>
            </Divider>

            <div style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
                Subí los PDFs que falten — cada botón guarda el archivo en su etapa correspondiente.
                El verde indica que ya hay al menos un archivo subido en esa etapa. Según el tipo de
                OT, no todos son requisito para facturar (ver los chips de la fila).
              </Text>
              <Space wrap>
                {PDFS_EXPEDIENTE.map((p) => {
                  const yaTiene = (otSel.pdfs[p.etapa] ?? []).length > 0;
                  return (
                    <Upload
                      key={p.etapa}
                      accept="application/pdf,image/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        void handleUpload(file, p.etapa);
                        return false;
                      }}
                      disabled={uploadingEtapa !== null}
                    >
                      <Button
                        icon={yaTiene ? <CheckCircleOutlined /> : <UploadOutlined />}
                        loading={uploadingEtapa === p.etapa}
                        style={yaTiene
                          ? { background: "#f6ffed", borderColor: "#52c41a", color: "#389e0d" }
                          : undefined}
                      >
                        {p.label}
                      </Button>
                    </Upload>
                  );
                })}
                <Upload
                  accept="application/pdf,image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleUpload(file, "facturacion");
                    return false;
                  }}
                  disabled={uploadingEtapa !== null}
                >
                  <Button
                    icon={<UploadOutlined />}
                    type="primary"
                    loading={uploadingEtapa === "facturacion"}
                    style={{ background: "#1d6f42", borderColor: "#1d6f42" }}
                  >
                    Factura emitida (PDF)
                  </Button>
                </Upload>
              </Space>
            </div>

            <Divider titlePlacement="start">
              <Space size={4}>
                <FolderOpenOutlined />
                <span>Adjuntos de la OT por categoría</span>
              </Space>
            </Divider>

            {loadingAdj ? (
              <div style={{ textAlign: "center", padding: 16 }}><Spin /></div>
            ) : adjuntos.length === 0 ? (
              <Empty description="Esta OT todavía no tiene adjuntos." />
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {ETAPAS_ADJ.map((et) => {
                  const items = adjuntos.filter((a) => a.etapa_codigo === et.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={et.key} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 10px", background: brand.bgPage, borderRadius: 4,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: et.color }}>{et.icon}</span>
                        <Text strong style={{ fontSize: 13 }}>{et.label}</Text>
                        <Tag color="blue" style={{ marginLeft: "auto" }}>{items.length}</Tag>
                      </div>
                      <List<AdjuntoCompleto>
                        size="small"
                        bordered
                        dataSource={items}
                        renderItem={(a) => (
                          <List.Item
                            actions={[
                              <Button
                                key="dl"
                                size="small"
                                type="link"
                                icon={<DownloadOutlined />}
                                onClick={() =>
                                  openR2File({
                                    key: a.r2_key,
                                    resource: "ot-adjunto",
                                    resourceId: a.id,
                                  }).catch((e) => msg.error(e instanceof Error ? e.message : "Error al descargar"))
                                }
                              >
                                Descargar
                              </Button>,
                            ]}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.nombre_archivo}
                              </div>
                              <div style={{ fontSize: 11, color: brand.textSecondary }}>
                                {formatFileSize(a.tamano)} · {formatDateOnly(a.fecha_subida)}
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function TablaFacturacionOT({
  columns, data, loading, page, pageSize, onPageChange,
}: {
  columns: ColumnsType<OTLista>;
  data: OTLista[];
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number, s: number) => void;
}) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<OTLista>(
    columns, "facturacion-ot-v1",
  );
  return (
    <TableDragWrapper>
      <Table<OTLista>
        rowKey="id"
        size="small"
        columns={columnas}
        components={components}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: onPageChange,
          label: "OT(s)",
        })}
        scroll={{ x: 1500 }}
        sticky={STICKY_HEADER}
      />
    </TableDragWrapper>
  );
}

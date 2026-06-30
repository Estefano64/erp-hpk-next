"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tabs,
  Button,
  Upload,
  message,
  Typography,
  Image,
  Tooltip,
  Popconfirm,
  Spin,
  Empty,
  Card,
  DatePicker,
  Input,
  Space,
} from "antd";
import {
  UploadOutlined,
  InboxOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileUnknownOutlined,
  CameraOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CarOutlined,
  FolderOpenOutlined,
  SolutionOutlined,
  SaveOutlined,
  LockOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { uploadToR2, getDownloadUrl, openR2File } from "@/lib/r2-client";

const { Text } = Typography;
const { Dragger } = Upload;

// Datos de flujo comercial/logístico de la OT que se editan desde los sub-tabs
// de Adjuntos (Cotización / PO Cliente / Despacho). Se persisten a nivel
// OrdenTrabajo vía PUT parcial, igual que el resto del detalle.
export interface OTAdjuntosMeta {
  version: number;
  ot_status_codigo: string | null;
  fecha_cotizacion: string | null;
  fecha_aprobacion: string | null;
  fecha_generacion_po: string | null;
  po_cliente_ok: boolean | null;
  fecha_despacho: string | null;
  empresa_recibe: string | null;
  fecha_facturacion: string | null;
}

const ETAPAS_CON_META = new Set(["cotizacion", "po_cliente", "despacho", "facturacion"]);

function toDayjs(s: string | null | undefined): Dayjs | null {
  return s ? dayjs(String(s).slice(0, 10)) : null;
}

interface Adjunto {
  id: number;
  orden_trabajo_id: number;
  etapa_codigo: string;
  nombre_archivo: string;
  r2_key: string;
  tipo_mime: string;
  tamano: number;
  fecha_subida: string;
}

interface Props {
  otId: number;
  // Datos del flujo comercial para los sub-tabs Cotización/PO Cliente/Despacho.
  meta?: OTAdjuntosMeta | null;
  // Refresca la OT en el padre tras guardar una fecha/check desde un sub-tab.
  onMetaSaved?: () => void;
}

const ETAPAS = [
  {
    key: "recepcion",
    label: "Recepción y GR",
    icon: <CameraOutlined />,
    description: "Fotos y documentos de la llegada del cilindro al taller — incluye guía de remisión del cliente",
  },
  {
    key: "evaluacion",
    label: "Informe de Evaluación",
    icon: <FileTextOutlined />,
    description: "Fotos de evaluación, informes técnicos y hoja de evaluación del componente",
  },
  {
    key: "cotizacion",
    label: "Cotización",
    icon: <FileTextOutlined />,
    description: "Cotización al cliente, propuestas comerciales y documentos relacionados",
  },
  {
    key: "po_cliente",
    label: "PO Cliente",
    icon: <SolutionOutlined />,
    description: "Orden de compra (PO) emitida por el cliente — al subir el archivo la OT pasa a estado \"Con PO\"",
  },
  {
    key: "termino",
    label: "Informe Término de Reparación",
    icon: <CheckCircleOutlined />,
    description: "Fotos y documentos del término de reparación del componente",
  },
  {
    key: "despacho",
    label: "Guía de Remisión Despacho",
    icon: <CarOutlined />,
    description: "Fotos y documentos del despacho del componente reparado — incluye guía de remisión al cliente",
  },
  {
    key: "facturacion",
    label: "Facturación",
    icon: <FileTextOutlined />,
    description: "Facturas emitidas al cliente y comprobantes de pago",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return <FileImageOutlined style={{ fontSize: 32, color: brand.cyan }} />;
  if (mime === "application/pdf") return <FilePdfOutlined style={{ fontSize: 32, color: brand.error }} />;
  if (mime.includes("word") || mime.includes("msword")) return <FileWordOutlined style={{ fontSize: 32, color: "#2B579A" }} />;
  if (mime.includes("excel") || mime.includes("spreadsheet")) return <FileExcelOutlined style={{ fontSize: 32, color: "#217346" }} />;
  return <FileUnknownOutlined style={{ fontSize: 32, color: brand.textSecondary }} />;
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

/* ── Datos del flujo comercial editables por etapa (fecha + check + empresa) ── */
function EtapaMetaForm({
  otId,
  etapaKey,
  meta,
  onSaved,
}: {
  otId: number;
  etapaKey: string;
  meta: OTAdjuntosMeta;
  onSaved?: () => void;
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [saving, setSaving] = useState(false);
  const cerrada = meta.ot_status_codigo === "Cerrada";

  const [fechaCotizacion, setFechaCotizacion] = useState<Dayjs | null>(toDayjs(meta.fecha_cotizacion));
  const [fechaGeneracionPo, setFechaGeneracionPo] = useState<Dayjs | null>(toDayjs(meta.fecha_generacion_po));
  const [fechaAprobacion, setFechaAprobacion] = useState<Dayjs | null>(toDayjs(meta.fecha_aprobacion));
  const [fechaDespacho, setFechaDespacho] = useState<Dayjs | null>(toDayjs(meta.fecha_despacho));
  const [empresaRecibe, setEmpresaRecibe] = useState<string>(meta.empresa_recibe ?? "");
  const [fechaFacturacion, setFechaFacturacion] = useState<Dayjs | null>(toDayjs(meta.fecha_facturacion));

  // Re-sincroniza los controles cuando la OT cambia (tras guardar y refetch).
  useEffect(() => {
    setFechaCotizacion(toDayjs(meta.fecha_cotizacion));
    setFechaGeneracionPo(toDayjs(meta.fecha_generacion_po));
    setFechaAprobacion(toDayjs(meta.fecha_aprobacion));
    setFechaDespacho(toDayjs(meta.fecha_despacho));
    setEmpresaRecibe(meta.empresa_recibe ?? "");
    setFechaFacturacion(toDayjs(meta.fecha_facturacion));
  }, [meta.fecha_cotizacion, meta.fecha_generacion_po, meta.fecha_aprobacion, meta.fecha_despacho, meta.empresa_recibe, meta.fecha_facturacion]);

  const fmt = (d: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

  async function guardar(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, version: meta.version }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al guardar");
      }
      messageApi.success("Datos guardados");
      onSaved?.();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, color: brand.textSecondary, marginBottom: 4 };
  const guardarBtn = (patch: Record<string, unknown>) => (
    <Button
      type="primary"
      size="small"
      icon={<SaveOutlined />}
      loading={saving}
      disabled={cerrada}
      style={{ background: brand.cyan, borderColor: brand.cyan }}
      onClick={() => guardar(patch)}
    >
      Guardar
    </Button>
  );

  let contenido: React.ReactNode = null;
  if (etapaKey === "cotizacion") {
    contenido = (
      <Space wrap align="end" size={16}>
        <div>
          <div style={labelStyle}>Fecha de envío de cotización</div>
          <DatePicker format="DD/MM/YYYY" value={fechaCotizacion} onChange={setFechaCotizacion} disabled={cerrada} style={{ width: 180 }} />
        </div>
        {guardarBtn({ fecha_cotizacion: fmt(fechaCotizacion) })}
      </Space>
    );
  } else if (etapaKey === "po_cliente") {
    contenido = (
      <Space wrap align="end" size={16}>
        <div>
          <div style={labelStyle}>Fecha de generación de PO</div>
          <DatePicker format="DD/MM/YYYY" value={fechaGeneracionPo} onChange={setFechaGeneracionPo} disabled={cerrada} style={{ width: 180 }} />
        </div>
        <div>
          <div style={labelStyle}>Fecha de aprobación de cotización</div>
          <DatePicker format="DD/MM/YYYY" value={fechaAprobacion} onChange={setFechaAprobacion} disabled={cerrada} style={{ width: 180 }} />
        </div>
        {guardarBtn({ fecha_generacion_po: fmt(fechaGeneracionPo), fecha_aprobacion: fmt(fechaAprobacion) })}
      </Space>
    );
  } else if (etapaKey === "despacho") {
    contenido = (
      <Space wrap align="end" size={16}>
        <div>
          <div style={labelStyle}>Fecha de despacho</div>
          <DatePicker format="DD/MM/YYYY" value={fechaDespacho} onChange={setFechaDespacho} disabled={cerrada} style={{ width: 180 }} />
        </div>
        <div>
          <div style={labelStyle}>Empresa que recibe</div>
          <Input value={empresaRecibe} onChange={(e) => setEmpresaRecibe(e.target.value)} disabled={cerrada} placeholder="Ej. Minera ..." style={{ width: 240 }} maxLength={200} />
        </div>
        {guardarBtn({ fecha_despacho: fmt(fechaDespacho), empresa_recibe: empresaRecibe.trim() || null })}
      </Space>
    );
  } else if (etapaKey === "facturacion") {
    contenido = (
      <Space wrap align="end" size={16}>
        <div>
          <div style={labelStyle}>Fecha de facturación</div>
          <DatePicker format="DD/MM/YYYY" value={fechaFacturacion} onChange={setFechaFacturacion} disabled={cerrada} style={{ width: 180 }} />
        </div>
        {guardarBtn({ fecha_facturacion: fmt(fechaFacturacion) })}
      </Space>
    );
  }

  return (
    <Card size="small" style={{ marginBottom: 16, background: "#F0F7FF", borderColor: brand.cyan }} styles={{ body: { padding: "12px 16px" } }}>
      {contextHolder}
      {contenido}
      {cerrada && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <LockOutlined style={{ marginRight: 4 }} />
            OT cerrada — reabrila (cambiar Estado OT) para editar estos datos.
          </Text>
        </div>
      )}
    </Card>
  );
}

/* ── Sub-panel por etapa ── */
function EtapaPanel({
  otId,
  etapa,
  meta,
  onMetaSaved,
}: {
  otId: number;
  etapa: typeof ETAPAS[number];
  meta?: OTAdjuntosMeta | null;
  onMetaSaved?: () => void;
}) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAdjuntos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/adjuntos?etapa=${etapa.key}`);
      if (res.ok) {
        const json = await res.json();
        setAdjuntos(json.data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [otId, etapa.key]);

  useEffect(() => {
    fetchAdjuntos();
  }, [fetchAdjuntos]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/ordenes-trabajo/${otId}/adjuntos/upload-url`,
        extra: { etapa: etapa.key },
      });
      const res = await fetch(`/api/ordenes-trabajo/${otId}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, etapa: etapa.key }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al registrar");
      }

      messageApi.success(`${file.name} subido correctamente`);
      fetchAdjuntos();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "Error al subir archivo");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(adjuntoId: number) {
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/adjuntos?adjuntoId=${adjuntoId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      messageApi.success("Archivo eliminado");
      fetchAdjuntos();
    } catch {
      messageApi.error("Error al eliminar");
    }
  }

  function handleButtonUpload() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
      }
    }
    e.target.value = "";
  }

  return (
    <div>
      {contextHolder}

      {/* Header de etapa */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18, color: brand.cyan }}>{etapa.icon}</span>
            <Text strong style={{ fontSize: 16 }}>{etapa.label}</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>{etapa.description}</Text>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            style={{ display: "none" }}
            onChange={handleFileInputChange}
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleButtonUpload}
            loading={uploading}
            style={{ background: brand.cyan, borderColor: brand.cyan }}
          >
            Subir Archivo
          </Button>
        </div>
      </div>

      {/* Datos del flujo comercial (fecha + check + empresa) de esta etapa */}
      {ETAPAS_CON_META.has(etapa.key) && meta && (
        <EtapaMetaForm otId={otId} etapaKey={etapa.key} meta={meta} onSaved={onMetaSaved} />
      )}

      {/* Zona de drag & drop */}
      <Dragger
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          uploadFile(file);
          return false; // prevenir upload automático de antd
        }}
        style={{
          borderColor: brand.cyan,
          borderStyle: "dashed",
          borderWidth: 2,
          background: `${brand.cyan}05`,
          marginBottom: 24,
          padding: "20px 0",
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: brand.textSecondary, fontSize: 36 }} />
        </p>
        <p style={{ color: brand.textSecondary, margin: 0 }}>
          Arrastra archivos aquí o haz clic
        </p>
      </Dragger>

      {/* Lista de archivos */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : adjuntos.length === 0 ? (
        <Empty
          image={<FolderOpenOutlined style={{ fontSize: 48, color: brand.textSecondary }} />}
          styles={{ image: { height: 60 } }}
          description={
            <Text type="secondary">Sin archivos de {etapa.label.toLowerCase()}</Text>
          }
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {adjuntos.map((adj) => (
            <div
              key={adj.id}
              style={{
                border: `1px solid ${brand.border}`,
                borderRadius: 8,
                overflow: "hidden",
                background: brand.white,
                transition: "box-shadow 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
            >
              {/* Preview area */}
              <div
                style={{
                  height: 140,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: brand.bgPage,
                  position: "relative",
                }}
              >
                {isImage(adj.tipo_mime) ? (
                  <R2AntdImage adjuntoId={adj.id} r2Key={adj.r2_key} alt={adj.nombre_archivo} />
                ) : (
                  getFileIcon(adj.tipo_mime)
                )}
              </div>

              {/* Info area */}
              <div style={{ padding: "8px 10px" }}>
                <Tooltip title={adj.nombre_archivo}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {adj.nombre_archivo}
                  </Text>
                </Tooltip>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {formatFileSize(adj.tamano)}
                  </Text>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Tooltip title="Descargar">
                      <Button
                        type="text"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={async () => {
                          try {
                            await openR2File({ key: adj.r2_key, resource: "ot-adjunto", resourceId: adj.id });
                          } catch (e) {
                            messageApi.error(e instanceof Error ? e.message : "Error abriendo archivo");
                          }
                        }}
                        style={{ color: brand.cyan }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Eliminar archivo"
                      description="Esta acción no se puede deshacer"
                      onConfirm={() => handleDelete(adj.id)}
                      okText="Eliminar"
                      cancelText="Cancelar"
                      okButtonProps={{ danger: true }}
                    >
                      <Tooltip title="Eliminar">
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          danger
                        />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Componente principal con tabs de etapas ── */
export default function OTAdjuntosTab({ otId, meta, onMetaSaved }: Props) {
  const tabItems = ETAPAS.map((etapa) => ({
    key: etapa.key,
    label: (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "normal", lineHeight: 1.2 }}>
        {etapa.icon}
        <span>{etapa.label}</span>
      </span>
    ),
    children: <EtapaPanel otId={otId} etapa={etapa} meta={meta} onMetaSaved={onMetaSaved} />,
  }));

  return (
    <div>
      <Tabs
        defaultActiveKey="recepcion"
        items={tabItems}
        tabBarGutter={0}
        tabBarStyle={{
          display: "flex",
          borderBottom: `2px solid ${brand.border}`,
          marginBottom: 20,
        }}
        className="adjuntos-etapas-tabs"
      />
      <style>{`
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-nav-list {
          width: 100%;
          display: flex !important;
        }
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-tab {
          flex: 1;
          justify-content: center;
          margin: 0 !important;
          padding: 10px 4px;
          font-weight: 500;
        }
        /* Permite que los nombres largos (Informe de Evaluación, Informe Término
           de Reparación, Guía de Remisión Despacho) se acomoden en dos líneas. */
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-tab .ant-tabs-tab-btn {
          white-space: normal;
          text-align: center;
          line-height: 1.2;
        }
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-tab-active {
          border-bottom: 2px solid ${brand.cyan} !important;
        }
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-tab-active .ant-tabs-tab-btn {
          color: ${brand.cyan} !important;
        }
        .adjuntos-etapas-tabs > .ant-tabs-nav .ant-tabs-ink-bar {
          background: ${brand.cyan} !important;
        }
      `}</style>
    </div>
  );
}

// Wrap antd Image que resuelve la presigned URL en mount. Mantiene el preview
// nativo de antd (mask + lightbox).
function R2AntdImage({
  adjuntoId,
  r2Key,
  alt,
}: {
  adjuntoId: number;
  r2Key: string;
  alt: string;
}) {
  const [state, setState] = useState<{ r2Key: string; url: string | null }>({ r2Key, url: null });
  const effective = state.r2Key === r2Key ? state : { r2Key, url: null };

  useEffect(() => {
    let cancelled = false;
    getDownloadUrl({ key: r2Key, resource: "ot-adjunto", resourceId: adjuntoId })
      .then((u) => {
        if (!cancelled) setState({ r2Key, url: u });
      })
      .catch(() => {
        if (!cancelled) setState({ r2Key, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [adjuntoId, r2Key]);

  if (!effective.url) {
    return <Spin size="small" />;
  }
  return (
    <Image
      src={effective.url}
      alt={alt}
      style={{ maxHeight: 140, maxWidth: "100%", objectFit: "cover" }}
      preview={{ mask: <EyeOutlined style={{ fontSize: 20 }} /> }}
    />
  );
}

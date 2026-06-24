"use client";

// Adjuntos de OT Interna — versión simplificada (2026-06): un solo bucket
// sin pestañas por etapa. Pedido del user: que sea "solo subir adjuntos", no
// la grilla de 8 etapas que usa OT externa.
//
// Implementación:
//   - GET sin ?etapa= → trae TODOS los adjuntos (preserva visibilidad de los
//     ya subidos con etapa específica antes del cambio).
//   - POST con etapa fija "general" → todo lo nuevo cae en el mismo bucket.
//
// El endpoint sigue aceptando todas las etapas válidas, así no rompimos los
// adjuntos legacy ni hay migración de datos.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Button,
  Upload,
  message,
  Typography,
  Image,
  Tooltip,
  Popconfirm,
  Spin,
  Empty,
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
  FolderOpenOutlined,
} from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { uploadToR2, getDownloadUrl, openR2File } from "@/lib/r2-client";

const { Text } = Typography;
const { Dragger } = Upload;

interface Adjunto {
  id: number;
  orden_trabajo_interna_id: number;
  etapa_codigo: string;
  nombre_archivo: string;
  r2_key: string;
  tipo_mime: string;
  tamano: number;
  fecha_subida: string;
}

interface Props {
  otId: number;
}

// Etapa fija para todo lo nuevo. El endpoint soporta otras (legacy) pero el
// frontend ya no expone esa elección.
const ETAPA = "general";

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

export default function OTInternaAdjuntosTab({ otId }: Props) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAdjuntos = useCallback(async () => {
    setLoading(true);
    try {
      // Sin ?etapa= → el endpoint devuelve TODOS los adjuntos de la OT.
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}/adjuntos`);
      if (res.ok) {
        const json = await res.json();
        setAdjuntos(json.data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [otId]);

  useEffect(() => {
    fetchAdjuntos();
  }, [fetchAdjuntos]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/ordenes-trabajo-internas/${otId}/adjuntos/upload-url`,
        extra: { etapa: ETAPA },
      });
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, etapa: ETAPA }),
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
      const res = await fetch(`/api/ordenes-trabajo-internas/${otId}/adjuntos?adjuntoId=${adjuntoId}`, {
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

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>Adjuntos</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Documentos, fotos e informes de la OT interna
            </Text>
          </div>
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

      {/* Drag & drop */}
      <Dragger
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          uploadFile(file);
          return false;
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

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : adjuntos.length === 0 ? (
        <Empty
          image={<FolderOpenOutlined style={{ fontSize: 48, color: brand.textSecondary }} />}
          styles={{ image: { height: 60 } }}
          description={<Text type="secondary">Sin archivos</Text>}
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
                            await openR2File({ key: adj.r2_key, resource: "ot-interna-adjunto", resourceId: adj.id });
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

/* ── Imagen R2 con presigned URL ── */
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
    getDownloadUrl({ key: r2Key, resource: "ot-interna-adjunto", resourceId: adjuntoId })
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

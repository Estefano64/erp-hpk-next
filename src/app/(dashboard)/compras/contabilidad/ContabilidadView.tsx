"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Empty, Row, Col, Statistic, Segmented,
  Upload, Popconfirm, App,
} from "antd";
import {
  ReloadOutlined, SearchOutlined, FileTextOutlined,
  FileDoneOutlined, AuditOutlined, UploadOutlined, DeleteOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns,
  filtroPorColumna, useColumnasRedimensionables, STICKY_HEADER,
} from "@/lib/tables";
import { R2FileLink } from "@/components/R2FileLink";
import { uploadToR2 } from "@/lib/r2-client";

const { Title, Text } = Typography;

interface CompraRow {
  id: number;
  numero_po: string;
  nombre: string | null;
  proveedor_nombre: string | null;
  ot_id: number | null;
  ot_numero: number | string | null;
  ot_descripcion: string | null;
  estado: string;
  total: number | string;
  moneda: string;
  fecha_solicitud: string | null;
  fecha_entrega_real: string | null;
  nro_factura: string | null;
  nro_guia: string | null;
  guia_key: string | null;
  guia_nombre: string | null;
  factura_key: string | null;
  factura_nombre: string | null;
  pago_key: string | null;
  pago_nombre: string | null;
  tipo_pago: string | null;
  // Adjuntos múltiples — el patrón legacy (guia_key/factura_key/pago_key)
  // se mantiene por compat, pero los nuevos archivos se cargan acá.
  adjuntos: { id: number; tipo: string; r2_key: string; nombre_archivo: string; tipo_mime: string | null; tamano: number | null; fecha_subida: string }[];
}

export type FiltroDocs = "todos" | "con_factura" | "sin_factura" | "con_guia" | "sin_guia";

// Vista compartida. Cada ruta (contabilidad / guías / facturas) la renderiza
// con un filtro inicial distinto — el usuario puede cambiarlo igual.
const TITULOS: Record<string, string> = {
  con_guia: "Despacho — Guías de remisión",
  con_factura: "Facturación — Facturas de OCs",
  todos: "Guía y Factura de OC",
};

export default function ContabilidadView({
  initialFiltro = "todos",
}: {
  initialFiltro?: FiltroDocs;
}) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<CompraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroDocs, setFiltroDocs] = useState<FiltroDocs>(initialFiltro);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("contabilidad-compras-cols-v1");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras?limit=10000");
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Helpers para chequear si una OC tiene al menos un adjunto del tipo X.
  // Considera tanto el campo legacy como compra_adjunto (multi).
  const tieneTipo = (r: CompraRow, tipo: "guia" | "factura" | "pago") => {
    if (tipo === "guia" && r.guia_key) return true;
    if (tipo === "factura" && r.factura_key) return true;
    if (tipo === "pago" && r.pago_key) return true;
    return (r.adjuntos ?? []).some((a) => a.tipo === tipo);
  };

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtroDocs === "con_factura" && !tieneTipo(r, "factura")) return false;
      if (filtroDocs === "sin_factura" && tieneTipo(r, "factura")) return false;
      if (filtroDocs === "con_guia" && !tieneTipo(r, "guia")) return false;
      if (filtroDocs === "sin_guia" && tieneTipo(r, "guia")) return false;
      if (!q) return true;
      return (
        r.numero_po.toLowerCase().includes(q) ||
        (r.proveedor_nombre ?? "").toLowerCase().includes(q) ||
        (r.nro_factura ?? "").toLowerCase().includes(q) ||
        (r.nro_guia ?? "").toLowerCase().includes(q) ||
        (r.nombre ?? "").toLowerCase().includes(q) ||
        String(r.ot_numero ?? "").toLowerCase().includes(q) ||
        (r.ot_descripcion ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filtroDocs]);

  const kpis = useMemo(() => {
    const conFactura = rows.filter((r) => tieneTipo(r, "factura")).length;
    const conGuia = rows.filter((r) => tieneTipo(r, "guia")).length;
    const sinFactura = rows.filter((r) => !tieneTipo(r, "factura")).length;
    return { total: rows.length, conFactura, conGuia, sinFactura };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Subir guía/factura/pago. Cada upload registra una FILA NUEVA en
  // compra_adjunto — una misma OC puede tener N guías, N facturas y N pagos.
  // El endpoint legacy /api/compras/[id]/guia ya no se usa para subir.
  type TipoArchivo = "guia" | "factura" | "pago";
  const ETIQUETA_TIPO: Record<TipoArchivo, string> = {
    guia: "Guía",
    factura: "Factura",
    pago: "Comprobante de pago",
  };
  const subirArchivo = async (compraId: number, tipo: TipoArchivo, file: File) => {
    const slotId = `${compraId}-${tipo}`;
    setUploadingId(slotId);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/compras/${compraId}/guia/upload-url?tipo=${tipo}`,
      });
      const res = await fetch(`/api/compras/${compraId}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ...meta }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar archivo");
      message.success(`${ETIQUETA_TIPO[tipo]} subida`);
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al subir archivo");
    } finally {
      setUploadingId(null);
    }
  };

  // Eliminar — distingue legacy (campos guia_key/factura_key/pago_key en
  // Compra) vs multi (filas de compra_adjunto). El callsite pasa adjuntoId
  // si viene de la lista nueva, o null si es el slot legacy de la fila.
  const eliminarLegacy = async (compraId: number, tipo: TipoArchivo) => {
    try {
      const res = await fetch(`/api/compras/${compraId}/guia?tipo=${tipo}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar archivo");
      message.success("Archivo eliminado");
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al eliminar archivo");
    }
  };
  const eliminarAdjunto = async (compraId: number, adjuntoId: number) => {
    try {
      const res = await fetch(`/api/compras/${compraId}/adjuntos/${adjuntoId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error al eliminar adjunto");
      message.success("Archivo eliminado");
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error al eliminar adjunto");
    }
  };

  const archivoCell = (
    r: CompraRow,
    label: string,
    tipo: TipoArchivo,
    resource: "compra-guia" | "compra-factura" | "compra-pago",
  ) => {
    const compraId = r.id;
    const slotId = `${compraId}-${tipo}`;
    const uploading = uploadingId === slotId;
    // Combinar legacy (si existe) + multi. El legacy se muestra como una
    // fila más, identificada con `adjId=null` para que delete vaya al
    // endpoint correcto.
    const legacyKey = tipo === "guia" ? r.guia_key : tipo === "factura" ? r.factura_key : r.pago_key;
    const legacyNombre = tipo === "guia" ? r.guia_nombre : tipo === "factura" ? r.factura_nombre : r.pago_nombre;
    const multi = (r.adjuntos ?? []).filter((a) => a.tipo === tipo);
    const filas: Array<{ adjId: number | null; r2Key: string; nombre: string | null }> = [];
    if (legacyKey) filas.push({ adjId: null, r2Key: legacyKey, nombre: legacyNombre });
    for (const a of multi) filas.push({ adjId: a.id, r2Key: a.r2_key, nombre: a.nombre_archivo });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filas.length === 0 ? (
          <Tag color="default" style={{ margin: 0 }}>Sin {label}</Tag>
        ) : (
          filas.map((f) => (
            <Space key={f.adjId ?? `legacy-${f.r2Key}`} size={4}>
              <R2FileLink resource={resource} resourceId={compraId} r2Key={f.r2Key} style={{ fontSize: 12 }}>
                <FileTextOutlined style={{ color: brand.cyan, marginRight: 4 }} />
                {f.nombre || `Ver ${label}`}
              </R2FileLink>
              <Popconfirm
                title={`¿Eliminar este ${label}?`}
                onConfirm={() => (f.adjId == null ? eliminarLegacy(compraId, tipo) : eliminarAdjunto(compraId, f.adjId))}
                okType="danger"
                okText="Eliminar"
                cancelText="Cancelar"
              >
                <Button size="small" type="text" danger icon={<DeleteOutlined />} title={`Eliminar ${label}`} />
              </Popconfirm>
            </Space>
          ))
        )}
        <Upload
          showUploadList={false}
          accept=".pdf,image/*"
          beforeUpload={(file) => {
            subirArchivo(compraId, tipo, file as File);
            return false;
          }}
          disabled={uploading}
        >
          <Button size="small" icon={<UploadOutlined />} loading={uploading}>
            {filas.length > 0 ? "Subir otra" : "Subir"}
          </Button>
        </Upload>
      </div>
    );
  };

  const columns: ColumnsType<CompraRow> = [
    numeracionColumn<CompraRow>({ current: page, pageSize }),
    {
      key: "numero_po", title: "Nro OC", dataIndex: "numero_po", width: 130, align: "left",
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      ...filtroPorColumna(filtradas, "numero_po"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "ot", title: "OT", width: 230, align: "left",
      sorter: (a, b) => String(a.ot_numero ?? "").localeCompare(String(b.ot_numero ?? "")),
      render: (_v, r) => {
        if (!r.ot_numero) return <Text type="secondary" style={{ fontSize: 11 }}>Sin OT</Text>;
        return (
          <div style={{ lineHeight: 1.25 }}>
            <Tag color={brand.cyan} style={{ marginRight: 0, fontWeight: 600 }}>{r.ot_numero}</Tag>
            {r.ot_descripcion && (
              <div style={{ fontSize: 11, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
                {r.ot_descripcion}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "nombre", title: "Nombre OC", dataIndex: "nombre", width: 220, align: "left",
      sorter: (a, b) => (a.nombre || "").localeCompare(b.nombre || ""),
      render: (v: string | null) => v ? <span style={{ fontSize: 12 }}>{v}</span> : <Text type="secondary">—</Text>,
    },
    {
      key: "proveedor_nombre", title: "Proveedor", dataIndex: "proveedor_nombre", width: 200, align: "left",
      sorter: (a, b) => (a.proveedor_nombre || "").localeCompare(b.proveedor_nombre || ""),
      ...filtroPorColumna(filtradas, "proveedor_nombre"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "estado", title: "Estado", dataIndex: "estado", width: 120, align: "center",
      ...filtroPorColumna(filtradas, "estado"),
      render: (v: string) => <Tag color={v === "Recibido" ? "green" : v === "Cancelado" ? "red" : "blue"}>{v}</Tag>,
    },
    {
      key: "total", title: "Total", dataIndex: "total", width: 130, align: "right",
      sorter: (a, b) => Number(a.total) - Number(b.total),
      render: (v: number | string, r) => <b style={{ color: brand.navy }}>{r.moneda} {Number(v).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</b>,
    },
    {
      key: "nro_guia", title: "Nro Guía", dataIndex: "nro_guia", width: 120, align: "left",
      ...filtroPorColumna(filtradas, "nro_guia"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "guia", title: "Archivos Guía", width: 280, align: "left",
      render: (_v, r) => archivoCell(r, "guía", "guia", "compra-guia"),
    },
    {
      key: "nro_factura", title: "Nro Factura", dataIndex: "nro_factura", width: 130, align: "left",
      ...filtroPorColumna(filtradas, "nro_factura"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "factura", title: "Archivos Factura", width: 280, align: "left",
      render: (_v, r) => archivoCell(r, "factura", "factura", "compra-factura"),
    },
    {
      key: "pago", title: "Comprobante Pago", width: 260, align: "left",
      render: (_v, r) => {
        // Solo aplica a OCs CONTADO o TRANSFERENCIA. Para CRÉDITO se muestra
        // marcador para que la columna no quede ambigua.
        const aplica = r.tipo_pago === "CONTADO" || r.tipo_pago === "TRANSFERENCIA";
        if (!aplica) {
          return (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.tipo_pago === "CREDITO" ? "N/A (crédito)" : "—"}
            </Text>
          );
        }
        return archivoCell(r, "comprobante de pago", "pago", "compra-pago");
      },
    },
    {
      key: "fecha_entrega_real", title: "F. Recepción", dataIndex: "fecha_entrega_real", width: 110, align: "center",
      sorter: (a, b) => (a.fecha_entrega_real || "").localeCompare(b.fecha_entrega_real || ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY") : <Text type="secondary">—</Text>,
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<CompraRow>(columns, "contabilidad-compras-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <AuditOutlined style={{ marginRight: 8 }} />
          {TITULOS[filtroDocs] ?? "Contabilidad — Guías y Facturas de OCs"}
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Revisá la OC con su OT asociada. Desde cada fila podés <b>descargar</b>, <b>subir</b> o <b>reemplazar</b> la guía de remisión y la factura.
        Guía y factura son independientes — podés subir cualquiera primero.
      </Text>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Total OCs" value={kpis.total} styles={{ content: { color: brand.navy } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Con factura" value={kpis.conFactura} prefix={<FileDoneOutlined style={{ color: "#52c41a" }} />} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Con guía" value={kpis.conGuia} prefix={<FileTextOutlined style={{ color: brand.cyan }} />} styles={{ content: { color: brand.cyan } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sin factura" value={kpis.sinFactura} styles={{ content: { color: kpis.sinFactura > 0 ? "#cf1322" : "#bfbfbf" } }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Space wrap>
          <Input
            placeholder="Buscar OC, OT, proveedor, nro factura/guía…"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 340 }}
          />
          <Segmented
            value={filtroDocs}
            onChange={(v) => setFiltroDocs(v as FiltroDocs)}
            options={[
              { value: "todos", label: "Todos" },
              { value: "con_factura", label: "Con factura" },
              { value: "sin_factura", label: "Sin factura" },
              { value: "con_guia", label: "Con guía" },
              { value: "sin_guia", label: "Sin guía" },
            ]}
          />
          <ColumnasToggleButton<CompraRow>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["numero_po", "ot", "guia", "factura"]}
          />
        </Space>
      </Card>

      {filtradas.length === 0 && !loading ? (
        <Empty description="No hay OCs con esos filtros." />
      ) : (
        <Table<CompraRow>
          rowKey="id"
          size="small"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtradas}
          loading={loading}
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content" }}
          pagination={paginacionEstandar({
            current: page, pageSize, total: filtradas.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "órdenes de compra",
          })}
        />
      )}
    </div>
  );
}

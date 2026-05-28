"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Row,
  Col,
  Card,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  AuditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { brand } from "@/lib/theme";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { formatDateOnly } from "@/lib/dates";
import OTDetalleModal from "@/components/modules/ordenes-trabajo/OTDetalleModal";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title } = Typography;

interface OTRecord {
  id: number;
  ot: string;
  estrategia: boolean;
  tipo: string | null;
  tipo_codigo: string | null;
  tipo_ot: { codigo: string; nombre: string } | null;
  np: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  equipo_codigo: string | null;
  ns: string | null;
  plaqueteo: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  po_item: string | null;
  id_viajero: string | null;
  guia_remision: string | null;
  empresa_entrega: string | null;
  descripcion: string | null;
  fecha_recepcion: string | null;
  pcr: number | null;
  horas: number | null;
  porcentaje_pcr: number | null;
  contrato_dias: number | null;
  fecha_requerimiento_cliente: string | null;
  fecha_reprogramada: string | null;
  comentarios: string | null;
  ot_status_codigo: string | null;
  recursos_status_codigo: string | null;
  taller_status_codigo: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string; tipo?: { nombre: string } | null; flota?: { nombre: string } | null; fabricante?: { nombre: string } | null; posicion?: { nombre: string } | null } | null;
  fabricante: { nombre: string } | null;
  atencion_reparacion: { nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  ot_status: { nombre: string } | null;
  recursos_status: { nombre: string } | null;
  taller_status: { nombre: string } | null;
  tipo_reparacion: { nombre: string } | null;
  tipo_garantia: { nombre: string } | null;
  garantia: { nombre: string } | null;
  base_metalica: { nombre: string } | null;
  usuario_crea: string | null;
  fecha_creacion: string | null;
  // Estado de la hoja de evaluación técnica (último registro). null = sin
  // evaluación todavía.
  evaluaciones_tecnicas?: { estado: string }[];
}

interface CatalogOption {
  codigo: string;
  nombre: string;
}

// Campos extra que la API devuelve y van al Excel pero no se renderizan en la
// tabla. Son principalmente los campos históricos importados desde el Excel
// de logística (fecha_evaluacion, monto_cotizacion, etc.).
interface OTRecordExport extends OTRecord {
  fecha_evaluacion?: string | null;
  evaluador?: string | null;
  nro_informe_evaluacion?: string | null;
  fecha_cotizacion?: string | null;
  nro_cotizacion?: string | null;
  monto_cotizacion?: string | number | null;
  fecha_aprobacion?: string | null;
  fecha_entrega?: string | null;
  cumplimiento?: string | null;
  dias_proceso?: number | null;
  dias_en_taller?: number | null;
  nro_factura?: string | null;
  fecha_facturacion?: string | null;
}

const otStatusColor: Record<string, string> = {
  Abierta: "blue",
  Cerrada: "green",
  "No Ejecutada": "default",
};

const prioridadColor: Record<string, string> = {
  "1": "red",
  "2": "orange",
  "3": "cyan",
  E: "volcano",
};

// Color e etiqueta para el icono / tag del estado de la hoja de evaluación.
// Estados reales: BORRADOR, COMPLETADA, PENDIENTE_APROBACION, APROBADA, RECHAZADA.
const EVAL_META: Record<string, { color: string; label: string; tag: string }> = {
  BORRADOR: { color: "#FAAD14", label: "Borrador", tag: "warning" },          // amarillo
  COMPLETADA: { color: "#13C2C2", label: "Completada (lista)", tag: "cyan" }, // celeste
  PENDIENTE_APROBACION: { color: "#1677FF", label: "Pendiente aprobación", tag: "processing" },
  APROBADA: { color: "#52C41A", label: "Aprobada", tag: "success" },          // verde
  RECHAZADA: { color: "#cf1322", label: "Rechazada", tag: "error" },
};
function evalEstadoMeta(estado: string | null) {
  if (!estado) return { color: "#bfbfbf", label: "Sin evaluación", tag: "default" };
  return EVAL_META[estado] ?? { color: "#8c8c8c", label: estado, tag: "default" };
}

export default function OrdenesTrabajoPage() {
  const router = useRouter();
  const [data, setData] = useState<OTRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOtStatus, setFilterOtStatus] = useState("");
  const [filterRecursosStatus, setFilterRecursosStatus] = useState("");
  const [filterTallerStatus, setFilterTallerStatus] = useState("");
  // v2: nuevas columnas opcionales (tipo, NP, flota, posición, fabricante, garantía, base metálica, etc.)
  // ocultas por default — el usuario las habilita desde el botón "Columnas".
  const { ocultas, setOcultas } = useColumnasOcultas("ordenes-trabajo-list-cols-v2", [
    "tipo", "np", "cod_rep_flota", "cod_rep_posicion", "fabricante",
    "plaqueteo", "wo_cliente", "po_cliente", "po_item", "id_viajero", "guia_remision", "empresa_entrega",
    "usuario_crea", "fecha_creacion",
    "pcr", "horas", "contrato_dias",
    "fecha_requerimiento_cliente", "fecha_reprogramada",
    "atencion_reparacion", "tipo_reparacion", "garantia", "tipo_garantia", "base_metalica",
    "comentarios",
  ]);
  const { rango: rangoRecepcion, setRango: setRangoRecepcion } = useRangoFechas();

  const [otStatuses, setOtStatuses] = useState<CatalogOption[]>([]);
  const [recursosStatuses, setRecursosStatuses] = useState<CatalogOption[]>([]);
  const [tallerStatuses, setTallerStatuses] = useState<CatalogOption[]>([]);

  // Modal detalle
  const [modalOtId, setModalOtId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Carga TODAS las OTs de una sola vez (límite alto). Necesario para que los
  // filtros de columna (Cliente, Equipo, Fabricante, etc.) vean opciones de
  // todo el dataset y no solo de la página actual. La paginación de la tabla
  // pasa a ser client-side. Los filtros "globales" (search, ot_status,
  // recursos_status, taller_status) se siguen mandando al server para reducir
  // el payload cuando el usuario los aplica.
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "10000" });
    if (search) params.set("search", search);
    if (filterOtStatus) params.set("ot_status", filterOtStatus);
    if (filterRecursosStatus) params.set("recursos_status", filterRecursosStatus);
    if (filterTallerStatus) params.set("taller_status", filterTallerStatus);
    const res = await fetch(`/api/ordenes-trabajo?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [search, filterOtStatus, filterRecursosStatus, filterTallerStatus]);

  useEffect(() => {
    async function loadCatalogs() {
      const [otRes, recRes, talRes] = await Promise.all([
        fetch("/api/catalogos?tabla=otStatus"),
        fetch("/api/catalogos?tabla=recursosStatus"),
        fetch("/api/catalogos?tabla=tallerStatus"),
      ]);
      if (otRes.ok) setOtStatuses((await otRes.json()).data ?? []);
      if (recRes.ok) setRecursosStatuses((await recRes.json()).data ?? []);
      if (talRes.ok) setTallerStatuses((await talRes.json()).data ?? []);
    }
    loadCatalogs();
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setSearch("");
    setFilterOtStatus("");
    setFilterRecursosStatus("");
    setFilterTallerStatus("");
    setPage(1);
  }

  const columns: ColumnsType<OTRecord> = [
    numeracionColumn<OTRecord>({ current: page, pageSize }),
    {
      key: "ot",
      title: "OT",
      dataIndex: "ot",
      width: 150,
      fixed: "left",
      sorter: (a, b) => a.ot.localeCompare(b.ot),
      ...filtroPorColumna(data, "ot"),
      render: (v: string, r: OTRecord) => (
        <Tooltip title="Abrir página de la OT (URL compartible)">
          <Tag
            color={brand.navy}
            style={{ cursor: "pointer" }}
            onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}
          >
            {v}
          </Tag>
        </Tooltip>
      ),
    },
    {
      key: "cliente",
      title: "Cliente",
      dataIndex: "cliente",
      width: 150,
      ellipsis: true,
      sorter: (a, b) => (a.cliente?.nombre_comercial ?? a.cliente?.razon_social ?? "").localeCompare(b.cliente?.nombre_comercial ?? b.cliente?.razon_social ?? ""),
      render: (_: unknown, r: OTRecord) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "-",
    },
    {
      key: "codigo_reparacion",
      title: "Cod. Rep",
      width: 120,
      ellipsis: true,
      sorter: (a, b) => (a.codigo_reparacion?.codigo ?? "").localeCompare(b.codigo_reparacion?.codigo ?? ""),
      filters: [...new Set(data.map((r) => r.codigo_reparacion?.codigo).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.codigo_reparacion?.codigo === value,
      render: (_: unknown, r: OTRecord) => r.codigo_reparacion?.codigo ?? "-",
    },
    {
      key: "equipo_codigo",
      title: "Equipo",
      dataIndex: "equipo_codigo",
      width: 100,
      sorter: (a, b) => (a.equipo_codigo ?? "").localeCompare(b.equipo_codigo ?? ""),
      ...filtroPorColumna(data, "equipo_codigo"),
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? ""),
      ...filtroPorColumna(data, "descripcion"),
    },
    {
      key: "fecha_recepcion",
      title: "Recepción",
      dataIndex: "fecha_recepcion",
      width: 110,
      sorter: (a, b) => (a.fecha_recepcion ?? "").localeCompare(b.fecha_recepcion ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "porcentaje_pcr",
      title: "% PCR",
      dataIndex: "porcentaje_pcr",
      width: 80,
      align: "center",
      sorter: (a, b) => (a.porcentaje_pcr ?? 0) - (b.porcentaje_pcr ?? 0),
      render: (v: number | null) => v != null ? `${v}%` : "-",
    },
    {
      key: "prioridad_atencion",
      title: "Prioridad",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.prioridad_atencion?.codigo ?? "").localeCompare(b.prioridad_atencion?.codigo ?? ""),
      filters: [...new Set(data.map((r) => r.prioridad_atencion?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.prioridad_atencion?.nombre === value,
      render: (_: unknown, r: OTRecord) =>
        r.prioridad_atencion ? (
          <Tag color={prioridadColor[r.prioridad_atencion.codigo] ?? "default"}>
            {r.prioridad_atencion.nombre}
          </Tag>
        ) : "-",
    },
    {
      key: "ot_status",
      title: "OT Status",
      width: 120,
      sorter: (a, b) => (a.ot_status?.nombre ?? "").localeCompare(b.ot_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.ot_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.ot_status?.nombre === value,
      render: (_: unknown, r: OTRecord) =>
        r.ot_status ? (
          <Tag color={otStatusColor[r.ot_status_codigo ?? ""] ?? "default"}>
            {r.ot_status.nombre}
          </Tag>
        ) : "-",
    },
    {
      key: "evaluacion_estado",
      title: "Evaluación",
      width: 140,
      sorter: (a, b) => (a.evaluaciones_tecnicas?.[0]?.estado ?? "").localeCompare(b.evaluaciones_tecnicas?.[0]?.estado ?? ""),
      filters: [
        { text: "Sin evaluación", value: "__none__" },
        ...Object.keys(EVAL_META).map((k) => ({ text: EVAL_META[k].label, value: k })),
      ],
      onFilter: (value, r) => {
        const est = r.evaluaciones_tecnicas?.[0]?.estado ?? null;
        return value === "__none__" ? est === null : est === value;
      },
      render: (_: unknown, r: OTRecord) => {
        const est = r.evaluaciones_tecnicas?.[0]?.estado ?? null;
        const meta = evalEstadoMeta(est);
        return <Tag color={meta.tag}>{meta.label}</Tag>;
      },
    },
    {
      key: "recursos_status",
      title: "Recursos",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.recursos_status?.nombre ?? "").localeCompare(b.recursos_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.recursos_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.recursos_status?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.recursos_status?.nombre ?? "-",
    },
    {
      key: "taller_status",
      title: "Taller",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.taller_status?.nombre ?? "").localeCompare(b.taller_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.taller_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.taller_status?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.taller_status?.nombre ?? "-",
    },
    // ── Columnas opcionales (ocultas por default) ──
    {
      key: "tipo_ot", title: "Tipo OT", width: 100,
      filters: [...new Set(data.map((r) => r.tipo_ot?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.tipo_ot?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_ot?.nombre ?? r.tipo_codigo ?? "-",
    },
    {
      key: "tipo", title: "Tipo (Cod. Rep)", dataIndex: "tipo", width: 120,
      ...filtroPorColumna(data, "tipo"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "np", title: "N/P", dataIndex: "np", width: 130,
      ...filtroPorColumna(data, "np"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "cod_rep_flota", title: "Flota", dataIndex: "cod_rep_flota", width: 110,
      ...filtroPorColumna(data, "cod_rep_flota"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "cod_rep_posicion", title: "Posición", dataIndex: "cod_rep_posicion", width: 100,
      ...filtroPorColumna(data, "cod_rep_posicion"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "fabricante", title: "Fabricante", width: 140, ellipsis: true,
      filters: [...new Set(data.map((r) => r.fabricante?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fabricante?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.fabricante?.nombre ?? "-",
    },
    {
      key: "plaqueteo", title: "Plaqueteo", dataIndex: "plaqueteo", width: 110,
      ...filtroPorColumna(data, "plaqueteo"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "wo_cliente", title: "WO Cliente", dataIndex: "wo_cliente", width: 120,
      ...filtroPorColumna(data, "wo_cliente"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "po_cliente", title: "PO Cliente", dataIndex: "po_cliente", width: 120,
      ...filtroPorColumna(data, "po_cliente"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "po_item", title: "PO Item", dataIndex: "po_item", width: 100,
      ...filtroPorColumna(data, "po_item"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "id_viajero", title: "ID Viajero", dataIndex: "id_viajero", width: 120,
      ...filtroPorColumna(data, "id_viajero"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "guia_remision", title: "Guía Rem.", dataIndex: "guia_remision", width: 120,
      ...filtroPorColumna(data, "guia_remision"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "empresa_entrega", title: "Empresa entrega", dataIndex: "empresa_entrega", width: 160, ellipsis: true,
      ...filtroPorColumna(data, "empresa_entrega"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "pcr", title: "PCR", dataIndex: "pcr", width: 90, align: "right",
      sorter: (a, b) => (a.pcr ?? 0) - (b.pcr ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "horas", title: "Horas", dataIndex: "horas", width: 90, align: "right",
      sorter: (a, b) => (a.horas ?? 0) - (b.horas ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "contrato_dias", title: "Días contrato", dataIndex: "contrato_dias", width: 110, align: "right",
      sorter: (a, b) => (a.contrato_dias ?? 0) - (b.contrato_dias ?? 0),
      render: (v: number | null) => v != null ? `${v} d` : "-",
    },
    {
      key: "fecha_requerimiento_cliente", title: "F. Req. Cliente", dataIndex: "fecha_requerimiento_cliente", width: 120,
      sorter: (a, b) => (a.fecha_requerimiento_cliente ?? "").localeCompare(b.fecha_requerimiento_cliente ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "fecha_reprogramada", title: "F. Reprogramada", dataIndex: "fecha_reprogramada", width: 130,
      sorter: (a, b) => (a.fecha_reprogramada ?? "").localeCompare(b.fecha_reprogramada ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "fecha_creacion", title: "F. Creación", dataIndex: "fecha_creacion", width: 140,
      sorter: (a, b) => (a.fecha_creacion ?? "").localeCompare(b.fecha_creacion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "usuario_crea", title: "Creada por", dataIndex: "usuario_crea", width: 130,
      ...filtroPorColumna(data, "usuario_crea"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "atencion_reparacion", title: "Atención Rep.", width: 140, ellipsis: true,
      filters: [...new Set(data.map((r) => r.atencion_reparacion?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.atencion_reparacion?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.atencion_reparacion?.nombre ?? "-",
    },
    {
      key: "tipo_reparacion", title: "Tipo Rep.", width: 120,
      filters: [...new Set(data.map((r) => r.tipo_reparacion?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.tipo_reparacion?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_reparacion?.nombre ?? "-",
    },
    {
      key: "garantia", title: "Garantía", width: 90, align: "center",
      filters: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
      onFilter: (value, r) => r.garantia?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.garantia?.nombre ?? "-",
    },
    {
      key: "tipo_garantia", title: "Tipo Garantía", width: 120,
      filters: [...new Set(data.map((r) => r.tipo_garantia?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.tipo_garantia?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_garantia?.nombre ?? "-",
    },
    {
      key: "base_metalica", title: "Base metálica", width: 110, align: "center",
      filters: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
      onFilter: (value, r) => r.base_metalica?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.base_metalica?.nombre ?? "-",
    },
    {
      key: "comentarios", title: "Comentarios", dataIndex: "comentarios", width: 200, ellipsis: true,
      ...filtroPorColumna(data, "comentarios"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "acciones",
      title: "",
      width: 90,
      align: "center",
      fixed: "right",
      render: (_: unknown, record: OTRecord) => (
        <Space size={0}>
          <Tooltip title="Ver detalle">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => { setModalOtId(record.id); setModalOpen(true); }}
            />
          </Tooltip>
          {(() => {
            const estadoEval = record.evaluaciones_tecnicas?.[0]?.estado ?? null;
            const meta = evalEstadoMeta(estadoEval);
            return (
              <Tooltip title={`Hoja de evaluación — ${meta.label}`}>
                <Button
                  type="text"
                  icon={<AuditOutlined style={{ color: meta.color, fontSize: 16 }} />}
                  onClick={() => router.push(`/ordenes-trabajo/${record.id}/evaluacion`)}
                />
              </Tooltip>
            );
          })()}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<OTRecord>(columns, "ot-list-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Órdenes de Trabajo</Title>
        <Space>
          <ColumnasToggleButton<OTRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "ot", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<OTRecordExport>
            endpoint="/api/ordenes-trabajo"
            filename="OTs-Externas"
            sheetName="OTs Externas"
            columns={[
              { label: "OT", value: (r) => r.ot ?? "" },
              { label: "Cliente", value: (r) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "" },
              { label: "Cod. Rep", value: (r) => r.codigo_reparacion?.codigo ?? "" },
              { label: "Cod. Rep - Descripción", value: (r) => r.codigo_reparacion?.descripcion ?? "" },
              { label: "Equipo", value: (r) => r.equipo_codigo ?? "" },
              { label: "Fabricante", value: (r) => r.fabricante?.nombre ?? "" },
              { label: "Tipo (Cod. Rep)", value: (r) => r.tipo ?? "" },
              { label: "Tipo OT", value: (r) => r.tipo_ot?.nombre ?? r.tipo_codigo ?? "" },
              { label: "N/P", value: (r) => r.np ?? "" },
              { label: "NS", value: (r) => r.ns ?? "" },
              { label: "Flota", value: (r) => r.cod_rep_flota ?? "" },
              { label: "Posición", value: (r) => r.cod_rep_posicion ?? "" },
              { label: "Plaqueteo", value: (r) => r.plaqueteo ?? "" },
              { label: "Descripción", value: (r) => r.descripcion ?? "" },
              { label: "WO Cliente", value: (r) => r.wo_cliente ?? "" },
              { label: "PO Cliente", value: (r) => r.po_cliente ?? "" },
              { label: "PO Item", value: (r) => r.po_item ?? "" },
              { label: "ID Viajero", value: (r) => r.id_viajero ?? "" },
              { label: "Guía Remisión", value: (r) => r.guia_remision ?? "" },
              { label: "Fecha Recepción", value: (r) => formatDateOnly(r.fecha_recepcion) ?? "" },
              { label: "PCR", value: (r) => r.pcr ?? "" },
              { label: "Horas", value: (r) => r.horas ?? "" },
              { label: "% PCR", value: (r) => r.porcentaje_pcr ?? "" },
              { label: "Prioridad", value: (r) => r.prioridad_atencion?.nombre ?? "" },
              { label: "OT Status", value: (r) => r.ot_status?.nombre ?? r.ot_status_codigo ?? "" },
              { label: "Recursos Status", value: (r) => r.recursos_status?.nombre ?? r.recursos_status_codigo ?? "" },
              { label: "Taller Status", value: (r) => r.taller_status?.nombre ?? r.taller_status_codigo ?? "" },
              { label: "Garantía", value: (r) => r.garantia?.nombre ?? "" },
              { label: "Base Metálica", value: (r) => r.base_metalica?.nombre ?? "" },
              // Histórico (importado del Excel)
              { label: "Fecha Evaluación", value: (r) => formatDateOnly(r.fecha_evaluacion ?? null) ?? "" },
              { label: "Evaluador", value: (r) => r.evaluador ?? "" },
              { label: "Nro Informe Evaluación", value: (r) => r.nro_informe_evaluacion ?? "" },
              { label: "Fecha Cotización", value: (r) => formatDateOnly(r.fecha_cotizacion ?? null) ?? "" },
              { label: "Nro Cotización", value: (r) => r.nro_cotizacion ?? "" },
              { label: "Monto Cotización", value: (r) => r.monto_cotizacion ?? "" },
              { label: "Fecha Aprobación", value: (r) => formatDateOnly(r.fecha_aprobacion ?? null) ?? "" },
              { label: "Fecha Entrega", value: (r) => formatDateOnly(r.fecha_entrega ?? null) ?? "" },
              { label: "Cumplimiento", value: (r) => r.cumplimiento ?? "" },
              { label: "Días Proceso", value: (r) => r.dias_proceso ?? "" },
              { label: "Días en Taller", value: (r) => r.dias_en_taller ?? "" },
              { label: "Nro Factura", value: (r) => r.nro_factura ?? "" },
              { label: "Fecha Facturación", value: (r) => formatDateOnly(r.fecha_facturacion ?? null) ?? "" },
              { label: "Usuario Crea", value: (r) => r.usuario_crea ?? "" },
              { label: "Fecha Creación", value: (r) => formatDateOnly(r.fecha_creacion) ?? "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/ordenes-trabajo/nueva")}>
            Nueva OT
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Buscar OT, equipo, NS..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="OT Status"
              allowClear
              style={{ width: "100%" }}
              value={filterOtStatus || undefined}
              onChange={(v) => { setFilterOtStatus(v ?? ""); setPage(1); }}
              options={otStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Recursos Status"
              allowClear
              style={{ width: "100%" }}
              value={filterRecursosStatus || undefined}
              onChange={(v) => { setFilterRecursosStatus(v ?? ""); setPage(1); }}
              options={recursosStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Taller Status"
              allowClear
              style={{ width: "100%" }}
              value={filterTallerStatus || undefined}
              onChange={(v) => { setFilterTallerStatus(v ?? ""); setPage(1); }}
              options={tallerStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={clearFilters}>Limpiar</Button>
          </Col>
          <Col xs={24}>
            <RangoFechasFiltro
              label="Fecha de recepción"
              value={rangoRecepcion}
              onChange={setRangoRecepcion}
            />
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          // Carga client-side completa: la data viene entera del server (limit
          // alto en fetchData) y filtramos acá por rango de fechas. Los filtros
          // de columna (Cliente/Equipo/etc.) ya operan sobre TODO el dataset.
          dataSource={data.filter((r) => dentroDeRango(r, "fecha_recepcion", rangoRecepcion))}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            // total = filas cargadas en cliente (post fecha_recepcion).
            total: data.filter((r) => dentroDeRango(r, "fecha_recepcion", rangoRecepcion)).length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "órdenes de trabajo",
          })}
          scroll={{ x: 1500 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <OTDetalleModal
        otId={modalOtId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUpdated={() => fetchData()}
      />
    </div>
  );
}

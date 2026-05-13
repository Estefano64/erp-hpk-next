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
import OTDetalleModal from "@/components/modules/ordenes-trabajo/OTDetalleModal";

const { Title } = Typography;

interface OTRecord {
  id: number;
  ot: string;
  estrategia: boolean;
  equipo_codigo: string | null;
  ns: string | null;
  descripcion: string | null;
  fecha_recepcion: string | null;
  porcentaje_pcr: number | null;
  ot_status_codigo: string | null;
  recursos_status_codigo: string | null;
  taller_status_codigo: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string } | null;
  atencion_reparacion: { nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  ot_status: { nombre: string } | null;
  recursos_status: { nombre: string } | null;
  taller_status: { nombre: string } | null;
}

interface CatalogOption {
  codigo: string;
  nombre: string;
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
  const { ocultas, setOcultas } = useColumnasOcultas("ordenes-trabajo-list-cols-v1");
  const { rango: rangoRecepcion, setRango: setRangoRecepcion } = useRangoFechas();

  const [otStatuses, setOtStatuses] = useState<CatalogOption[]>([]);
  const [recursosStatuses, setRecursosStatuses] = useState<CatalogOption[]>([]);
  const [tallerStatuses, setTallerStatuses] = useState<CatalogOption[]>([]);

  // Modal detalle
  const [modalOtId, setModalOtId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search) params.set("search", search);
    if (filterOtStatus) params.set("ot_status", filterOtStatus);
    if (filterRecursosStatus) params.set("recursos_status", filterRecursosStatus);
    if (filterTallerStatus) params.set("taller_status", filterTallerStatus);
    const res = await fetch(`/api/ordenes-trabajo?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterOtStatus, filterRecursosStatus, filterTallerStatus]);

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
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YYYY") : "-",
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
          <Tooltip title="Hoja de evaluación">
            <Button
              type="text"
              icon={<AuditOutlined />}
              onClick={() => router.push(`/ordenes-trabajo/${record.id}/evaluacion`)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<OTRecord>(columns, "ordenes-trabajo-list-cols-widths-v1");

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

      <Table
        rowKey="id"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={data.filter((r) => dentroDeRango(r, "fecha_recepcion", rangoRecepcion))}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "órdenes de trabajo",
        })}
        scroll={{ x: 1500 }}
        size="small"
      />

      <OTDetalleModal
        otId={modalOtId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUpdated={() => fetchData()}
      />
    </div>
  );
}

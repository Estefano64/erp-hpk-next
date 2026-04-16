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
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
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
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOtStatus, setFilterOtStatus] = useState("");
  const [filterRecursosStatus, setFilterRecursosStatus] = useState("");
  const [filterTallerStatus, setFilterTallerStatus] = useState("");

  const [otStatuses, setOtStatuses] = useState<CatalogOption[]>([]);
  const [recursosStatuses, setRecursosStatuses] = useState<CatalogOption[]>([]);
  const [tallerStatuses, setTallerStatuses] = useState<CatalogOption[]>([]);

  // Modal detalle
  const [modalOtId, setModalOtId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (filterOtStatus) params.set("ot_status", filterOtStatus);
    if (filterRecursosStatus) params.set("recursos_status", filterRecursosStatus);
    if (filterTallerStatus) params.set("taller_status", filterTallerStatus);
    const res = await fetch(`/api/ordenes-trabajo?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, search, filterOtStatus, filterRecursosStatus, filterTallerStatus]);

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
    {
      title: "OT",
      dataIndex: "ot",
      width: 150,
      fixed: "left",
      sorter: (a, b) => a.ot.localeCompare(b.ot),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      title: "Cliente",
      dataIndex: "cliente",
      width: 150,
      ellipsis: true,
      sorter: (a, b) => (a.cliente?.nombre_comercial ?? a.cliente?.razon_social ?? "").localeCompare(b.cliente?.nombre_comercial ?? b.cliente?.razon_social ?? ""),
      render: (_: unknown, r: OTRecord) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "-",
    },
    {
      title: "Cod. Rep",
      width: 120,
      ellipsis: true,
      sorter: (a, b) => (a.codigo_reparacion?.codigo ?? "").localeCompare(b.codigo_reparacion?.codigo ?? ""),
      render: (_: unknown, r: OTRecord) => r.codigo_reparacion?.codigo ?? "-",
    },
    {
      title: "Equipo",
      dataIndex: "equipo_codigo",
      width: 100,
      sorter: (a, b) => (a.equipo_codigo ?? "").localeCompare(b.equipo_codigo ?? ""),
    },
    {
      title: "Descripción",
      dataIndex: "descripcion",
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? ""),
    },
    {
      title: "Recepción",
      dataIndex: "fecha_recepcion",
      width: 110,
      sorter: (a, b) => (a.fecha_recepcion ?? "").localeCompare(b.fecha_recepcion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YYYY") : "-",
    },
    {
      title: "% PCR",
      dataIndex: "porcentaje_pcr",
      width: 80,
      align: "center",
      sorter: (a, b) => (a.porcentaje_pcr ?? 0) - (b.porcentaje_pcr ?? 0),
      render: (v: number | null) => v != null ? `${v}%` : "-",
    },
    {
      title: "Prioridad",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.prioridad_atencion?.codigo ?? "").localeCompare(b.prioridad_atencion?.codigo ?? ""),
      render: (_: unknown, r: OTRecord) =>
        r.prioridad_atencion ? (
          <Tag color={prioridadColor[r.prioridad_atencion.codigo] ?? "default"}>
            {r.prioridad_atencion.nombre}
          </Tag>
        ) : "-",
    },
    {
      title: "OT Status",
      width: 120,
      sorter: (a, b) => (a.ot_status?.nombre ?? "").localeCompare(b.ot_status?.nombre ?? ""),
      render: (_: unknown, r: OTRecord) =>
        r.ot_status ? (
          <Tag color={otStatusColor[r.ot_status_codigo ?? ""] ?? "default"}>
            {r.ot_status.nombre}
          </Tag>
        ) : "-",
    },
    {
      title: "Recursos",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.recursos_status?.nombre ?? "").localeCompare(b.recursos_status?.nombre ?? ""),
      render: (_: unknown, r: OTRecord) => r.recursos_status?.nombre ?? "-",
    },
    {
      title: "Taller",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.taller_status?.nombre ?? "").localeCompare(b.taller_status?.nombre ?? ""),
      render: (_: unknown, r: OTRecord) => r.taller_status?.nombre ?? "-",
    },
    {
      title: "",
      width: 50,
      align: "center",
      fixed: "right",
      render: (_: unknown, record: OTRecord) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => { setModalOtId(record.id); setModalOpen(true); }}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Órdenes de Trabajo</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/ordenes-trabajo/nueva")}>
          Nueva OT
        </Button>
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
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showTotal: (t) => `${t} registros`,
          onChange: setPage,
        }}
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

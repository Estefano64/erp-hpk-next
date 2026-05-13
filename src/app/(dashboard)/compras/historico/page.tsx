"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Typography,
  Table,
  Input,
  Space,
  Tag,
  Row,
  Col,
  Card,
  Button,
  Empty,
  Statistic,
  Select,
} from "antd";
import { ReloadOutlined, SearchOutlined, FileSearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
  STICKY_HEADER,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface HistoricoRow {
  key: string;
  material_id: number;
  material_codigo: string | null;
  material_descripcion: string | null;
  unidad: string | null;
  proveedor_id: number;
  proveedor_razon_social: string;
  proveedor_ruc: string | null;
  precio_unitario: number;
  moneda: string | null;
  cantidad: number;
  fecha: string | null;
  numero_po: string;
  compra_id: number;
  status_oc: string | null;
}

interface HistoricoStats {
  combinaciones: number;
  materiales: number;
  proveedores: number;
}

const statusColor: Record<string, string> = {
  PEND_OC: "default",
  PROCESO: "blue",
  INCOMPLETO: "orange",
  COMPLETO: "green",
  ENTREGADO: "green",
};

function fmtPrecio(n: number, moneda: string | null) {
  const simbolo = moneda === "USD" ? "$" : moneda === "PEN" ? "S/" : "";
  return `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export default function HistoricoComprasPage() {
  const [rows, setRows] = useState<HistoricoRow[]>([]);
  const [stats, setStats] = useState<HistoricoStats>({ combinaciones: 0, materiales: 0, proveedores: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [busqueda, setBusqueda] = useState("");
  const [proveedorFiltro, setProveedorFiltro] = useState<number | null>(null);
  const [monedaFiltro, setMonedaFiltro] = useState<string | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("historico-compras-cols-v1");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/historico");
      if (res.ok) {
        const json = await res.json();
        setRows(json.data ?? []);
        setStats(json.stats ?? { combinaciones: 0, materiales: 0, proveedores: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const proveedoresOpciones = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      if (!map.has(r.proveedor_id)) map.set(r.proveedor_id, r.proveedor_razon_social);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ value: id, label: nombre }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const monedasOpciones = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.moneda) set.add(r.moneda);
    }
    return [...set].sort();
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter((r) => {
      if (proveedorFiltro && r.proveedor_id !== proveedorFiltro) return false;
      if (monedaFiltro && r.moneda !== monedaFiltro) return false;
      if (!q) return true;
      return (
        (r.material_codigo || "").toLowerCase().includes(q) ||
        (r.material_descripcion || "").toLowerCase().includes(q) ||
        (r.proveedor_razon_social || "").toLowerCase().includes(q) ||
        (r.numero_po || "").toLowerCase().includes(q)
      );
    });
  }, [rows, busqueda, proveedorFiltro, monedaFiltro]);

  const columns: ColumnsType<HistoricoRow> = [
    numeracionColumn<HistoricoRow>({ current: page, pageSize, width: 56 }),
    {
      key: "material_codigo",
      title: "Código",
      dataIndex: "material_codigo",
      width: 140,
      sorter: (a, b) => (a.material_codigo || "").localeCompare(b.material_codigo || ""),
      ...filtroPorColumna(filtradas, "material_codigo"),
      render: (v: string | null) => <Text strong style={{ fontSize: 12, color: brand.navy }}>{v ?? "—"}</Text>,
    },
    {
      key: "material_descripcion",
      title: "Material",
      dataIndex: "material_descripcion",
      sorter: (a, b) => (a.material_descripcion || "").localeCompare(b.material_descripcion || ""),
      ...filtroPorColumna(filtradas, "material_descripcion"),
      render: (v: string | null, r) => (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
          <span style={{ fontSize: 13 }}>{v ?? "—"}</span>
          {r.unidad && <span style={{ fontSize: 11, color: brand.textSecondary }}>Unidad: {r.unidad}</span>}
        </div>
      ),
    },
    {
      key: "proveedor_razon_social",
      title: "Proveedor",
      dataIndex: "proveedor_razon_social",
      width: 230,
      sorter: (a, b) => a.proveedor_razon_social.localeCompare(b.proveedor_razon_social),
      ...filtroPorColumna(filtradas, "proveedor_razon_social"),
      render: (v: string, r) => (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
          {r.proveedor_ruc && <span style={{ fontSize: 11, color: brand.textSecondary }}>RUC: {r.proveedor_ruc}</span>}
        </div>
      ),
    },
    {
      key: "precio_unitario",
      title: "Último precio",
      dataIndex: "precio_unitario",
      width: 140,
      align: "right",
      sorter: (a, b) => a.precio_unitario - b.precio_unitario,
      render: (v: number, r) => (
        <span style={{ fontWeight: 600, color: brand.navy, fontSize: 13 }}>{fmtPrecio(v, r.moneda)}</span>
      ),
    },
    {
      key: "moneda",
      title: "Moneda",
      dataIndex: "moneda",
      width: 90,
      align: "center",
      ...filtroPorColumna(filtradas, "moneda"),
      render: (v: string | null) => <Tag color={v === "USD" ? "blue" : "gold"}>{v ?? "—"}</Tag>,
    },
    {
      key: "cantidad",
      title: "Cant. comprada",
      dataIndex: "cantidad",
      width: 120,
      align: "right",
      sorter: (a, b) => a.cantidad - b.cantidad,
      render: (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 }),
    },
    {
      key: "fecha",
      title: "Fecha",
      dataIndex: "fecha",
      width: 110,
      sorter: (a, b) => (a.fecha || "").localeCompare(b.fecha || ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YYYY") : <Text type="secondary">—</Text>,
    },
    {
      key: "numero_po",
      title: "PO",
      dataIndex: "numero_po",
      width: 140,
      ...filtroPorColumna(filtradas, "numero_po"),
      render: (v: string, r) => (
        <Link href={`/compras?po=${encodeURIComponent(v)}`} style={{ fontSize: 12, fontWeight: 500 }}>
          {v}
        </Link>
      ),
    },
    {
      key: "status_oc",
      title: "Estado OC",
      dataIndex: "status_oc",
      width: 120,
      align: "center",
      ...filtroPorColumna(filtradas, "status_oc"),
      render: (v: string | null) => v ? <Tag color={statusColor[v] ?? "default"}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<HistoricoRow>(columns, "historico-compras-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <FileSearchOutlined style={{ marginRight: 8 }} />
          Histórico de compras a proveedores
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 16 }}>
        Última compra registrada por cada combinación de material y proveedor. Excluye compras anuladas o devueltas.
      </Text>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Combinaciones material × proveedor" value={stats.combinaciones} styles={{ content: { color: brand.navy, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Materiales con histórico" value={stats.materiales} styles={{ content: { color: brand.cyan, fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="Proveedores con compras" value={stats.proveedores} styles={{ content: { color: brand.success ?? "#52c41a", fontSize: 22 } }} />
          </Card>
        </Col>
      </Row>

      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          placeholder="Buscar material, proveedor o PO..."
          prefix={<SearchOutlined />}
          allowClear
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: 320 }}
        />
        <Select
          placeholder="Filtrar por proveedor"
          allowClear
          showSearch
          optionFilterProp="label"
          value={proveedorFiltro ?? undefined}
          onChange={(v) => setProveedorFiltro(v ?? null)}
          options={proveedoresOpciones}
          style={{ minWidth: 240 }}
        />
        <Select
          placeholder="Moneda"
          allowClear
          value={monedaFiltro ?? undefined}
          onChange={(v) => setMonedaFiltro(v ?? null)}
          options={monedasOpciones.map((m) => ({ value: m, label: m }))}
          style={{ width: 120 }}
        />
        <ColumnasToggleButton<HistoricoRow>
          columns={columns}
          ocultas={ocultas}
          setOcultas={setOcultas}
          obligatorias={["material_codigo", "proveedor_razon_social", "precio_unitario"]}
        />
      </Space>

      {filtradas.length === 0 && !loading ? (
        <Empty description="No hay compras registradas con esos filtros." />
      ) : (
        <Table<HistoricoRow>
          rowKey="key"
          size="small"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={filtradas}
          loading={loading}
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content" }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: filtradas.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "combinaciones",
          })}
        />
      )}
    </div>
  );
}

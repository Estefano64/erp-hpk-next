"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Empty, Row, Col, Statistic, Segmented,
} from "antd";
import {
  ReloadOutlined, SearchOutlined, FileTextOutlined, DownloadOutlined,
  FileDoneOutlined, FileExcelOutlined, AuditOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns,
  filtroPorColumna, useColumnasRedimensionables, STICKY_HEADER,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface CompraRow {
  id: number;
  numero_po: string;
  nombre: string | null;
  proveedor_nombre: string | null;
  estado: string;
  total: number | string;
  moneda: string;
  fecha_solicitud: string | null;
  fecha_entrega_real: string | null;
  nro_factura: string | null;
  nro_guia: string | null;
  guia_archivo: string | null;
  guia_nombre: string | null;
  factura_archivo: string | null;
  factura_nombre: string | null;
}

type FiltroDocs = "todos" | "con_factura" | "sin_factura" | "con_guia" | "sin_guia";

export default function ContabilidadComprasPage() {
  const [rows, setRows] = useState<CompraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroDocs, setFiltroDocs] = useState<FiltroDocs>("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("contabilidad-compras-cols-v1");

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

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtroDocs === "con_factura" && !r.factura_archivo) return false;
      if (filtroDocs === "sin_factura" && r.factura_archivo) return false;
      if (filtroDocs === "con_guia" && !r.guia_archivo) return false;
      if (filtroDocs === "sin_guia" && r.guia_archivo) return false;
      if (!q) return true;
      return (
        r.numero_po.toLowerCase().includes(q) ||
        (r.proveedor_nombre ?? "").toLowerCase().includes(q) ||
        (r.nro_factura ?? "").toLowerCase().includes(q) ||
        (r.nro_guia ?? "").toLowerCase().includes(q) ||
        (r.nombre ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filtroDocs]);

  const kpis = useMemo(() => {
    const conFactura = rows.filter((r) => r.factura_archivo).length;
    const conGuia = rows.filter((r) => r.guia_archivo).length;
    const sinFactura = rows.filter((r) => !r.factura_archivo).length;
    return { total: rows.length, conFactura, conGuia, sinFactura };
  }, [rows]);

  const archivoCell = (archivo: string | null, nombre: string | null, label: string) => {
    if (!archivo) return <Tag color="default">Sin {label}</Tag>;
    return (
      <Space size={4}>
        <a href={archivo} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
          <FileTextOutlined style={{ color: brand.cyan, marginRight: 4 }} />
          {nombre || `Ver ${label}`}
        </a>
        <Button size="small" type="text" icon={<DownloadOutlined />} href={archivo} target="_blank" title={`Descargar ${label}`} />
      </Space>
    );
  };

  const columns: ColumnsType<CompraRow> = [
    numeracionColumn<CompraRow>({ current: page, pageSize }),
    {
      key: "numero_po", title: "Nro OC", dataIndex: "numero_po", width: 130, fixed: "left", align: "left",
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      ...filtroPorColumna(filtradas, "numero_po"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
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
      key: "guia", title: "Archivo Guía", width: 200, align: "left",
      render: (_v, r) => archivoCell(r.guia_archivo, r.guia_nombre, "guía"),
    },
    {
      key: "nro_factura", title: "Nro Factura", dataIndex: "nro_factura", width: 130, align: "left",
      ...filtroPorColumna(filtradas, "nro_factura"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "factura", title: "Archivo Factura", width: 200, align: "left",
      render: (_v, r) => archivoCell(r.factura_archivo, r.factura_nombre, "factura"),
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
          Contabilidad — Guías y Facturas de OCs
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Vista de solo lectura para contabilidad: revisá y descargá la guía de remisión y la factura de cada orden de compra.
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
            placeholder="Buscar OC, proveedor, nro factura/guía…"
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
            obligatorias={["numero_po", "guia", "factura"]}
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

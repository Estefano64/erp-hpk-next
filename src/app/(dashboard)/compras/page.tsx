"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Tag,
  Row,
  Col,
  Card,
  Space,
  Tooltip,
  App,
  Statistic,
  Popconfirm,
  Segmented,
  Tabs,
  Badge,
} from "antd";
import RequerimientosAprobadosTab from "@/components/modules/compras/RequerimientosAprobadosTab";
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  MessageOutlined,
  CheckOutlined,
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
import { Popover, Divider } from "antd";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";
import CompraDetalleModal from "@/components/modules/compras/CompraDetalleModal";

const { Title } = Typography;

interface Compra {
  id: number;
  numero_po: string;
  numero_req: string | null;
  ot_id: number | null;
  ot_numero: string | null;
  proveedor_id: number;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  fecha_entrega_real: string | null;
  estado: string;
  subtotal: number;
  impuesto: number;
  total: number;
  moneda: string;
  nro_factura: string | null;
  nro_guia: string | null;
  observaciones: string | null;
  cantidad_items: number;
  usuario_solicita: string;
}

const estadoColor: Record<string, string> = {
  Pendiente: "gold",
  Aprobado: "blue",
  "En Proceso": "cyan",
  Recibido: "green",
  Cancelado: "red",
};

export default function ComprasPage() {
  const router = useRouter();
  const { message } = App.useApp();

  const [data, setData] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  const [modalId, setModalId] = useState<number | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("compras-list-cols-v1");
  const { rango: rangoSolicitud, setRango: setRangoSolicitud } = useRangoFechas();
  const { rango: rangoEntrega, setRango: setRangoEntrega } = useRangoFechas();

  const [rol, setRol] = useState<string | null>(null);
  const isAdmin = rol === "admin";
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user) setRol(d.user.rol); })
      .catch(() => { /* noop */ });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (estado) params.set("estado", estado);
      const res = await fetch(`/api/compras?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar compras");
    } finally {
      setLoading(false);
    }
  }, [search, estado, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/compras/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al eliminar");
      message.success("Compra eliminada");
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleAceptar(id: number) {
    try {
      const res = await fetch(`/api/compras/${id}/aceptar`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al aceptar OC");
      message.success("OC aceptada");
      fetchData();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    }
  }

  // KPIs
  const pendientes = data.filter((c) => c.estado === "Pendiente").length;
  const enProceso = data.filter((c) => c.estado === "En Proceso" || c.estado === "Aprobado").length;
  const recibidas = data.filter((c) => c.estado === "Recibido").length;
  const totalValor = data.reduce((s, c) => s + Number(c.total || 0), 0);

  const exportarExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = data.map((c) => ({
        "Nro OC": c.numero_po,
        Estado: c.estado,
        Proveedor: c.proveedor_nombre ?? "",
        Almacén: c.almacen_nombre ?? "",
        "F. Solicitud": c.fecha_solicitud ? dayjs(c.fecha_solicitud).format("DD/MM/YYYY") : "",
        "F. Entrega Esp.": c.fecha_entrega_esperada ? dayjs(c.fecha_entrega_esperada).format("DD/MM/YYYY") : "",
        "F. Entrega Real": c.fecha_entrega_real ? dayjs(c.fecha_entrega_real).format("DD/MM/YYYY") : "",
        Items: c.cantidad_items,
        Subtotal: Number(c.subtotal),
        IGV: Number(c.impuesto),
        Total: Number(c.total),
        Moneda: c.moneda,
        "Nro Guía": c.nro_guia ?? "",
        "Nro Factura": c.nro_factura ?? "",
        Comentarios: c.observaciones ?? "",
        Usuario: c.usuario_solicita ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Compras");
      XLSX.writeFile(wb, `Compras-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
      message.success("Excel descargado");
    } catch {
      message.error("Error al exportar Excel");
    }
  };

  // Valores unicos para filtros
  const valoresUnicos = (campo: keyof Compra) => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const popoverContent = (r: Compra) => (
    <div style={{ maxWidth: 340, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>OC: {r.numero_po}</div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>Proveedor:</span> <b>{r.proveedor_nombre || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Almacén:</span> <b>{r.almacen_nombre || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Items:</span> <b>{r.cantidad_items}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Moneda:</span> <b>{r.moneda}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Solicitud:</span> <b>{dayjs(r.fecha_solicitud).format("DD/MM/YYYY")}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Entrega Esp:</span> <b>{r.fecha_entrega_esperada ? dayjs(r.fecha_entrega_esperada).format("DD/MM/YYYY") : "-"}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>F. Entrega Real:</span> <b>{r.fecha_entrega_real ? dayjs(r.fecha_entrega_real).format("DD/MM/YYYY") : "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Subtotal:</span> <b>{Number(r.subtotal).toFixed(2)}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>IGV:</span> <b>{Number(r.impuesto).toFixed(2)}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>Total:</span> <b style={{ color: brand.navy }}>{r.moneda} {Number(r.total).toFixed(2)}</b></Col>
        {r.nro_factura && <Col span={24}><span style={{ color: "#888" }}>Factura:</span> <b>{r.nro_factura}</b></Col>}
        {r.usuario_solicita && <Col span={24}><span style={{ color: "#888" }}>Usuario:</span> <b>{r.usuario_solicita}</b></Col>}
      </Row>
      <Divider style={{ margin: "8px 0" }} />
      <Tag color={estadoColor[r.estado] || "default"}>{r.estado}</Tag>
      {r.observaciones && <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic" }}>{r.observaciones}</div>}
    </div>
  );

  const columns: ColumnsType<Compra> = [
    numeracionColumn<Compra>({ current: page, pageSize }),
    {
      key: "numero_po",
      title: "Nro OC",
      dataIndex: "numero_po",
      width: 130,
      fixed: "left",
      filters: valoresUnicos("numero_po"),
      filterSearch: true,
      onFilter: (value, r) => r.numero_po === value,
      sorter: (a, b) => a.numero_po.localeCompare(b.numero_po),
      render: (v, r) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ cursor: "help", display: "flex", alignItems: "center", gap: 4 }}>
            <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
            <Tag color={brand.navy}>{v}</Tag>
          </div>
        </Popover>
      ),
    },
    {
      key: "estado",
      title: "Estado",
      dataIndex: "estado",
      width: 110,
      filters: [
        { text: "Pendiente", value: "Pendiente" },
        { text: "Aprobado", value: "Aprobado" },
        { text: "En Proceso", value: "En Proceso" },
        { text: "Recibido", value: "Recibido" },
        { text: "Cancelado", value: "Cancelado" },
      ],
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => <Tag color={estadoColor[v] || "default"}>{v}</Tag>,
    },
    {
      key: "proveedor_nombre",
      title: "Proveedor",
      dataIndex: "proveedor_nombre",
      width: 200,
      ellipsis: true,
      filters: valoresUnicos("proveedor_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.proveedor_nombre === value,
      sorter: (a, b) => (a.proveedor_nombre ?? "").localeCompare(b.proveedor_nombre ?? ""),
    },
    {
      key: "almacen_nombre",
      title: "Almacén",
      dataIndex: "almacen_nombre",
      width: 140,
      ellipsis: true,
      filters: valoresUnicos("almacen_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.almacen_nombre === value,
    },
    {
      key: "fecha_solicitud",
      title: "F. Solicitud",
      dataIndex: "fecha_solicitud",
      width: 110,
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
      sorter: (a, b) => (a.fecha_solicitud ?? "").localeCompare(b.fecha_solicitud ?? ""),
    },
    {
      key: "fecha_entrega_esperada",
      title: "F. Entrega Esp.",
      dataIndex: "fecha_entrega_esperada",
      width: 120,
      sorter: (a, b) => (a.fecha_entrega_esperada ?? "").localeCompare(b.fecha_entrega_esperada ?? ""),
      filters: [...new Set(data.map((r) => r.fecha_entrega_esperada).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: dayjs(v).format("DD/MM/YYYY"), value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fecha_entrega_esperada === value,
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      key: "cantidad_items",
      title: "Items",
      dataIndex: "cantidad_items",
      width: 70,
      align: "center",
      sorter: (a, b) => a.cantidad_items - b.cantidad_items,
      filters: [...new Set(data.map((r) => r.cantidad_items))].sort((a, b) => a - b)
        .map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.cantidad_items) === value,
    },
    {
      key: "subtotal",
      title: "Subtotal",
      dataIndex: "subtotal",
      width: 110,
      align: "right",
      sorter: (a, b) => Number(a.subtotal) - Number(b.subtotal),
      filters: [...new Set(data.map((r) => Number(r.subtotal)))].sort((a, b) => a - b)
        .map((v) => ({ text: v.toFixed(2), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.subtotal)) === value,
      render: (v: number) => Number(v).toFixed(2),
    },
    {
      key: "total",
      title: "Total",
      dataIndex: "total",
      width: 120,
      align: "right",
      render: (v: number, r: Compra) => (
        <span style={{ fontWeight: 600, color: brand.navy }}>
          {r.moneda} {Number(v).toFixed(2)}
        </span>
      ),
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    {
      key: "nro_guia",
      title: "Guía",
      dataIndex: "nro_guia",
      width: 110,
      ...filtroPorColumna(data, "nro_guia"),
      render: (v: string | null) =>
        v ? <Tag color="cyan">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "nro_factura",
      title: "Factura",
      dataIndex: "nro_factura",
      width: 130,
      ...filtroPorColumna(data, "nro_factura"),
      render: (v: string | null) =>
        v ? <Tag color="purple">{v}</Tag> : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      key: "observaciones",
      title: "Comentarios",
      dataIndex: "observaciones",
      width: 220,
      ellipsis: true,
      render: (v: string | null) =>
        v ? (
          <Tooltip title={v}>
            <Space size={4}>
              <MessageOutlined style={{ color: brand.cyan }} />
              <span style={{ fontSize: 12 }}>{v}</span>
            </Space>
          </Tooltip>
        ) : (
          <span style={{ color: "#bbb" }}>—</span>
        ),
    },
    {
      key: "usuario_solicita",
      title: "Usuario",
      dataIndex: "usuario_solicita",
      width: 120,
      ...filtroPorColumna(data, "usuario_solicita"),
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 130,
      align: "center",
      fixed: "right",
      render: (_: unknown, r: Compra) => (
        <Space size={0}>
          <Tooltip title="Ver detalle">
            <Button type="text" icon={<EyeOutlined />} onClick={() => setModalId(r.id)} />
          </Tooltip>
          <Tooltip title="Generar PDF (OC)">
            <Button type="text" icon={<FilePdfOutlined style={{ color: "#cf1322" }} />} onClick={() => window.open(`/api/compras/${r.id}/pdf`, "_blank")} />
          </Tooltip>
          {isAdmin && r.estado === "Pendiente" && (
            <Tooltip title="Aceptar OC (pasa a En Proceso)">
              <Popconfirm
                title={`¿Aceptar la OC ${r.numero_po}?`}
                description="La OC quedará en estado En Proceso y registrará tu usuario como aprobador."
                onConfirm={() => handleAceptar(r.id)}
                okText="Aceptar"
                cancelText="Cancelar"
              >
                <Button type="text" icon={<CheckOutlined style={{ color: "#52c41a" }} />} />
              </Popconfirm>
            </Tooltip>
          )}
          {r.estado === "Pendiente" && (
            <Tooltip title="Eliminar">
              <Popconfirm
                title="¿Eliminar esta OC?"
                description="Solo se pueden eliminar OCs Pendientes"
                onConfirm={() => handleDelete(r.id)}
                okText="Eliminar"
                cancelText="Cancelar"
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<Compra>(columns, "compras-list-cols-widths-v1");

  const ocsContent = (
    <>
      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic
              title="Pendientes"
              value={pendientes}
              prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
              styles={{ content: { color: "#faad14" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic
              title="En Proceso"
              value={enProceso}
              prefix={<ShoppingCartOutlined style={{ color: brand.cyan }} />}
              styles={{ content: { color: brand.cyan } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic
              title="Recibidas"
              value={recibidas}
              prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic
              title="Valor total"
              value={totalValor}
              precision={2}
              prefix="$"
              styles={{ content: { color: brand.navy } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Selector de vista por estado */}
      <Card styles={{ body: { padding: 12 } }} style={{ marginBottom: 12 }}>
        <Segmented
          block
          value={estado || "__all"}
          onChange={(v) => { setEstado(v === "__all" ? "" : (v as string)); setPage(1); }}
          options={[
            { value: "__all", label: "Todos" },
            { value: "Pendiente", label: "Pendiente" },
            { value: "Aprobado", label: "Aprobado" },
            { value: "En Proceso", label: "En Proceso" },
            { value: "Recibido", label: "Recibido" },
            { value: "Cancelado", label: "Cancelado" },
          ]}
        />
      </Card>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={16} md={10}>
            <Input
              placeholder="Buscar por OC, factura..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha solicitud" value={rangoSolicitud} onChange={setRangoSolicitud} />
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha entrega esperada" value={rangoEntrega} onChange={setRangoEntrega} />
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={data.filter((r) =>
          dentroDeRango(r, "fecha_solicitud", rangoSolicitud) &&
          dentroDeRango(r, "fecha_entrega_esperada", rangoEntrega)
        )}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "órdenes de compra",
        })}
        scroll={{ x: 1500 }}
        size="small"
      />
    </>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Compras
        </Title>
        <Space>
          <ColumnasToggleButton<Compra>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "numero_po", "acciones"]}
          />
          <Button
            icon={<FileExcelOutlined />}
            onClick={exportarExcel}
            style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
          >
            Descargar Excel
          </Button>
          <Button
            icon={<UnorderedListOutlined />}
            onClick={() => router.push("/requerimientos")}
          >
            Ir a Requerimientos
          </Button>
        </Space>
      </div>

      <Tabs
        defaultActiveKey="ocs"
        items={[
          {
            key: "ocs",
            label: (
              <span>
                <ShoppingCartOutlined /> Órdenes de Compra
                <Badge count={data.length} style={{ background: brand.navy, marginLeft: 8 }} showZero />
              </span>
            ),
            children: ocsContent,
          },
          {
            key: "aprobados",
            label: (
              <span>
                <InfoCircleOutlined /> Requerimientos aprobados
              </span>
            ),
            children: <RequerimientosAprobadosTab onOCCreated={fetchData} />,
          },
        ]}
      />

      <CompraDetalleModal
        compraId={modalId}
        open={!!modalId}
        onClose={() => setModalId(null)}
        onUpdated={fetchData}
      />
    </div>
  );
}

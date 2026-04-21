"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  Tooltip,
  App,
  Statistic,
  Popconfirm,
} from "antd";
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
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
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

  const [modalId, setModalId] = useState<number | null>(null);

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

  // KPIs
  const pendientes = data.filter((c) => c.estado === "Pendiente").length;
  const enProceso = data.filter((c) => c.estado === "En Proceso" || c.estado === "Aprobado").length;
  const recibidas = data.filter((c) => c.estado === "Recibido").length;
  const totalValor = data.reduce((s, c) => s + Number(c.total || 0), 0);

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
    {
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
      title: "Almacén",
      dataIndex: "almacen_nombre",
      width: 140,
      ellipsis: true,
      filters: valoresUnicos("almacen_nombre"),
      filterSearch: true,
      onFilter: (value, r) => r.almacen_nombre === value,
    },
    {
      title: "F. Solicitud",
      dataIndex: "fecha_solicitud",
      width: 110,
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
      sorter: (a, b) => (a.fecha_solicitud ?? "").localeCompare(b.fecha_solicitud ?? ""),
    },
    {
      title: "F. Entrega Esp.",
      dataIndex: "fecha_entrega_esperada",
      width: 120,
      render: (v: string | null) => (v ? dayjs(v).format("DD/MM/YYYY") : "-"),
    },
    {
      title: "Items",
      dataIndex: "cantidad_items",
      width: 70,
      align: "center",
    },
    {
      title: "Subtotal",
      dataIndex: "subtotal",
      width: 110,
      align: "right",
      render: (v: number) => Number(v).toFixed(2),
    },
    {
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
      title: "Factura",
      dataIndex: "nro_factura",
      width: 130,
      render: (v: string | null) => v || "-",
    },
    {
      title: "Usuario",
      dataIndex: "usuario_solicita",
      width: 120,
    },
    {
      title: "Acciones",
      width: 100,
      align: "center",
      fixed: "right",
      render: (_: unknown, r: Compra) => (
        <Space size={0}>
          <Tooltip title="Ver detalle">
            <Button type="text" icon={<EyeOutlined />} onClick={() => setModalId(r.id)} />
          </Tooltip>
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Órdenes de Compra
        </Title>
        <Button
          type="primary"
          icon={<UnorderedListOutlined />}
          onClick={() => router.push("/requerimientos")}
        >
          Ver Requerimientos
        </Button>
      </div>

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

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Buscar por OC, factura..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Estado"
              allowClear
              style={{ width: "100%" }}
              value={estado || undefined}
              onChange={(v) => setEstado(v ?? "")}
              options={[
                { value: "Pendiente", label: "Pendiente" },
                { value: "Aprobado", label: "Aprobado" },
                { value: "En Proceso", label: "En Proceso" },
                { value: "Recibido", label: "Recibido" },
                { value: "Cancelado", label: "Cancelado" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} órdenes de compra` }}
        scroll={{ x: 1500 }}
        size="small"
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

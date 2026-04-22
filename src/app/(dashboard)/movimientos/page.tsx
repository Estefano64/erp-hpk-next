"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Row,
  Col,
  Card,
  Space,
  App,
  Statistic,
  Modal,
  Form,
  InputNumber,
  DatePicker,
  Popover,
  Divider,
  Alert,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  ToolOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ExportOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  InfoCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Movimiento {
  id: number;
  material_id: number;
  material_codigo: string | null;
  material_nombre: string | null;
  unidad_medida: string | null;
  stock_actual: number | null;
  tipo_movimiento: "ENTRADA" | "SALIDA" | "AJUSTE";
  cantidad: number;
  documento_referencia: string | null;
  observacion: string | null;
  usuario: string;
  fecha_movimiento: string;
}

interface StockItem {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
  stock_actual: number;
  punto_reposicion: number;
  stock_maximo: number;
  unidad_medida: string | null;
  ubicacion: string | null;
  caja: string | null;
  precio: number | null;
  moneda: string | null;
  fabricante: string | null;
  categoria: string | null;
  clasificacion: string | null;
  valor_total: number;
  alerta: "OK" | "BAJO" | "SIN";
}

interface StockKPIs {
  totalMateriales: number;
  sinStock: number;
  bajoStock: number;
  valorTotal: number;
}

interface POPendiente {
  id: number;
  numero_po: string;
  proveedor_nombre: string | null;
  almacen_nombre: string | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  estado: string;
  total: number;
  moneda: string;
  items: Array<{
    id: number;
    material_id: number;
    codigo: string | null;
    descripcion: string | null;
    unidad_medida: string;
    cantidad: number;
    precio_unitario: number | null;
  }>;
}

const tipoColor: Record<string, string> = {
  ENTRADA: "green",
  SALIDA: "red",
  AJUSTE: "blue",
};

const alertaColor: Record<string, string> = {
  OK: "green",
  BAJO: "orange",
  SIN: "red",
};

// ════════════════════════════════════════════════════════════
// TAB 1: MOVIMIENTOS (historial)
// ════════════════════════════════════════════════════════════
function TabMovimientos({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(false);
  const [tipo, setTipo] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [desde, setDesde] = useState<Dayjs | null>(null);
  const [hasta, setHasta] = useState<Dayjs | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (desde) params.set("desde", desde.format("YYYY-MM-DD"));
      if (hasta) params.set("hasta", hasta.format("YYYY-MM-DD"));
      const res = await fetch(`/api/movimientos?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [tipo, desde, hasta, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = data.filter((m) => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return (
      (m.material_codigo || "").toLowerCase().includes(lc) ||
      (m.material_nombre || "").toLowerCase().includes(lc) ||
      (m.documento_referencia || "").toLowerCase().includes(lc) ||
      (m.observacion || "").toLowerCase().includes(lc)
    );
  });

  const columns: ColumnsType<Movimiento> = [
    {
      title: "Fecha",
      dataIndex: "fecha_movimiento",
      width: 110,
      sorter: (a, b) => (a.fecha_movimiento || "").localeCompare(b.fecha_movimiento || ""),
      render: (v: string) => dayjs(v).format("DD/MM/YYYY"),
    },
    {
      title: "Tipo",
      dataIndex: "tipo_movimiento",
      width: 100,
      filters: [
        { text: "ENTRADA", value: "ENTRADA" },
        { text: "SALIDA", value: "SALIDA" },
        { text: "AJUSTE", value: "AJUSTE" },
      ],
      onFilter: (value, r) => r.tipo_movimiento === value,
      render: (v: string) => (
        <Tag color={tipoColor[v] || "default"} icon={v === "ENTRADA" ? <ArrowDownOutlined /> : v === "SALIDA" ? <ArrowUpOutlined /> : <SwapOutlined />}>
          {v}
        </Tag>
      ),
    },
    { title: "Código", dataIndex: "material_codigo", width: 110 },
    {
      title: "Material",
      dataIndex: "material_nombre",
      width: 280,
      ellipsis: true,
    },
    {
      title: "Cantidad",
      dataIndex: "cantidad",
      width: 110,
      align: "right",
      render: (v: number, r: Movimiento) => (
        <span style={{ fontWeight: 600, color: r.tipo_movimiento === "SALIDA" ? "#cf1322" : "#389e0d" }}>
          {r.tipo_movimiento === "SALIDA" ? "-" : "+"}
          {Number(v).toLocaleString("en", { maximumFractionDigits: 2 })}{" "}
          {r.unidad_medida}
        </span>
      ),
    },
    {
      title: "Stock Final",
      dataIndex: "stock_actual",
      width: 110,
      align: "right",
      render: (v: number | null) => (v != null ? Number(v).toLocaleString() : "-"),
    },
    { title: "Documento Ref.", dataIndex: "documento_referencia", width: 150 },
    { title: "Usuario", dataIndex: "usuario", width: 110 },
    {
      title: "Observación",
      dataIndex: "observacion",
      ellipsis: true,
    },
  ];

  return (
    <div>
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={5}>
            <Input
              placeholder="Buscar material..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={tipo}
              onChange={setTipo}
              options={[
                { value: "ENTRADA", label: "Entrada" },
                { value: "SALIDA", label: "Salida" },
                { value: "AJUSTE", label: "Ajuste" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Desde" value={desde} onChange={setDesde} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker placeholder="Hasta" value={hasta} onChange={setHasta} style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={loading}
        pagination={{ pageSize: 25 }}
        size="small"
        scroll={{ x: 1200 }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 2: STOCK
// ════════════════════════════════════════════════════════════
function TabStock() {
  const { message } = App.useApp();
  const [data, setData] = useState<StockItem[]>([]);
  const [kpis, setKpis] = useState<StockKPIs>({ totalMateriales: 0, sinStock: 0, bajoStock: 0, valorTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<string>("todos");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtro !== "todos") params.set("filtro", filtro);
      if (search) params.set("search", search);
      const res = await fetch(`/api/stock?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setKpis(json.kpis ?? {});
    } catch {
      message.error("Error al cargar stock");
    } finally {
      setLoading(false);
    }
  }, [filtro, search, message]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const popoverContent = (r: StockItem) => (
    <div style={{ maxWidth: 320, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>{r.descripcion}</div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>Código:</span> <b>{r.codigo}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>N/P:</span> <b>{r.np || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock actual:</span> <b style={{ color: r.alerta === "SIN" ? "#ff4d4f" : r.alerta === "BAJO" ? "#faad14" : "#52c41a" }}>{r.stock_actual}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>UM:</span> <b>{r.unidad_medida || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Pto. reposición:</span> <b>{r.punto_reposicion}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Stock máximo:</span> <b>{r.stock_maximo}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Ubicación:</span> <b>{r.ubicacion || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Caja:</span> <b>{r.caja || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Fabricante:</span> <b>{r.fabricante || "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Precio:</span> <b>{r.precio ? `${r.moneda || ""} ${r.precio.toFixed(2)}` : "-"}</b></Col>
        <Col span={24}><span style={{ color: "#888" }}>Valor total:</span> <b style={{ color: brand.navy }}>{r.moneda || "USD"} {r.valor_total.toFixed(2)}</b></Col>
      </Row>
    </div>
  );

  const valoresUnicos = (campo: keyof StockItem) => {
    const set = new Set<string>();
    data.forEach((r) => {
      const v = r[campo];
      if (v !== null && v !== undefined && v !== "") set.add(String(v));
    });
    return [...set].sort().map((v) => ({ text: v, value: v }));
  };

  const columns: ColumnsType<StockItem> = [
    {
      title: "Alerta",
      dataIndex: "alerta",
      width: 80,
      fixed: "left",
      filters: [
        { text: "Sin stock", value: "SIN" },
        { text: "Bajo stock", value: "BAJO" },
        { text: "OK", value: "OK" },
      ],
      onFilter: (value, r) => r.alerta === value,
      render: (v: string) => (
        <Tag color={alertaColor[v]} icon={v === "SIN" ? <WarningOutlined /> : v === "BAJO" ? <WarningOutlined /> : <CheckCircleOutlined />}>
          {v === "SIN" ? "Sin" : v === "BAJO" ? "Bajo" : "OK"}
        </Tag>
      ),
    },
    {
      title: "Código",
      dataIndex: "codigo",
      width: 120,
      fixed: "left",
      filters: valoresUnicos("codigo"),
      filterSearch: true,
      onFilter: (value, r) => r.codigo === value,
      sorter: (a, b) => (a.codigo || "").localeCompare(b.codigo || ""),
    },
    {
      title: "Descripción",
      dataIndex: "descripcion",
      width: 300,
      ellipsis: true,
      render: (v: string, r: StockItem) => (
        <Popover content={popoverContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ cursor: "help", display: "flex", alignItems: "center", gap: 4 }}>
            <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
            {v}
          </div>
        </Popover>
      ),
    },
    { title: "N/P", dataIndex: "np", width: 130 },
    {
      title: "Stock",
      dataIndex: "stock_actual",
      width: 90,
      align: "right",
      sorter: (a, b) => a.stock_actual - b.stock_actual,
      render: (v: number, r: StockItem) => (
        <span style={{ fontWeight: 600, color: r.alerta === "SIN" ? "#ff4d4f" : r.alerta === "BAJO" ? "#faad14" : "#52c41a" }}>
          {v.toLocaleString("en", { maximumFractionDigits: 2 })}
        </span>
      ),
    },
    { title: "UM", dataIndex: "unidad_medida", width: 60, align: "center" },
    {
      title: "Pto. Reposición",
      dataIndex: "punto_reposicion",
      width: 100,
      align: "right",
    },
    { title: "Máximo", dataIndex: "stock_maximo", width: 80, align: "right" },
    { title: "Ubicación", dataIndex: "ubicacion", width: 110 },
    {
      title: "Fabricante",
      dataIndex: "fabricante",
      width: 110,
      filters: valoresUnicos("fabricante"),
      filterSearch: true,
      onFilter: (value, r) => r.fabricante === value,
    },
    {
      title: "Precio",
      dataIndex: "precio",
      width: 100,
      align: "right",
      render: (v: number | null, r: StockItem) => (v != null ? `${r.moneda || ""} ${v.toFixed(2)}` : "-"),
    },
    {
      title: "Valor Total",
      dataIndex: "valor_total",
      width: 120,
      align: "right",
      sorter: (a, b) => a.valor_total - b.valor_total,
      render: (v: number) => <b style={{ color: brand.navy }}>{v.toFixed(2)}</b>,
    },
  ];

  return (
    <div>
      {/* KPIs */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic title="Total materiales" value={kpis.totalMateriales} prefix={<DatabaseOutlined style={{ color: brand.navy }} />} styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic title="Sin stock" value={kpis.sinStock} prefix={<WarningOutlined style={{ color: "#ff4d4f" }} />} styles={{ content: { color: "#ff4d4f" } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic title="Bajo stock" value={kpis.bajoStock} prefix={<WarningOutlined style={{ color: "#faad14" }} />} styles={{ content: { color: "#faad14" } }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card styles={{ body: { padding: 16 } }}>
            <Statistic title="Valor total" value={kpis.valorTotal} precision={2} prefix="$" styles={{ content: { color: brand.navy } }} />
          </Card>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Buscar código, descripción, N/P..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Select
              value={filtro}
              onChange={setFiltro}
              style={{ width: "100%" }}
              options={[
                { value: "todos", label: "Todos los materiales" },
                { value: "sin_stock", label: "Solo sin stock" },
                { value: "bajo_stock", label: "Solo bajo stock" },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={fetchData} block>
              Actualizar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="material_id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{ pageSize: 25, showTotal: (t) => `${t} materiales` }}
        scroll={{ x: 1600 }}
        size="small"
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 3: INGRESO DE POs (recepción)
// ════════════════════════════════════════════════════════════
function TabIngresoPO({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [pos, setPos] = useState<POPendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [poSeleccionada, setPoSeleccionada] = useState<POPendiente | null>(null);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compras/pendientes-ingreso");
      const json = await res.json();
      setPos(json.data ?? []);
    } catch {
      message.error("Error al cargar POs pendientes");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  const abrirRecibir = (po: POPendiente) => {
    setPoSeleccionada(po);
    // Por defecto, cantidades recibidas = cantidades pedidas
    const inicial: Record<number, number> = {};
    po.items.forEach((i) => { inicial[i.id] = i.cantidad; });
    setCantidadesRecibidas(inicial);
  };

  const confirmarIngreso = async () => {
    if (!poSeleccionada) return;
    const items = poSeleccionada.items
      .filter((i) => cantidadesRecibidas[i.id] > 0)
      .map((i) => ({
        material_id: i.material_id,
        cantidad: cantidadesRecibidas[i.id],
        observacion: `Recepción OC ${poSeleccionada.numero_po}`,
      }));

    if (items.length === 0) {
      message.warning("Ingresa al menos una cantidad");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/movimientos/ingreso-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: poSeleccionada.id,
          items,
          usuario: "Almacenero",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar ingreso");
      message.success(json.message);
      setPoSeleccionada(null);
      await fetchPOs();
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {pos.length === 0 && !loading && (
        <Alert type="info" title="No hay órdenes de compra pendientes de recepción" showIcon />
      )}

      <Row gutter={[12, 12]}>
        {pos.map((po) => (
          <Col xs={24} md={12} lg={8} key={po.id}>
            <Card
              title={
                <Space>
                  <Tag color={brand.navy}>{po.numero_po}</Tag>
                  <Tag color={po.estado === "Pendiente" ? "gold" : po.estado === "Aprobado" ? "blue" : "cyan"}>{po.estado}</Tag>
                </Space>
              }
              styles={{ body: { padding: 12 } }}
              extra={
                <Button type="primary" icon={<InboxOutlined />} size="small" onClick={() => abrirRecibir(po)}>
                  Recibir
                </Button>
              }
            >
              <div style={{ fontSize: 12 }}>
                <div><Text type="secondary">Proveedor:</Text> <b>{po.proveedor_nombre || "-"}</b></div>
                <div><Text type="secondary">Almacén:</Text> {po.almacen_nombre || "-"}</div>
                <div><Text type="secondary">F. Entrega:</Text> {po.fecha_entrega_esperada ? dayjs(po.fecha_entrega_esperada).format("DD/MM/YYYY") : "-"}</div>
                <div><Text type="secondary">Total:</Text> <b style={{ color: brand.navy }}>{po.moneda} {Number(po.total).toFixed(2)}</b></div>
                <Divider style={{ margin: "8px 0" }} />
                <div><Text type="secondary">{po.items.length} items a recibir</Text></div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Modal Recibir */}
      <Modal
        title={
          <Space>
            <InboxOutlined style={{ color: brand.cyan }} />
            Recibir OC — {poSeleccionada?.numero_po}
          </Space>
        }
        open={!!poSeleccionada}
        onCancel={() => setPoSeleccionada(null)}
        width={900}
        okText="Confirmar Recepción"
        onOk={confirmarIngreso}
        confirmLoading={submitting}
      >
        {poSeleccionada && (
          <>
            <Card size="small" style={{ background: brand.bgPage, marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}><Text type="secondary">Proveedor:</Text> <b>{poSeleccionada.proveedor_nombre}</b></Col>
                <Col span={12}><Text type="secondary">Almacén destino:</Text> <b>{poSeleccionada.almacen_nombre}</b></Col>
              </Row>
            </Card>

            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              title="Ajusta las cantidades si lo recibido no coincide con lo solicitado. Las entradas se crearán automáticamente."
            />

            <Table
              rowKey="id"
              pagination={false}
              size="small"
              dataSource={poSeleccionada.items}
              columns={[
                { title: "Código", dataIndex: "codigo", width: 100 },
                { title: "Descripción", dataIndex: "descripcion", ellipsis: true },
                { title: "Cant. Pedida", dataIndex: "cantidad", width: 100, align: "right" },
                {
                  title: "Cant. Recibida",
                  width: 130,
                  align: "right",
                  render: (_, r) => (
                    <InputNumber
                      min={0}
                      max={r.cantidad}
                      value={cantidadesRecibidas[r.id] ?? 0}
                      onChange={(v) => setCantidadesRecibidas({ ...cantidadesRecibidas, [r.id]: Number(v) || 0 })}
                      style={{ width: "100%" }}
                    />
                  ),
                },
                { title: "UM", dataIndex: "unidad_medida", width: 55, align: "center" },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 4: SALIDA (manual)
// ════════════════════════════════════════════════════════════
function TabSalida({ onRefresh }: { onRefresh: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [materiales, setMateriales] = useState<StockItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [matSel, setMatSel] = useState<StockItem | null>(null);

  const cargarMateriales = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const json = await res.json();
      setMateriales(json.data ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    cargarMateriales();
  }, [cargarMateriales]);

  const registrar = async (tipo: "SALIDA" | "ENTRADA" | "AJUSTE") => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const res = await fetch("/api/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id: values.material_id,
          tipo_movimiento: tipo,
          cantidad: values.cantidad,
          documento_referencia: values.documento_referencia,
          observacion: values.observacion,
          usuario: values.usuario || "Almacenero",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(`Movimiento ${tipo} registrado correctamente`);
      form.resetFields();
      setMatSel(null);
      await cargarMateriales();
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      if (!msg.includes("validation")) message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={14}>
        <Card title={<Space><PlusOutlined />Registrar movimiento manual</Space>}>
          <Form form={form} layout="vertical">
            <Form.Item
              label="Material"
              name="material_id"
              rules={[{ required: true, message: "Selecciona un material" }]}
            >
              <Select
                showSearch
                placeholder="Buscar por código o descripción..."
                optionFilterProp="label"
                onChange={(v) => {
                  const m = materiales.find((x) => x.material_id === v);
                  setMatSel(m || null);
                }}
                options={materiales.map((m) => ({
                  value: m.material_id,
                  label: `${m.codigo} — ${m.descripcion}`,
                }))}
              />
            </Form.Item>

            {matSel && (
              <Alert
                style={{ marginBottom: 12 }}
                type={matSel.alerta === "SIN" ? "error" : matSel.alerta === "BAJO" ? "warning" : "success"}
                showIcon
                title={
                  <Space>
                    <span>Stock actual: <b>{matSel.stock_actual}</b> {matSel.unidad_medida}</span>
                    {matSel.punto_reposicion > 0 && <span>| Pto. reposición: <b>{matSel.punto_reposicion}</b></span>}
                    {matSel.ubicacion && <span>| Ubicación: <b>{matSel.ubicacion}</b></span>}
                  </Space>
                }
              />
            )}

            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Cantidad"
                  name="cantidad"
                  rules={[{ required: true, message: "Ingresa la cantidad" }]}
                >
                  <InputNumber min={0.01} step={0.01} style={{ width: "100%" }} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Usuario" name="usuario" initialValue="Almacenero">
                  <Input placeholder="Nombre del usuario" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Documento de referencia" name="documento_referencia">
              <Input placeholder="OT-2026-001, OC-123, ajuste, etc." />
            </Form.Item>

            <Form.Item label="Observación" name="observacion">
              <TextArea rows={2} placeholder="Motivo del movimiento..." />
            </Form.Item>

            <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
              <Tooltip title="Reduce el stock (ej: entrega a taller)">
                <Button
                  danger
                  icon={<ArrowUpOutlined />}
                  loading={submitting}
                  onClick={() => registrar("SALIDA")}
                >
                  Registrar SALIDA
                </Button>
              </Tooltip>
              <Tooltip title="Aumenta el stock (ej: devolución de material)">
                <Button
                  icon={<ArrowDownOutlined />}
                  style={{ background: "#52c41a", color: "#fff", borderColor: "#52c41a" }}
                  loading={submitting}
                  onClick={() => registrar("ENTRADA")}
                >
                  Registrar ENTRADA
                </Button>
              </Tooltip>
              <Tooltip title="Fija el stock al valor indicado (ajuste de inventario)">
                <Button
                  icon={<SwapOutlined />}
                  type="primary"
                  loading={submitting}
                  onClick={() => registrar("AJUSTE")}
                >
                  Registrar AJUSTE
                </Button>
              </Tooltip>
            </Space>
          </Form>
        </Card>
      </Col>

      <Col xs={24} md={10}>
        <Card title={<Space><InfoCircleOutlined />Información</Space>}>
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Text strong style={{ color: "#cf1322" }}>⬆ SALIDA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Usa esta opción para entregar material a un taller, técnico u OT.
                El stock se reducirá en la cantidad indicada.
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: "#389e0d" }}>⬇ ENTRADA</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Úsala para registrar devoluciones o material recibido manualmente
                (sin una OC). Para recibir una OC completa usa la pestaña "Ingreso de POs".
              </div>
            </div>
            <Divider style={{ margin: 0 }} />
            <div>
              <Text strong style={{ color: brand.cyan }}>↔ AJUSTE</Text>
              <div style={{ fontSize: 12, color: "#666" }}>
                Fija el stock al valor exacto que indiques (inventario físico).
                Útil cuando el stock del sistema no coincide con lo físico.
              </div>
            </div>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function MovimientosPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const tabItems = [
    {
      key: "movimientos",
      label: (
        <Space>
          <FileDoneOutlined />
          Movimientos
        </Space>
      ),
      children: <TabMovimientos key={`mov-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "stock",
      label: (
        <Space>
          <DatabaseOutlined />
          Stock
        </Space>
      ),
      children: <TabStock key={`stock-${refreshKey}`} />,
    },
    {
      key: "ingreso",
      label: (
        <Space>
          <InboxOutlined />
          Ingreso de POs
        </Space>
      ),
      children: <TabIngresoPO key={`po-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
    {
      key: "salida",
      label: (
        <Space>
          <ExportOutlined />
          Salida / Manual
        </Space>
      ),
      children: <TabSalida key={`salida-${refreshKey}`} onRefresh={() => setRefreshKey((k) => k + 1)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ToolOutlined style={{ color: brand.cyan, marginRight: 8 }} />
          Movimientos de Inventario
        </Title>
      </div>

      <Tabs items={tabItems} defaultActiveKey="movimientos" />
    </div>
  );
}

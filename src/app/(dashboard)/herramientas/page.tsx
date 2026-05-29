"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Tabs, Table, Tag, Space, Button, Input, Select, Row, Col,
  Statistic, Popconfirm, Empty, Tooltip, Modal, Form, InputNumber, DatePicker, App, Badge,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, ToolOutlined,
  SendOutlined, RollbackOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { formatDateOnly } from "@/lib/dates";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns, filtroPorColumna,
  STICKY_HEADER, useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Herramienta {
  id: number;
  codigo: string;
  nombre: string;
  stock: number;
  asignadas: number;
  estado: string;
  createdAt: string;
  updatedAt: string;
}

interface Prestamo {
  id: number;
  herramienta_id: number;
  cantidad: number;
  prestado_a: string;
  trabajador_id: number | null;
  ot_id: number | null;
  fecha_entrega: string;
  fecha_devolucion_prevista: string | null;
  fecha_devolucion_real: string | null;
  estado: string;
  observaciones: string | null;
  usuario_entrega: string;
  usuario_recibe: string | null;
  herramienta: { id: number; codigo: string; nombre: string; stock: number; asignadas: number } | null;
  orden_trabajo: { id: number; ot: string | null } | null;
  trabajador: { trabajador_id: number; nombre: string; dni: string | null; area: string; puesto: string } | null;
}

interface TrabajadorOpt {
  trabajador_id: number;
  nombre: string;
  dni: string | null;
  area: string;
  puesto: string;
}

interface OTLookup {
  id: number;
  ot: number | null;
  descripcion: string | null;
  cliente: string | null;
}

const estadoColor: Record<string, string> = {
  Disponible: "green",
  Mantenimiento: "orange",
  Inactiva: "default",
  Reservada: "blue",
};

const estadoPrestamoColor: Record<string, string> = {
  PRESTADA: "blue",
  DEVUELTA: "green",
  VENCIDA: "red",
};

// ════════════════════════════════════════════════════════════
// TAB 1: CATÁLOGO DE HERRAMIENTAS
// ════════════════════════════════════════════════════════════
function TabCatalogo() {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [data, setData] = useState<Herramienta[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Herramienta | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { ocultas, setOcultas } = useColumnasOcultas("herramientas-cols-v1");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/herramientas?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      message.error("Error al cargar herramientas");
    } finally {
      setLoading(false);
    }
  }, [search, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ stock: 0, asignadas: 0, estado: "Disponible" });
    setModalOpen(true);
  };

  const openEdit = (h: Herramienta) => {
    setEditing(h);
    form.resetFields();
    form.setFieldsValue({
      codigo: h.codigo,
      nombre: h.nombre,
      stock: h.stock,
      asignadas: h.asignadas,
      estado: h.estado,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const url = editing ? `/api/herramientas/${editing.id}` : "/api/herramientas";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success(editing ? "Actualizada" : "Creada");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/herramientas/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) { message.error(json?.error || "Error al eliminar"); return; }
    message.success("Eliminada");
    fetchData();
  };

  const totalStock = data.reduce((s, h) => s + (h.stock || 0), 0);
  const totalAsignadas = data.reduce((s, h) => s + (h.asignadas || 0), 0);
  const disponibles = totalStock - totalAsignadas;

  const columns: ColumnsType<Herramienta> = [
    numeracionColumn<Herramienta>({ current: page, pageSize }),
    { key: "codigo", title: "Código", dataIndex: "codigo", width: 120, ...filtroPorColumna(data, "codigo"), sorter: (a, b) => a.codigo.localeCompare(b.codigo) },
    { key: "nombre", title: "Nombre", dataIndex: "nombre", ellipsis: true, ...filtroPorColumna(data, "nombre") },
    {
      key: "stock", title: "Stock", dataIndex: "stock", width: 90, align: "right",
      sorter: (a, b) => a.stock - b.stock,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      key: "asignadas", title: "Asignadas", dataIndex: "asignadas", width: 100, align: "right",
      sorter: (a, b) => a.asignadas - b.asignadas,
      render: (v: number) => <Tag color="orange">{v}</Tag>,
    },
    {
      key: "disponibles", title: "Disponibles", width: 100, align: "right",
      render: (_, h) => {
        const d = h.stock - h.asignadas;
        return <Tag color={d > 0 ? "green" : "red"}>{d}</Tag>;
      },
    },
    {
      key: "estado", title: "Estado", dataIndex: "estado", width: 130,
      filters: ["Disponible", "Mantenimiento", "Inactiva", "Reservada"].map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => <Tag color={estadoColor[v] || "default"}>{v}</Tag>,
    },
    {
      key: "acciones", title: "Acciones", width: 110, fixed: "right", align: "center",
      render: (_, h) => (
        <Space size={0}>
          <Tooltip title="Editar"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(h)} /></Tooltip>
          <Popconfirm title={`¿Eliminar ${h.codigo}?`} onConfirm={() => handleDelete(h.id)} okText="Eliminar" cancelText="Cancelar">
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<Herramienta>(columns, "herramientas-catalogo-cols-widths-v1");

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card><Statistic title="Total herramientas" value={data.length} prefix={<ToolOutlined style={{ color: brand.navy }} />} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Stock total" value={totalStock} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Asignadas" value={totalAsignadas} styles={{ content: { color: "#fa8c16" } }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Disponibles" value={disponibles} styles={{ content: { color: disponibles > 0 ? "#52c41a" : "#cf1322" } }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={12}>
            <Input placeholder="Buscar (código, nombre)..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
          </Col>
          <Col xs={12} md={6}><Button block icon={<ReloadOutlined />} onClick={fetchData}>Actualizar</Button></Col>
          <Col xs={12} md={6}><Button block type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva herramienta</Button></Col>
        </Row>
      </Card>

      <Card size="small" extra={<ColumnasToggleButton<Herramienta> columns={columns} ocultas={ocultas} setOcultas={setOcultas} obligatorias={["__num", "codigo", "acciones"]} />}>
        <Table<Herramienta>
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={data}
          loading={loading}
          size="small"
          sticky={STICKY_HEADER}
          pagination={paginacionEstandar({
            current: page, pageSize, total: data.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "herramientas",
          })}
        />
      </Card>

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nueva herramienta"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Guardar"
        cancelText="Cancelar"
        width={modalWidth(screens, 520)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="codigo" label="Código" rules={[{ required: true, max: 20 }]}>
            <Input placeholder="HER-001" />
          </Form.Item>
          <Form.Item name="nombre" label="Nombre" rules={[{ required: true, max: 100 }]}>
            <Input placeholder="Llave de impacto 3/4" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="stock" label="Stock" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="asignadas" label="Asignadas">
                <InputNumber min={0} style={{ width: "100%" }} disabled />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="estado" label="Estado">
                <Select options={["Disponible", "Mantenimiento", "Inactiva", "Reservada"].map((v) => ({ value: v, label: v }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// TAB 2: PRÉSTAMOS
// ════════════════════════════════════════════════════════════
function TabPrestamos() {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [data, setData] = useState<Prestamo[]>([]);
  const [herramientas, setHerramientas] = useState<Herramienta[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const { ocultas, setOcultas } = useColumnasOcultas("prestamos-her-cols-v1");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [devolverModal, setDevolverModal] = useState<Prestamo | null>(null);
  const [devolverForm] = Form.useForm();
  const [otOpts, setOtOpts] = useState<OTLookup[]>([]);
  const [otSearchTimer, setOtSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set("estado", filtroEstado);
      const [presRes, herRes, trabRes] = await Promise.all([
        fetch(`/api/prestamos-herramientas?${params}`),
        fetch(`/api/herramientas?limit=10000`),
        fetch(`/api/trabajadores?limit=10000&activos=true`),
      ]);
      const presJ = await presRes.json();
      const herJ = await herRes.json();
      const trabJ = await trabRes.json();
      setData(presJ.data ?? []);
      setHerramientas(herJ.data ?? []);
      setTrabajadores(trabJ.data ?? []);
    } catch {
      message.error("Error al cargar préstamos");
    } finally {
      setLoading(false);
    }
  }, [filtroEstado, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [destinoExterno, setDestinoExterno] = useState(false);

  // Búsqueda de OTs con debounce (mismo patrón que /suministros).
  const buscarOTs = useCallback((q: string) => {
    if (otSearchTimer) clearTimeout(otSearchTimer);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ordenes-trabajo/lookup?q=${encodeURIComponent(q)}&limit=50`);
        if (!res.ok) return;
        const j = await res.json();
        setOtOpts(j.data ?? []);
      } catch { /* ignore */ }
    }, 250);
    setOtSearchTimer(t);
  }, [otSearchTimer]);

  // Precarga inicial al abrir el modal.
  const precargarOTs = useCallback(async () => {
    try {
      const res = await fetch("/api/ordenes-trabajo/lookup?limit=50");
      if (!res.ok) return;
      const j = await res.json();
      setOtOpts(j.data ?? []);
    } catch { /* ignore */ }
  }, []);

  const openNuevo = () => {
    form.resetFields();
    form.setFieldsValue({ cantidad: 1, fecha_entrega: dayjs() });
    setDestinoExterno(false);
    precargarOTs();
    setModalOpen(true);
  };

  const handleCrear = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: Record<string, unknown> = {
        herramienta_id: values.herramienta_id,
        cantidad: values.cantidad,
        ot_id: values.ot_id ?? null,
        fecha_entrega: (values.fecha_entrega as Dayjs).format("YYYY-MM-DD"),
        fecha_devolucion_prevista: values.fecha_devolucion_prevista ? (values.fecha_devolucion_prevista as Dayjs).format("YYYY-MM-DD") : null,
        observaciones: values.observaciones ?? null,
      };
      if (destinoExterno) {
        payload.prestado_a = values.prestado_a_libre;
      } else {
        payload.trabajador_id = values.trabajador_id;
      }
      const res = await fetch("/api/prestamos-herramientas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Préstamo registrado");
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const abrirDevolver = (p: Prestamo) => {
    devolverForm.resetFields();
    devolverForm.setFieldsValue({ fecha_devolucion_real: dayjs() });
    setDevolverModal(p);
  };

  const handleDevolver = async () => {
    if (!devolverModal) return;
    try {
      const values = await devolverForm.validateFields();
      setSaving(true);
      const payload = {
        fecha_devolucion_real: (values.fecha_devolucion_real as Dayjs).format("YYYY-MM-DD"),
        observaciones: values.observaciones || null,
      };
      const res = await fetch(`/api/prestamos-herramientas/${devolverModal.id}/devolver`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      message.success("Préstamo devuelto");
      setDevolverModal(null);
      fetchData();
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPrestadas = data.filter((p) => p.estado === "PRESTADA").length;
  const totalDevueltas = data.filter((p) => p.estado === "DEVUELTA").length;
  const vencidas = useMemo(
    () => data.filter((p) => p.estado === "PRESTADA" && p.fecha_devolucion_prevista && dayjs(p.fecha_devolucion_prevista).isBefore(dayjs(), "day")).length,
    [data],
  );

  const columns: ColumnsType<Prestamo> = [
    numeracionColumn<Prestamo>({ current: page, pageSize }),
    {
      key: "estado", title: "Estado", dataIndex: "estado", width: 110,
      filters: [
        { text: "PRESTADA", value: "PRESTADA" },
        { text: "DEVUELTA", value: "DEVUELTA" },
        { text: "VENCIDA", value: "VENCIDA" },
      ],
      onFilter: (value, r) => r.estado === value,
      render: (v: string) => <Tag color={estadoPrestamoColor[v] || "default"}>{v}</Tag>,
    },
    {
      key: "herramienta", title: "Herramienta", width: 220, ellipsis: true,
      render: (_, p) => p.herramienta ? `${p.herramienta.codigo} — ${p.herramienta.nombre}` : "—",
    },
    {
      key: "cantidad", title: "Cant.", dataIndex: "cantidad", width: 70, align: "center",
      sorter: (a, b) => a.cantidad - b.cantidad,
    },
    {
      key: "prestado_a", title: "Prestado a", width: 220, ellipsis: true,
      ...filtroPorColumna(data, "prestado_a"),
      render: (_, p) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {p.prestado_a}
            {p.trabajador_id ? (
              <Tag color="cyan" style={{ marginLeft: 6, fontSize: 9 }}>Trabajador</Tag>
            ) : (
              <Tag color="default" style={{ marginLeft: 6, fontSize: 9 }}>Externo</Tag>
            )}
          </div>
          {p.trabajador && (
            <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)" }}>
              {p.trabajador.area} · {p.trabajador.puesto}
              {p.trabajador.dni && ` · DNI ${p.trabajador.dni}`}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "ot", title: "OT", width: 100,
      render: (_, p) => p.orden_trabajo?.ot ? <Tag>{p.orden_trabajo.ot}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "fecha_entrega", title: "F. Entrega", dataIndex: "fecha_entrega", width: 110,
      render: (v: string) => formatDateOnly(v),
    },
    {
      key: "fecha_devolucion_prevista", title: "F. Devol. Prevista", dataIndex: "fecha_devolucion_prevista", width: 120,
      render: (v: string | null, p) => {
        if (!v) return <Text type="secondary">—</Text>;
        const vencida = p.estado === "PRESTADA" && dayjs(v).isBefore(dayjs(), "day");
        return <span style={{ color: vencida ? "#cf1322" : undefined, fontWeight: vencida ? 600 : undefined }}>{formatDateOnly(v)}</span>;
      },
    },
    {
      key: "fecha_devolucion_real", title: "F. Devol. Real", dataIndex: "fecha_devolucion_real", width: 120,
      render: (v: string | null) => v ? formatDateOnly(v) : <Text type="secondary">—</Text>,
    },
    { key: "usuario_entrega", title: "Entrega (usr.)", dataIndex: "usuario_entrega", width: 130, ellipsis: true },
    {
      key: "acciones", title: "Acciones", width: 110, fixed: "right", align: "center",
      render: (_, p) => p.estado === "PRESTADA" ? (
        <Tooltip title="Devolver">
          <Button size="small" type="primary" icon={<RollbackOutlined />} onClick={() => abrirDevolver(p)}>Devolver</Button>
        </Tooltip>
      ) : <Tag color="green" style={{ margin: 0 }}>Devuelta</Tag>,
    },
  ];

  const { columnas: columnsResizable, components: tableComponents } =
    useColumnasRedimensionables<Prestamo>(columns, "herramientas-prestamos-cols-widths-v1");

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card><Statistic title="Prestadas" value={totalPrestadas} prefix={<ClockCircleOutlined style={{ color: "#1890ff" }} />} styles={{ content: { color: "#1890ff" } }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Vencidas" value={vencidas} prefix={<WarningOutlined style={{ color: "#cf1322" }} />} styles={{ content: { color: vencidas > 0 ? "#cf1322" : "#bfbfbf" } }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Devueltas" value={totalDevueltas} prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Total" value={data.length} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={8}>
            <Select placeholder="Filtrar por estado" value={filtroEstado} onChange={setFiltroEstado} allowClear style={{ width: "100%" }}
              options={[
                { value: "PRESTADA", label: "Prestadas" },
                { value: "DEVUELTA", label: "Devueltas" },
              ]} />
          </Col>
          <Col xs={12} md={6}><Button block icon={<ReloadOutlined />} onClick={fetchData}>Actualizar</Button></Col>
          <Col xs={12} md={10}><Button block type="primary" icon={<SendOutlined />} onClick={openNuevo}>Nuevo préstamo</Button></Col>
        </Row>
      </Card>

      <Card size="small" extra={<ColumnasToggleButton<Prestamo> columns={columns} ocultas={ocultas} setOcultas={setOcultas} obligatorias={["__num", "estado", "herramienta", "acciones"]} />}>
        {data.length === 0 ? (
          <Empty description="Sin préstamos." />
        ) : (
          <Table<Prestamo>
            rowKey="id"
            columns={visibleColumns(columnsResizable, ocultas)}
            components={tableComponents}
            dataSource={data}
            loading={loading}
            size="small"
            sticky={STICKY_HEADER}
            scroll={{ x: 1500 }}
            pagination={paginacionEstandar({
              current: page, pageSize, total: data.length,
              onChange: (p, s) => { setPage(p); setPageSize(s); },
              label: "préstamos",
            })}
          />
        )}
      </Card>

      {/* Modal nuevo préstamo */}
      <Modal
        title="Nuevo préstamo de herramienta"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCrear}
        confirmLoading={saving}
        okText="Registrar"
        cancelText="Cancelar"
        width={modalWidth(screens, 620)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="herramienta_id" label="Herramienta" rules={[{ required: true }]}>
            <Select
              showSearch optionFilterProp="label"
              placeholder="Buscá por código o nombre"
              options={herramientas
                .filter((h) => (h.stock - h.asignadas) > 0)
                .map((h) => ({
                  value: h.id,
                  label: `${h.codigo} — ${h.nombre} (disp: ${h.stock - h.asignadas})`,
                }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>
                  Prestado a {!destinoExterno && <span style={{ color: brand.error }}>*</span>}
                </Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setDestinoExterno(!destinoExterno)}
                  style={{ padding: 0 }}
                >
                  {destinoExterno ? "← Elegir trabajador del catálogo" : "Otro / externo →"}
                </Button>
              </div>
              {!destinoExterno ? (
                <Form.Item
                  name="trabajador_id"
                  rules={[{ required: !destinoExterno, message: "Seleccioná un trabajador" }]}
                  style={{ marginBottom: 12 }}
                >
                  <Select
                    showSearch
                    placeholder="Escribí para buscar (nombre, DNI, puesto, área)..."
                    optionFilterProp="label"
                    filterOption={(input, option) => {
                      const label = (option?.label ?? "").toString().toLowerCase();
                      return label.includes(input.toLowerCase());
                    }}
                    options={trabajadores.map((t) => ({
                      value: t.trabajador_id,
                      // El label concatena todos los campos buscables (filtra contra cualquiera).
                      label: `${t.nombre}${t.dni ? ` · DNI ${t.dni}` : ""} · ${t.area} · ${t.puesto}`,
                    }))}
                    notFoundContent={trabajadores.length === 0 ? "Cargando..." : "Sin resultados"}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="prestado_a_libre"
                  rules={[{ required: destinoExterno, message: "Indicá un nombre" }]}
                  style={{ marginBottom: 12 }}
                >
                  <Input placeholder="Nombre libre (cuadrilla externa, contratista, etc.)" maxLength={100} />
                </Form.Item>
              )}
            </Col>
          </Row>
          <Form.Item name="ot_id" label="OT asociada (opcional)" extra="Buscá por número de OT, cliente o descripción.">
            <Select
              showSearch allowClear
              placeholder="Buscar OT por número, cliente o descripción..."
              optionFilterProp="label"
              filterOption={false}
              onSearch={(q) => { if (q) buscarOTs(q); }}
              options={otOpts.map((o) => ({
                value: o.id,
                label: `${o.ot ?? "?"} — ${o.cliente ?? "—"} — ${o.descripcion ?? ""}`.slice(0, 90),
              }))}
              notFoundContent="Escribí para buscar"
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha_entrega" label="Fecha entrega" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fecha_devolucion_prevista" label="Devolución prevista">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal devolver */}
      <Modal
        title={`Devolver: ${devolverModal?.herramienta?.codigo ?? ""} — ${devolverModal?.herramienta?.nombre ?? ""}`}
        open={!!devolverModal}
        onCancel={() => setDevolverModal(null)}
        onOk={handleDevolver}
        confirmLoading={saving}
        okText="Confirmar devolución"
        cancelText="Cancelar"
        width={modalWidth(screens, 520)}
      >
        {devolverModal && (
          <>
            <p style={{ marginBottom: 12 }}>
              Cantidad: <b>{devolverModal.cantidad}</b> — Prestado a: <b>{devolverModal.prestado_a}</b>
            </p>
            <Form form={devolverForm} layout="vertical">
              <Form.Item name="fecha_devolucion_real" label="Fecha de devolución" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="observaciones" label="Observaciones (estado al devolver, daños...)">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════
export default function HerramientasPage() {
  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        <ToolOutlined style={{ marginRight: 8 }} />
        Herramientas
      </Title>
      <Tabs
        defaultActiveKey="catalogo"
        items={[
          { key: "catalogo", label: <span><ToolOutlined /> Catálogo</span>, children: <TabCatalogo /> },
          { key: "prestamos", label: <span><SendOutlined /> Préstamos</span>, children: <TabPrestamos /> },
        ]}
      />
    </div>
  );
}

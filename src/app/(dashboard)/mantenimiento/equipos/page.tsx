"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Col,
  Card,
  DatePicker,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
} from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title } = Typography;
const { TextArea } = Input;

interface EquipoRecord {
  equipo_id: number;
  codigo: string;
  descripcion: string;
  status_codigo: string;
  area_codigo: string;
  sub_area_codigo: string | null;
  tipo_codigo: string;
  fecha_inicio: string | null;
  fecha_fabricacion: string | null;
  fabricante_codigo: string | null;
  modelo: string | null;
  numero_serie: string | null;
  numero_parte: string | null;
  capacidad: string | null;
  unidad_medida_codigo: string | null;
  observaciones: string | null;
  planta_codigo: string;
  criticidad_codigo: string | null;
  precio: number | null;
  moneda_codigo: string | null;
  ubicacion_codigo: string | null;
  cantidad: number;
  usuario_responsable: string | null;
  status: { nombre: string };
  area: { nombre: string };
  sub_area: { nombre: string } | null;
  tipo: { nombre: string };
  fabricante: { nombre: string } | null;
  unidad_medida: { nombre: string; abreviatura?: string } | null;
  planta: { nombre: string };
  criticidad: { nombre: string; nivel?: number } | null;
  ubicacion: { nombre: string } | null;
  moneda: { simbolo: string } | null;
}

interface Option {
  codigo: string;
  nombre: string;
}

interface MonedaOption {
  codigo: string;
  nombre: string;
  simbolo?: string;
}

const statusColors: Record<string, string> = {
  OPE: "green",
  INO: "red",
  REP: "orange",
  STD: "blue",
  BAJ: "default",
};

const criticidadColors: Record<string, string> = {
  "1": "red",
  "2": "orange",
  "3": "green",
};

export default function EquiposPage() {
  const { data: session } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const [data, setData] = useState<EquipoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCriticidad, setFilterCriticidad] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("equipos-list-cols-v1");

  // Catálogos
  const [tipos, setTipos] = useState<Option[]>([]);
  const [areas, setAreas] = useState<Option[]>([]);
  const [subAreas, setSubAreas] = useState<Option[]>([]);
  const [statuses, setStatuses] = useState<Option[]>([]);
  const [plantas, setPlantas] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  const [fabricantes, setFabricantes] = useState<Option[]>([]);
  const [criticidades, setCriticidades] = useState<Option[]>([]);
  const [monedas, setMonedas] = useState<MonedaOption[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Option[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EquipoRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search) params.set("search", search);
    if (filterTipo) params.set("tipo", filterTipo);
    if (filterArea) params.set("area", filterArea);
    if (filterStatus) params.set("status", filterStatus);
    if (filterCriticidad) params.set("criticidad", filterCriticidad);

    const res = await fetch(`/api/equipos?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterTipo, filterArea, filterStatus, filterCriticidad]);

  useEffect(() => {
    async function loadCatalogs() {
      const endpoints = [
        { url: "/api/catalogos?tabla=tipoEquipo", setter: setTipos },
        { url: "/api/catalogos?tabla=area", setter: setAreas },
        { url: "/api/catalogos?tabla=subArea", setter: setSubAreas },
        { url: "/api/catalogos?tabla=statusEquipo", setter: setStatuses },
        { url: "/api/catalogos?tabla=planta", setter: setPlantas },
        { url: "/api/catalogos?tabla=unidadMedida", setter: setUnidades },
        { url: "/api/catalogos?tabla=fabricante", setter: setFabricantes },
        { url: "/api/catalogos?tabla=criticidad", setter: setCriticidades },
        { url: "/api/catalogos?tabla=moneda", setter: setMonedas },
        { url: "/api/catalogos?tabla=ubicacion", setter: setUbicaciones },
      ];
      await Promise.all(
        endpoints.map(async ({ url, setter }) => {
          const res = await fetch(url);
          if (res.ok) setter((await res.json()).data ?? []);
        })
      );
    }
    loadCatalogs();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: EquipoRecord) {
    setEditing(record);
    form.setFieldsValue({
      codigo: record.codigo,
      descripcion: record.descripcion,
      status_codigo: record.status_codigo,
      area_codigo: record.area_codigo,
      sub_area_codigo: record.sub_area_codigo,
      tipo_codigo: record.tipo_codigo,
      fecha_inicio: record.fecha_inicio ? dayjs(record.fecha_inicio) : null,
      fecha_fabricacion: record.fecha_fabricacion ? dayjs(record.fecha_fabricacion) : null,
      fabricante_codigo: record.fabricante_codigo,
      modelo: record.modelo,
      numero_serie: record.numero_serie,
      numero_parte: record.numero_parte,
      capacidad: record.capacidad,
      unidad_medida_codigo: record.unidad_medida_codigo,
      observaciones: record.observaciones,
      planta_codigo: record.planta_codigo,
      criticidad_codigo: record.criticidad_codigo,
      precio: record.precio ? Number(record.precio) : null,
      moneda_codigo: record.moneda_codigo,
      ubicacion_codigo: record.ubicacion_codigo,
      cantidad: record.cantidad,
      usuario_responsable: record.usuario_responsable,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        fecha_inicio: values.fecha_inicio ? values.fecha_inicio.format("YYYY-01-01") : null,
        fecha_fabricacion: values.fecha_fabricacion ? values.fecha_fabricacion.format("YYYY-01-01") : null,
      };

      const url = editing ? `/api/equipos/${editing.equipo_id}` : "/api/equipos";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }

      messageApi.success(editing ? "Equipo actualizado" : "Equipo creado");
      setModalOpen(false);
      fetchData();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDesactivar(id: number) {
    const res = await fetch(`/api/equipos/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Equipo desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/equipos/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Equipo eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<EquipoRecord> = [
    numeracionColumn<EquipoRecord>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 100,
      fixed: "left",
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    { key: "descripcion", title: "Descripción", dataIndex: "descripcion", width: 220, ellipsis: true, sorter: (a: EquipoRecord, b: EquipoRecord) => a.descripcion.localeCompare(b.descripcion), ...filtroPorColumna(data, "descripcion") },
    {
      key: "status_codigo",
      title: "Estado",
      dataIndex: "status_codigo",
      width: 100,
      sorter: (a, b) => (a.status?.nombre ?? "").localeCompare(b.status?.nombre ?? ""),
      render: (v: string, r: EquipoRecord) => (
        <Tag color={statusColors[v] ?? "default"}>{r.status?.nombre ?? v}</Tag>
      ),
    },
    {
      key: "tipo_codigo",
      title: "Tipo",
      dataIndex: "tipo_codigo",
      width: 110,
      sorter: (a, b) => (a.tipo?.nombre ?? "").localeCompare(b.tipo?.nombre ?? ""),
      render: (_: string, r: EquipoRecord) => r.tipo?.nombre ?? r.tipo_codigo,
    },
    {
      key: "area_codigo",
      title: "Área",
      dataIndex: "area_codigo",
      width: 120,
      sorter: (a, b) => (a.area?.nombre ?? "").localeCompare(b.area?.nombre ?? ""),
      render: (_: string, r: EquipoRecord) => r.area?.nombre ?? r.area_codigo,
    },
    {
      key: "sub_area_codigo",
      title: "Sub Área",
      dataIndex: "sub_area_codigo",
      width: 110,
      sorter: (a, b) => (a.sub_area?.nombre ?? "").localeCompare(b.sub_area?.nombre ?? ""),
      render: (_: string, r: EquipoRecord) => r.sub_area?.nombre ?? r.sub_area_codigo ?? "-",
    },
    {
      key: "fabricante_codigo",
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 150,
      ellipsis: true,
      sorter: (a, b) => (a.fabricante?.nombre ?? "").localeCompare(b.fabricante?.nombre ?? ""),
      render: (_: string, r: EquipoRecord) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "-",
    },
    { key: "modelo", title: "Modelo", dataIndex: "modelo", width: 120, ellipsis: true, sorter: (a: EquipoRecord, b: EquipoRecord) => (a.modelo ?? "").localeCompare(b.modelo ?? ""), ...filtroPorColumna(data, "modelo"), render: (v: string | null) => v ?? "-" },
    { key: "numero_serie", title: "N/S", dataIndex: "numero_serie", width: 130, ellipsis: true, ...filtroPorColumna(data, "numero_serie"), render: (v: string | null) => v ?? "-" },
    {
      key: "capacidad",
      title: "Capacidad",
      width: 100,
      render: (_: unknown, r: EquipoRecord) => {
        if (!r.capacidad) return "-";
        const und = r.unidad_medida?.abreviatura ?? r.unidad_medida_codigo ?? "";
        return `${r.capacidad} ${und}`;
      },
    },
    {
      key: "criticidad_codigo",
      title: "Criticidad",
      dataIndex: "criticidad_codigo",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.criticidad_codigo ?? "").localeCompare(b.criticidad_codigo ?? ""),
      render: (v: string | null, r: EquipoRecord) => {
        if (!v) return "-";
        return <Tag color={criticidadColors[v] ?? "default"}>{r.criticidad?.nombre ?? v}</Tag>;
      },
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 110,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      render: (v: number | null, r: EquipoRecord) => {
        if (v == null) return "-";
        const sym = r.moneda?.simbolo ?? "$";
        return `${sym} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      },
    },
    { key: "cantidad", title: "Cant.", dataIndex: "cantidad", width: 60, align: "center", sorter: (a: EquipoRecord, b: EquipoRecord) => a.cantidad - b.cantidad },
    {
      key: "planta_codigo",
      title: "Planta",
      dataIndex: "planta_codigo",
      width: 90,
      sorter: (a, b) => (a.planta?.nombre ?? "").localeCompare(b.planta?.nombre ?? ""),
      render: (_: string, r: EquipoRecord) => r.planta?.nombre ?? r.planta_codigo,
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 100,
      align: "center",
      fixed: "right",
      render: (_: unknown, record: EquipoRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este equipo?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.equipo_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.equipo_id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Eliminar permanentemente" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Equipos y Herramientas
        </Title>
        <Space>
          <ColumnasToggleButton<EquipoRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <ExportarExcelButton<EquipoRecord>
            endpoint="/api/equipos"
            filename="Equipos"
            columns={[
              { label: "Código", value: (r) => r.codigo },
              { label: "Descripción", value: (r) => r.descripcion },
              { label: "Status", value: (r) => r.status?.nombre ?? r.status_codigo },
              { label: "Tipo", value: (r) => r.tipo?.nombre ?? r.tipo_codigo },
              { label: "Planta", value: (r) => r.planta?.nombre ?? r.planta_codigo },
              { label: "Área", value: (r) => r.area?.nombre ?? r.area_codigo },
              { label: "Sub-área", value: (r) => r.sub_area?.nombre ?? r.sub_area_codigo ?? "" },
              { label: "Fabricante", value: (r) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "" },
              { label: "Modelo", value: (r) => r.modelo ?? "" },
              { label: "Nº Serie", value: (r) => r.numero_serie ?? "" },
              { label: "Nº Parte", value: (r) => r.numero_parte ?? "" },
              { label: "Capacidad", value: (r) => r.capacidad ?? "" },
              { label: "UM Capacidad", value: (r) => r.unidad_medida?.abreviatura ?? r.unidad_medida_codigo ?? "" },
              { label: "Criticidad", value: (r) => r.criticidad?.nombre ?? r.criticidad_codigo ?? "" },
              { label: "Cantidad", value: (r) => r.cantidad },
              { label: "Precio", value: (r) => r.precio != null ? Number(r.precio) : "" },
              { label: "Moneda", value: (r) => r.moneda_codigo ?? "" },
              { label: "Ubicación", value: (r) => r.ubicacion?.nombre ?? r.ubicacion_codigo ?? "" },
              { label: "Responsable", value: (r) => r.usuario_responsable ?? "" },
              { label: "Fecha inicio", value: (r) => r.fecha_inicio ?? "" },
              { label: "Fecha fabricación", value: (r) => r.fecha_fabricacion ?? "" },
              { label: "Observaciones", value: (r) => r.observaciones ?? "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo Equipo
          </Button>
        </Space>
      </div>

      {/* Filtros */}
      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Buscar código, descripción, modelo, N/S..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={filterTipo || undefined}
              onChange={(v) => { setFilterTipo(v ?? ""); setPage(1); }}
              options={tipos.map((t) => ({ value: t.codigo, label: t.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Área"
              allowClear
              style={{ width: "100%" }}
              value={filterArea || undefined}
              onChange={(v) => { setFilterArea(v ?? ""); setPage(1); }}
              options={areas.map((a) => ({ value: a.codigo, label: a.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Estado"
              allowClear
              style={{ width: "100%" }}
              value={filterStatus || undefined}
              onChange={(v) => { setFilterStatus(v ?? ""); setPage(1); }}
              options={statuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Criticidad"
              allowClear
              style={{ width: "100%" }}
              value={filterCriticidad || undefined}
              onChange={(v) => { setFilterCriticidad(v ?? ""); setPage(1); }}
              options={criticidades.map((c) => ({ value: c.codigo, label: c.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch("");
                setFilterTipo("");
                setFilterArea("");
                setFilterStatus("");
                setFilterCriticidad("");
                setPage(1);
              }}
            >
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="equipo_id"
        columns={visibleColumns(columns, ocultas)}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "equipos",
        })}
        scroll={{ x: 1800 }}
        size="small"
      />

      {/* Modal Crear / Editar */}
      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Equipo"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={900}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="codigo" label="Código" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="MAQ001" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerido" }]}>
                <Input />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item name="status_codigo" label="Estado" rules={[{ required: true, message: "Requerido" }]} initialValue="OPE">
                <Select options={statuses.map((s) => ({ value: s.codigo, label: `${s.codigo} - ${s.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="tipo_codigo" label="Tipo" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={tipos.map((t) => ({ value: t.codigo, label: `${t.codigo} - ${t.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="area_codigo" label="Área" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={areas.map((a) => ({ value: a.codigo, label: `${a.codigo} - ${a.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="sub_area_codigo" label="Sub Área">
                <Select allowClear options={subAreas.map((s) => ({ value: s.codigo, label: `${s.codigo} - ${s.nombre}` }))} />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item name="planta_codigo" label="Planta" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={plantas.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select allowClear showSearch optionFilterProp="label"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="modelo" label="Modelo">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="numero_serie" label="N/S (Serie)">
                <Input />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item name="numero_parte" label="N/P (Parte)">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="capacidad" label="Capacidad">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="unidad_medida_codigo" label="Und. Medida">
                <Select allowClear options={unidades.map((u) => ({ value: u.codigo, label: `${u.codigo} - ${u.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="criticidad_codigo" label="Criticidad">
                <Select allowClear options={criticidades.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>

            <Col span={6}>
              <Form.Item name="fecha_inicio" label="Año de Inicio">
                <DatePicker picker="year" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fecha_fabricacion" label="Año de Fabricación">
                <DatePicker picker="year" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="precio" label="Precio">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda_codigo" label="Moneda" initialValue="USD">
                <Select allowClear options={monedas.map((m) => ({ value: m.codigo, label: `${m.codigo} - ${m.nombre}` }))} />
              </Form.Item>
            </Col>

            <Col span={4}>
              <Form.Item name="cantidad" label="Cantidad" initialValue={1}>
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="ubicacion_codigo" label="Ubicación">
                <Select allowClear showSearch optionFilterProp="label"
                  options={ubicaciones.map((u) => ({ value: u.codigo, label: `${u.codigo} - ${u.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="usuario_responsable" label="Responsable">
                <Input />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="observaciones" label="Observaciones">
                <TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

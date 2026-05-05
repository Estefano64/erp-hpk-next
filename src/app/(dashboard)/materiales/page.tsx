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
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
} from "@/lib/tables";

const { Title } = Typography;

interface MaterialRecord {
  material_id: number;
  codigo: string;
  descripcion: string;
  planta_codigo: string;
  area_codigo: string;
  categoria_codigo: string;
  clasificacion_codigo: string;
  punto_reposicion: number | null;
  stock_maximo: number | null;
  unidad_medida_codigo: string;
  plazo_entrega: number | null;
  precio: number | null;
  moneda_codigo: string | null;
  fabricante_codigo: string | null;
  np: string | null;
  modelo: string | null;
  caja: string | null;
  stock_actual: number | null;
  ubicacion: string | null;
  planta: { nombre: string };
  area: { nombre: string };
  categoria: { nombre: string };
  clasificacion: { nombre: string };
  unidad_medida: { nombre: string; abreviatura?: string };
  moneda: { simbolo: string } | null;
  fabricante: { nombre: string } | null;
}

interface Option {
  codigo: string;
  nombre: string;
}

export default function MaterialesPage() {
  const { data: session } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const [data, setData] = useState<MaterialRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterPlanta, setFilterPlanta] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterClasificacion, setFilterClasificacion] = useState("");
  const [filterFab, setFilterFab] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("materiales-list-cols-v1");

  // Opciones para selects
  const [plantas, setPlantas] = useState<Option[]>([]);
  const [areas, setAreas] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [clasificaciones, setClasificaciones] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  const [monedas, setMonedas] = useState<Option[]>([]);
  const [fabricantes, setFabricantes] = useState<Option[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    if (search) params.set("search", search);
    if (filterPlanta) params.set("planta", filterPlanta);
    if (filterArea) params.set("area", filterArea);
    if (filterCategoria) params.set("categoria", filterCategoria);
    if (filterClasificacion) params.set("clasificacion", filterClasificacion);
    if (filterFab) params.set("fabricante", filterFab);

    const res = await fetch(`/api/materiales?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterPlanta, filterArea, filterCategoria, filterClasificacion, filterFab]);

  useEffect(() => {
    async function loadOptions() {
      const endpoints = [
        { url: "/api/catalogos?tabla=planta", setter: setPlantas },
        { url: "/api/catalogos?tabla=area", setter: setAreas },
        { url: "/api/catalogos?tabla=categoria", setter: setCategorias },
        { url: "/api/catalogos?tabla=clasificacion", setter: setClasificaciones },
        { url: "/api/catalogos?tabla=unidadMedida", setter: setUnidades },
        { url: "/api/catalogos?tabla=moneda", setter: setMonedas },
        { url: "/api/catalogos?tabla=fabricante", setter: setFabricantes },
      ];
      await Promise.all(
        endpoints.map(async ({ url, setter }) => {
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            setter(json.data ?? []);
          }
        })
      );
    }
    loadOptions();
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: MaterialRecord) {
    setEditing(record);
    form.setFieldsValue({
      descripcion: record.descripcion,
      planta_codigo: record.planta_codigo,
      area_codigo: record.area_codigo,
      categoria_codigo: record.categoria_codigo,
      clasificacion_codigo: record.clasificacion_codigo,
      unidad_medida_codigo: record.unidad_medida_codigo,
      plazo_entrega: record.plazo_entrega,
      precio: record.precio ? Number(record.precio) : null,
      moneda_codigo: record.moneda_codigo,
      fabricante_codigo: record.fabricante_codigo,
      np: record.np,
      punto_reposicion: record.punto_reposicion ? Number(record.punto_reposicion) : null,
      stock_maximo: record.stock_maximo ? Number(record.stock_maximo) : null,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const url = editing
        ? `/api/materiales/${editing.material_id}`
        : "/api/materiales";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) throw new Error();

      messageApi.success(editing ? "Actualizado correctamente" : "Creado correctamente");
      setModalOpen(false);
      fetchData();
    } catch {
      messageApi.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDesactivar(id: number) {
    const res = await fetch(`/api/materiales/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Material desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/materiales/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Material eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<MaterialRecord> = [
    numeracionColumn<MaterialRecord>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 90,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      ellipsis: true,
      sorter: (a: MaterialRecord, b: MaterialRecord) => a.descripcion.localeCompare(b.descripcion),
      ...filtroPorColumna(data, "descripcion"),
    },
    {
      key: "planta_codigo",
      title: "Planta",
      dataIndex: "planta_codigo",
      width: 90,
      sorter: (a, b) => (a.planta?.nombre ?? "").localeCompare(b.planta?.nombre ?? ""),
      ...filtroPorColumna(data, "planta_codigo"),
      render: (_: string, r: MaterialRecord) => r.planta?.nombre ?? r.planta_codigo,
    },
    {
      key: "area_codigo",
      title: "Área",
      dataIndex: "area_codigo",
      width: 100,
      sorter: (a, b) => (a.area?.nombre ?? "").localeCompare(b.area?.nombre ?? ""),
      ...filtroPorColumna(data, "area_codigo"),
      render: (_: string, r: MaterialRecord) => r.area?.nombre ?? r.area_codigo,
    },
    {
      key: "categoria_codigo",
      title: "Categoría",
      dataIndex: "categoria_codigo",
      width: 100,
      sorter: (a, b) => (a.categoria?.nombre ?? "").localeCompare(b.categoria?.nombre ?? ""),
      ...filtroPorColumna(data, "categoria_codigo"),
      render: (_: string, r: MaterialRecord) => r.categoria?.nombre ?? r.categoria_codigo,
    },
    {
      key: "clasificacion_codigo",
      title: "Clasificación",
      dataIndex: "clasificacion_codigo",
      width: 110,
      sorter: (a, b) => (a.clasificacion?.nombre ?? "").localeCompare(b.clasificacion?.nombre ?? ""),
      ...filtroPorColumna(data, "clasificacion_codigo"),
      render: (_: string, r: MaterialRecord) => r.clasificacion?.nombre ?? r.clasificacion_codigo,
    },
    {
      key: "unidad_medida_codigo",
      title: "Und. Med.",
      dataIndex: "unidad_medida_codigo",
      width: 80,
      ...filtroPorColumna(data, "unidad_medida_codigo"),
      render: (_: string, r: MaterialRecord) =>
        r.unidad_medida?.abreviatura ?? r.unidad_medida?.nombre ?? r.unidad_medida_codigo,
    },
    {
      key: "fabricante_codigo",
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 100,
      sorter: (a, b) => (a.fabricante?.nombre ?? "").localeCompare(b.fabricante?.nombre ?? ""),
      ...filtroPorColumna(data, "fabricante_codigo"),
      render: (_: string, r: MaterialRecord) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "-",
    },
    {
      key: "np",
      title: "NP",
      dataIndex: "np",
      width: 120,
      ellipsis: true,
      sorter: (a: MaterialRecord, b: MaterialRecord) => (a.np ?? "").localeCompare(b.np ?? ""),
      ...filtroPorColumna(data, "np"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 110,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      render: (v: number | null, r: MaterialRecord) => {
        if (!v) return "-";
        const sym = r.moneda?.simbolo ?? "$";
        return `${sym} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      },
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 100,
      align: "center",
      render: (_: unknown, record: MaterialRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este material?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.material_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.material_id)}
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
          Materiales
        </Title>
        <Space>
          <ColumnasToggleButton<MaterialRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Nuevo
          </Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Buscar por código, descripción o NP..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Planta"
              allowClear
              style={{ width: "100%" }}
              value={filterPlanta || undefined}
              onChange={(v) => { setFilterPlanta(v ?? ""); setPage(1); }}
              options={plantas.map((p) => ({ value: p.codigo, label: p.nombre }))}
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
              placeholder="Categoría"
              allowClear
              style={{ width: "100%" }}
              value={filterCategoria || undefined}
              onChange={(v) => { setFilterCategoria(v ?? ""); setPage(1); }}
              options={categorias.map((c) => ({ value: c.codigo, label: c.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Clasificación"
              allowClear
              style={{ width: "100%" }}
              value={filterClasificacion || undefined}
              onChange={(v) => { setFilterClasificacion(v ?? ""); setPage(1); }}
              options={clasificaciones.map((c) => ({ value: c.codigo, label: c.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Fabricante"
              allowClear
              style={{ width: "100%" }}
              value={filterFab || undefined}
              onChange={(v) => { setFilterFab(v ?? ""); setPage(1); }}
              options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch("");
                setFilterPlanta("");
                setFilterArea("");
                setFilterCategoria("");
                setFilterClasificacion("");
                setFilterFab("");
                setPage(1);
              }}
            >
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="material_id"
        columns={visibleColumns(columns, ocultas)}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "materiales",
        })}
        scroll={{ x: 1200 }}
        size="small"
      />

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Material"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={800}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerido" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planta_codigo" label="Planta" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={plantas.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="area_codigo" label="Área" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={areas.map((a) => ({ value: a.codigo, label: `${a.codigo} - ${a.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={categorias.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="clasificacion_codigo" label="Clasificación" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={clasificaciones.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unidad_medida_codigo" label="Und. Medida" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={unidades.map((u) => ({ value: u.codigo, label: `${u.codigo} - ${u.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select allowClear options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="np" label="Número de Parte">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="plazo_entrega" label="Plazo Entrega (días)">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="precio" label="Precio">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="moneda_codigo" label="Moneda">
                <Select allowClear options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="punto_reposicion" label="Pto. Reposición">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="stock_maximo" label="Stock Máximo">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

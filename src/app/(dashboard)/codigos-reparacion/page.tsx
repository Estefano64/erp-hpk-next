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

const { Title } = Typography;

interface CodRep {
  cod_rep_id: number;
  codigo: string;
  descripcion: string;
  tipo_codigo: string;
  categoria_codigo: string;
  flota_codigo: string;
  fabricante_codigo: string | null;
  np: string | null;
  posicion_codigo: string | null;
  precio: number | null;
  moneda_codigo: string | null;
  tipo: { nombre: string };
  categoria: { nombre: string };
  flota: { nombre: string };
  fabricante: { nombre: string } | null;
  posicion: { nombre: string } | null;
  moneda: { simbolo: string } | null;
}

interface Option {
  codigo: string;
  nombre: string;
}

export default function CodigosReparacionPage() {
  const { data: session } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const [data, setData] = useState<CodRep[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterFlota, setFilterFlota] = useState("");
  const [filterFab, setFilterFab] = useState("");

  // Opciones para selects
  const [tipos, setTipos] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [flotas, setFlotas] = useState<Option[]>([]);
  const [fabricantes, setFabricantes] = useState<Option[]>([]);
  const [posiciones, setPosiciones] = useState<Option[]>([]);
  const [monedas, setMonedas] = useState<Option[]>([]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CodRep | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (search) params.set("search", search);
    if (filterTipo) params.set("tipo", filterTipo);
    if (filterFlota) params.set("flota", filterFlota);
    if (filterFab) params.set("fabricante", filterFab);

    const res = await fetch(`/api/codigos-reparacion?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, search, filterTipo, filterFlota, filterFab]);

  // Cargar opciones de selects
  useEffect(() => {
    async function loadOptions() {
      const endpoints = [
        { url: "/api/catalogos?tabla=tipoCodRep", setter: setTipos },
        { url: "/api/catalogos?tabla=categoriaCodRep", setter: setCategorias },
        { url: "/api/catalogos?tabla=flotaEquipo", setter: setFlotas },
        { url: "/api/catalogos?tabla=fabricante", setter: setFabricantes },
        { url: "/api/catalogos?tabla=posicion", setter: setPosiciones },
        { url: "/api/catalogos?tabla=moneda", setter: setMonedas },
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

  function openEdit(record: CodRep) {
    setEditing(record);
    form.setFieldsValue({
      descripcion: record.descripcion,
      tipo_codigo: record.tipo_codigo,
      categoria_codigo: record.categoria_codigo,
      flota_codigo: record.flota_codigo,
      fabricante_codigo: record.fabricante_codigo,
      np: record.np,
      posicion_codigo: record.posicion_codigo,
      precio: record.precio ? Number(record.precio) : null,
      moneda_codigo: record.moneda_codigo,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const url = editing
        ? `/api/codigos-reparacion/${editing.cod_rep_id}`
        : "/api/codigos-reparacion";
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
    const res = await fetch(`/api/codigos-reparacion/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Código desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/codigos-reparacion/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Código eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<CodRep> = [
    {
      title: "Código",
      dataIndex: "codigo",
      width: 100,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    { title: "Descripción", dataIndex: "descripcion", ellipsis: true, sorter: (a: CodRep, b: CodRep) => a.descripcion.localeCompare(b.descripcion) },
    {
      title: "Tipo",
      dataIndex: "tipo_codigo",
      width: 80,
      sorter: (a, b) => (a.tipo?.nombre ?? "").localeCompare(b.tipo?.nombre ?? ""),
      render: (_: string, r: CodRep) => r.tipo?.nombre ?? r.tipo_codigo,
    },
    {
      title: "Categoría",
      dataIndex: "categoria_codigo",
      width: 100,
      sorter: (a, b) => (a.categoria_codigo ?? "").localeCompare(b.categoria_codigo ?? ""),
      render: (_: string, r: CodRep) => r.categoria_codigo,
    },
    {
      title: "Flota",
      dataIndex: "flota_codigo",
      width: 80,
      sorter: (a, b) => (a.flota?.nombre ?? "").localeCompare(b.flota?.nombre ?? ""),
      render: (_: string, r: CodRep) => r.flota?.nombre ?? r.flota_codigo,
    },
    {
      title: "Fabricante",
      dataIndex: "fabricante_codigo",
      width: 100,
      sorter: (a, b) => (a.fabricante?.nombre ?? "").localeCompare(b.fabricante?.nombre ?? ""),
      render: (_: string, r: CodRep) => r.fabricante?.nombre ?? r.fabricante_codigo ?? "-",
    },
    { title: "NP", dataIndex: "np", width: 140, ellipsis: true, sorter: (a: CodRep, b: CodRep) => (a.np ?? "").localeCompare(b.np ?? "") },
    {
      title: "Posición",
      dataIndex: "posicion_codigo",
      width: 80,
      sorter: (a, b) => (a.posicion_codigo ?? "").localeCompare(b.posicion_codigo ?? ""),
      render: (_: string, r: CodRep) => r.posicion_codigo ?? "-",
    },
    {
      title: "Precio",
      dataIndex: "precio",
      width: 120,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      render: (v: number | null, r: CodRep) => {
        if (!v) return "-";
        const sym = r.moneda?.simbolo ?? "$";
        return `${sym} ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      },
    },
    {
      title: "Acciones",
      width: 100,
      align: "center",
      render: (_: unknown, record: CodRep) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este código?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.cod_rep_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.cod_rep_id)}
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
          Códigos Reparables
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Nuevo
        </Button>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Buscar por código, descripción o NP..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Tipo"
              allowClear
              style={{ width: "100%" }}
              value={filterTipo || undefined}
              onChange={(v) => { setFilterTipo(v ?? ""); setPage(1); }}
              options={tipos.map((t) => ({ value: t.codigo, label: t.codigo }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Flota"
              allowClear
              style={{ width: "100%" }}
              value={filterFlota || undefined}
              onChange={(v) => { setFilterFlota(v ?? ""); setPage(1); }}
              options={flotas.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Fabricante"
              allowClear
              style={{ width: "100%" }}
              value={filterFab || undefined}
              onChange={(v) => { setFilterFab(v ?? ""); setPage(1); }}
              options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={() => { setSearch(""); setFilterTipo(""); setFilterFlota(""); setFilterFab(""); setPage(1); }}>
              Limpiar
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="cod_rep_id"
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
        scroll={{ x: 1100 }}
        size="small"
      />

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Código Reparable"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={700}
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
              <Form.Item name="tipo_codigo" label="Tipo" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={tipos.map((t) => ({ value: t.codigo, label: `${t.codigo} - ${t.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={categorias.map((c) => ({ value: c.codigo, label: `${c.codigo} - ${c.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="flota_codigo" label="Flota" rules={[{ required: true, message: "Requerido" }]}>
                <Select options={flotas.map((f) => ({ value: f.codigo, label: `${f.codigo} - ${f.nombre}` }))} />
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
              <Form.Item name="posicion_codigo" label="Posición">
                <Select allowClear options={posiciones.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="precio" label="Precio">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="moneda_codigo" label="Moneda">
                <Select allowClear options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

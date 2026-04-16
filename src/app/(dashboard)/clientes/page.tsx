"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Table,
  Button,
  Input,
  Space,
  Tag,
  Modal,
  Form,
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
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";

const { Title } = Typography;

interface ClienteRecord {
  cliente_id: number;
  codigo: string;
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  contacto_principal: string | null;
}

export default function ClientesPage() {
  const [data, setData] = useState<ClienteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/clientes?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: ClienteRecord) {
    setEditing(record);
    form.setFieldsValue({
      codigo: record.codigo,
      razon_social: record.razon_social,
      nombre_comercial: record.nombre_comercial,
      ruc: record.ruc,
      direccion: record.direccion,
      telefono: record.telefono,
      email: record.email,
      contacto_principal: record.contacto_principal,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const url = editing ? `/api/clientes/${editing.cliente_id}` : "/api/clientes";
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

  async function handleDelete(id: number) {
    const res = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Eliminado");
      fetchData();
    } else {
      messageApi.error("Error al eliminar");
    }
  }

  const columns: ColumnsType<ClienteRecord> = [
    {
      title: "Código",
      dataIndex: "codigo",
      width: 110,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    { title: "Razón Social", dataIndex: "razon_social", ellipsis: true, sorter: (a: ClienteRecord, b: ClienteRecord) => a.razon_social.localeCompare(b.razon_social) },
    { title: "Nombre Comercial", dataIndex: "nombre_comercial", ellipsis: true, sorter: (a: ClienteRecord, b: ClienteRecord) => (a.nombre_comercial ?? "").localeCompare(b.nombre_comercial ?? ""), render: (v: string | null) => v ?? "-" },
    { title: "RUC", dataIndex: "ruc", width: 130, sorter: (a: ClienteRecord, b: ClienteRecord) => (a.ruc ?? "").localeCompare(b.ruc ?? ""), render: (v: string | null) => v ?? "-" },
    { title: "Contacto", dataIndex: "contacto_principal", width: 180, ellipsis: true, render: (v: string | null) => v ?? "-" },
    { title: "Teléfono", dataIndex: "telefono", width: 130, render: (v: string | null) => v ?? "-" },
    {
      title: "Acciones",
      width: 100,
      align: "center",
      render: (_: unknown, record: ClienteRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="¿Eliminar este cliente?" onConfirm={() => handleDelete(record.cliente_id)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Clientes</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo</Button>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={16} md={10}>
            <Input
              placeholder="Buscar por código, razón social, nombre o RUC..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Button icon={<ReloadOutlined />} onClick={() => { setSearch(""); setPage(1); }}>Limpiar</Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="cliente_id"
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
        scroll={{ x: 900 }}
        size="small"
      />

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Cliente"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={700}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="codigo" label="Código" rules={[{ required: true, message: "Requerido" }]}>
                <Input disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="razon_social" label="Razón Social" rules={[{ required: true, message: "Requerido" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="nombre_comercial" label="Nombre Comercial">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ruc" label="RUC">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="direccion" label="Dirección">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="telefono" label="Teléfono">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="email" label="Email">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contacto_principal" label="Contacto Principal">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

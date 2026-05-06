"use client";

import { useState, useEffect, useCallback } from "react";
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
  DatePicker,
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
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
} from "@/lib/tables";
import dayjs from "dayjs";

const { Title } = Typography;

interface ContratoRecord {
  id: number;
  codigo: string;
  cliente_id: number;
  cod_rep_id: number | null;
  fecha_inicio: string;
  fecha_termino: string;
  dias_reparacion: number;
  precio: number;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string };
  codigo_reparacion: { codigo: string; descripcion: string } | null;
}

interface ClienteOption {
  cliente_id: number;
  codigo: string;
  nombre_comercial: string | null;
  razon_social: string;
}

interface CodRepOption {
  cod_rep_id: number;
  codigo: string;
  descripcion: string;
}

export default function ContratosPage() {
  const [data, setData] = useState<ContratoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("contratos-list-cols-v1");

  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [codReps, setCodReps] = useState<CodRepOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContratoRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search) params.set("search", search);
    if (filterCliente) params.set("cliente", filterCliente);
    const res = await fetch(`/api/contratos?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search, filterCliente]);

  useEffect(() => {
    async function loadOptions() {
      const [cliRes, crRes] = await Promise.all([
        fetch("/api/clientes?limit=100"),
        fetch("/api/codigos-reparacion?limit=200"),
      ]);
      if (cliRes.ok) {
        const json = await cliRes.json();
        setClientes(json.data ?? []);
      }
      if (crRes.ok) {
        const json = await crRes.json();
        setCodReps(json.data ?? []);
      }
    }
    loadOptions();
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: ContratoRecord) {
    setEditing(record);
    form.setFieldsValue({
      codigo: record.codigo,
      cliente_id: record.cliente_id,
      cod_rep_id: record.cod_rep_id,
      fecha_inicio: dayjs(record.fecha_inicio),
      fecha_termino: dayjs(record.fecha_termino),
      dias_reparacion: record.dias_reparacion,
      precio: Number(record.precio),
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        fecha_inicio: values.fecha_inicio.format("YYYY-MM-DD"),
        fecha_termino: values.fecha_termino.format("YYYY-MM-DD"),
      };

      const url = editing ? `/api/contratos/${editing.id}` : "/api/contratos";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    const res = await fetch(`/api/contratos/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Eliminado");
      fetchData();
    } else {
      messageApi.error("Error al eliminar");
    }
  }

  function formatDate(d: string) {
    return dayjs(d).format("DD/MM/YYYY");
  }

  const columns: ColumnsType<ContratoRecord> = [
    numeracionColumn<ContratoRecord>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 130,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "cliente_id",
      title: "Cliente",
      dataIndex: "cliente_id",
      ellipsis: true,
      sorter: (a, b) => (a.cliente?.nombre_comercial ?? a.cliente?.razon_social ?? "").localeCompare(b.cliente?.nombre_comercial ?? b.cliente?.razon_social ?? ""),
      render: (_: number, r: ContratoRecord) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social,
    },
    {
      key: "cod_rep_id",
      title: "Cód. Reparable",
      dataIndex: "cod_rep_id",
      width: 140,
      render: (_: number | null, r: ContratoRecord) =>
        r.codigo_reparacion ? `${r.codigo_reparacion.codigo} - ${r.codigo_reparacion.descripcion}` : "-",
      ellipsis: true,
    },
    {
      key: "fecha_inicio",
      title: "Inicio",
      dataIndex: "fecha_inicio",
      width: 110,
      sorter: (a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio),
      render: (v: string) => formatDate(v),
    },
    {
      key: "fecha_termino",
      title: "Término",
      dataIndex: "fecha_termino",
      width: 110,
      sorter: (a, b) => a.fecha_termino.localeCompare(b.fecha_termino),
      render: (v: string) => formatDate(v),
    },
    {
      key: "dias_reparacion",
      title: "Días Rep.",
      dataIndex: "dias_reparacion",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.dias_reparacion ?? 0) - (b.dias_reparacion ?? 0),
    },
    {
      key: "precio",
      title: "Precio",
      dataIndex: "precio",
      width: 120,
      align: "right",
      sorter: (a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0),
      render: (v: number) => `$ ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 100,
      align: "center",
      render: (_: unknown, record: ContratoRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="¿Eliminar este contrato?" onConfirm={() => handleDelete(record.id)}>
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
        <Title level={3} style={{ margin: 0 }}>Contratos</Title>
        <Space>
          <ColumnasToggleButton<ContratoRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Buscar por código o cliente..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select
              placeholder="Cliente"
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
              value={filterCliente || undefined}
              onChange={(v) => { setFilterCliente(v ?? ""); setPage(1); }}
              options={clientes.map((c) => ({ value: String(c.cliente_id), label: c.nombre_comercial ?? c.razon_social }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Button icon={<ReloadOutlined />} onClick={() => { setSearch(""); setFilterCliente(""); setPage(1); }}>Limpiar</Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        columns={visibleColumns(columns, ocultas)}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total,
          onChange: (p, s) => { setPage(p); setPageSize(s); },
          label: "contratos",
        })}
        scroll={{ x: 1000 }}
        size="small"
      />

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Contrato"}
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
                <Input />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="cliente_id" label="Cliente" rules={[{ required: true, message: "Requerido" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={clientes.map((c) => ({
                    value: c.cliente_id,
                    label: `${c.codigo} - ${c.nombre_comercial ?? c.razon_social}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="cod_rep_id" label="Código Reparable (opcional)">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={codReps.map((cr) => ({
                    value: cr.cod_rep_id,
                    label: `${cr.codigo} - ${cr.descripcion}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fecha_inicio" label="Fecha Inicio" rules={[{ required: true, message: "Requerido" }]}>
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fecha_termino" label="Fecha Término" rules={[{ required: true, message: "Requerido" }]}>
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dias_reparacion" label="Días Reparación" rules={[{ required: true, message: "Requerido" }]}>
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="precio" label="Precio (USD)" rules={[{ required: true, message: "Requerido" }]}>
                <InputNumber style={{ width: "100%" }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

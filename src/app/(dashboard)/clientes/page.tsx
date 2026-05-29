"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  StopOutlined,
  ReloadOutlined,
  ImportOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { ImportarExcelModal } from "@/components/ImportarExcelModal";
import { EmptyState } from "@/components/EmptyState";
import { DuplicateHint } from "@/components/DuplicateHint";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { RucLookupInput } from "@/components/RucLookupInput";

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
  nota: string | null;
  activo?: boolean;
  created_at?: string;
}

function ClienteDupHint({ form, excludeId }: { form: ReturnType<typeof Form.useForm>[0]; excludeId?: number }) {
  const value = (Form.useWatch("razon_social", form) ?? "") as string;
  return (
    <DuplicateHint<ClienteRecord>
      value={value}
      endpoint="/api/clientes"
      excludeId={excludeId}
      mapMatch={(c) => ({ id: c.cliente_id, primary: c.razon_social, secondary: c.codigo })}
    />
  );
}

export default function ClientesPage() {
  const { data: session } = useSession();
  const isAdminUser = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [data, setData] = useState<ClienteRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("clientes-list-cols-v2", [
    "direccion", "email",
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClienteRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/clientes?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, search]);

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
      nota: record.nota,
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

  async function handleDesactivar(id: number) {
    const res = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Cliente desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/clientes/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Cliente eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<ClienteRecord> = [
    numeracionColumn<ClienteRecord>({ current: page, pageSize }),
    {
      key: "codigo",
      title: "Código",
      dataIndex: "codigo",
      width: 110,
      sorter: (a, b) => a.codigo.localeCompare(b.codigo),
      ...filtroPorColumna(data, "codigo"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "razon_social",
      title: "Razón Social",
      dataIndex: "razon_social",
      ellipsis: true,
      sorter: (a: ClienteRecord, b: ClienteRecord) => a.razon_social.localeCompare(b.razon_social),
      ...filtroPorColumna(data, "razon_social"),
    },
    {
      key: "nombre_comercial",
      title: "Nombre Comercial",
      dataIndex: "nombre_comercial",
      ellipsis: true,
      sorter: (a: ClienteRecord, b: ClienteRecord) => (a.nombre_comercial ?? "").localeCompare(b.nombre_comercial ?? ""),
      ...filtroPorColumna(data, "nombre_comercial"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "ruc",
      title: "RUC",
      dataIndex: "ruc",
      width: 130,
      sorter: (a: ClienteRecord, b: ClienteRecord) => (a.ruc ?? "").localeCompare(b.ruc ?? ""),
      ...filtroPorColumna(data, "ruc"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "contacto_principal",
      title: "Contacto",
      dataIndex: "contacto_principal",
      width: 180,
      ellipsis: true,
      ...filtroPorColumna(data, "contacto_principal"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "telefono",
      title: "Teléfono",
      dataIndex: "telefono",
      width: 130,
      ...filtroPorColumna(data, "telefono"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "nota",
      title: "Nota",
      dataIndex: "nota",
      width: 200,
      ellipsis: true,
      ...filtroPorColumna(data, "nota"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "direccion", title: "Dirección", dataIndex: "direccion", width: 220, ellipsis: true,
      ...filtroPorColumna(data, "direccion"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "email", title: "Email", dataIndex: "email", width: 200, ellipsis: true,
      ...filtroPorColumna(data, "email"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 100,
      align: "center",
      render: (_: unknown, record: ClienteRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este cliente?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.cliente_id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.cliente_id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Eliminar permanentemente" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<ClienteRecord>(columns, "clientes-list-cols-widths-v1");

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Clientes</Title>
        <Space>
          <ColumnasToggleButton<ClienteRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "codigo", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<ClienteRecord>
            endpoint="/api/clientes"
            filename="Clientes"
            columns={[
              { label: "Código", value: (r) => r.codigo },
              { label: "Razón social", value: (r) => r.razon_social },
              { label: "Nombre comercial", value: (r) => r.nombre_comercial ?? "" },
              { label: "RUC", value: (r) => r.ruc ?? "" },
              { label: "Dirección", value: (r) => r.direccion ?? "" },
              { label: "Teléfono", value: (r) => r.telefono ?? "" },
              { label: "Email", value: (r) => r.email ?? "" },
              { label: "Contacto", value: (r) => r.contacto_principal ?? "" },
              { label: "Nota", value: (r) => r.nota ?? "" },
            ]}
          />
          {isAdminUser && (
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              Importar Excel
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo</Button>
        </Space>
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

      <TableDragWrapper>
              <Table
          rowKey="cliente_id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={data}
          loading={loading}
          locale={{
            emptyText: !loading && total === 0 && !search ? (
              <EmptyState
                title="Aún no hay clientes cargados"
                description="Importá masivamente desde Excel o creá uno manualmente."
                primaryAction={isAdminUser ? {
                  label: "Importar desde Excel",
                  icon: <ImportOutlined />,
                  onClick: () => setImportOpen(true),
                } : undefined}
                secondaryAction={{
                  label: "Crear manualmente",
                  icon: <PlusOutlined />,
                  onClick: openCreate,
                }}
              />
            ) : undefined,
          }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "clientes",
          })}
          scroll={{ x: 900 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${editing.codigo}` : "Nuevo Cliente"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={modalWidth(screens, 700)}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: brand.textSecondary, marginTop: 12 }}>
          Los campos con <span style={{ color: brand.error }}>*</span> son obligatorios.
        </div>
        <Form
          form={form} layout="vertical" style={{ marginTop: 8 }}
          validateTrigger={["onChange", "onBlur"]}
          requiredMark
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="ruc"
                label="RUC"
                rules={[
                  { required: true, message: "El RUC es obligatorio" },
                  { pattern: /^\d{11}$/, message: "Debe tener 11 dígitos numéricos" },
                ]}
              >
                <RucLookupInput
                  form={form}
                  fieldName="ruc"
                  targets={{ razonSocial: "razon_social", direccion: "direccion" }}
                />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="razon_social" label="Razón Social" rules={[{ required: true, message: "Razón social obligatoria" }]}>
                <Input placeholder="Ej. Minera Cuajone S.A." />
              </Form.Item>
              {!editing && <ClienteDupHint form={form} />}
            </Col>
            <Col span={24}>
              <Form.Item name="nombre_comercial" label="Nombre Comercial">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="direccion" label="Dirección">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="contacto_principal" label="Contacto Principal">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="telefono" label="Teléfono">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Email inválido" }]}>
                <Input placeholder="contacto@cliente.com" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="nota" label="Nota" extra="Útil para distinguir sedes con mismo RUC (ej. Cuajone, Toquepala, Ilo).">
                <Input maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <ImportarExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => fetchData()}
        title="Importar clientes desde Excel"
        endpoint="/api/clientes/bulk"
        fields={[
          { key: "codigo", label: "Código" },
          { key: "razon_social", label: "Razón social", required: true, aliases: ["razonsocial", "nombre"] },
          { key: "nombre_comercial", label: "Nombre comercial", aliases: ["comercial"] },
          { key: "ruc", label: "RUC", required: true },
          { key: "direccion", label: "Dirección" },
          { key: "telefono", label: "Teléfono", aliases: ["tel", "celular"] },
          { key: "email", label: "Email", aliases: ["correo"] },
          { key: "contacto_principal", label: "Contacto", aliases: ["contacto"] },
          { key: "nota", label: "Nota", aliases: ["sede", "sucursal"] },
        ]}
        templateRows={[
          ["", "Mi Cliente SAC", "MiCliente", "20100123456", "Av. Mina 200, Arequipa", "999999999", "compras@cliente.com", "Pedro Ruiz", "Sede Lima"],
        ]}
      />
    </div>
  );
}

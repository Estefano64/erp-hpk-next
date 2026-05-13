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

interface ProveedorRecord {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

function RazonSocialDupHint({ form, excludeId }: { form: ReturnType<typeof Form.useForm>[0]; excludeId?: number }) {
  const value = (Form.useWatch("razon_social", form) ?? "") as string;
  return (
    <DuplicateHint<ProveedorRecord>
      value={value}
      endpoint="/api/proveedores"
      excludeId={excludeId}
      mapMatch={(p) => ({ id: p.id, primary: p.razon_social, secondary: p.ruc })}
    />
  );
}

export default function ProveedoresPage() {
  const { data: session } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const [data, setData] = useState<ProveedorRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const { ocultas, setOcultas } = useColumnasOcultas("proveedores-list-cols-v1");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProveedorRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/proveedores?${params}`);
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

  function openEdit(record: ProveedorRecord) {
    setEditing(record);
    form.setFieldsValue({
      ruc: record.ruc,
      razon_social: record.razon_social,
      nombre_comercial: record.nombre_comercial,
      contacto: record.contacto,
      telefono: record.telefono,
      email: record.email,
      direccion: record.direccion,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const url = editing ? `/api/proveedores/${editing.id}` : "/api/proveedores";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Error");
      }
      messageApi.success(editing ? "Actualizado correctamente" : "Creado correctamente");
      setModalOpen(false);
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al guardar";
      messageApi.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDesactivar(id: number) {
    const res = await fetch(`/api/proveedores/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Proveedor desactivado");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al desactivar");
  }

  async function handleEliminarPermanente(id: number) {
    const res = await fetch(`/api/proveedores/${id}?force=true`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Proveedor eliminado permanentemente");
      fetchData();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.detail ?? body?.error ?? "Error al eliminar");
  }

  const columns: ColumnsType<ProveedorRecord> = [
    numeracionColumn<ProveedorRecord>({ current: page, pageSize }),
    {
      key: "ruc",
      title: "RUC",
      dataIndex: "ruc",
      width: 130,
      sorter: (a, b) => a.ruc.localeCompare(b.ruc),
      ...filtroPorColumna(data, "ruc"),
      render: (v: string) => <Tag color={brand.navy}>{v}</Tag>,
    },
    {
      key: "razon_social",
      title: "Razón Social",
      dataIndex: "razon_social",
      ellipsis: true,
      sorter: (a, b) => a.razon_social.localeCompare(b.razon_social),
      ...filtroPorColumna(data, "razon_social"),
    },
    {
      key: "nombre_comercial",
      title: "Nombre Comercial",
      dataIndex: "nombre_comercial",
      ellipsis: true,
      ...filtroPorColumna(data, "nombre_comercial"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "contacto",
      title: "Contacto",
      dataIndex: "contacto",
      width: 180,
      ellipsis: true,
      ...filtroPorColumna(data, "contacto"),
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
      key: "email",
      title: "Email",
      dataIndex: "email",
      width: 200,
      ellipsis: true,
      ...filtroPorColumna(data, "email"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "acciones",
      title: "Acciones",
      width: 120,
      align: "center",
      render: (_: unknown, record: ProveedorRecord) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="¿Desactivar este proveedor?"
            description="Se ocultará de las listas pero se conservará en la base de datos."
            onConfirm={() => handleDesactivar(record.id)}
          >
            <Button type="text" icon={<StopOutlined />} title="Desactivar" />
          </Popconfirm>
          {isAdminUser && (
            <Popconfirm
              title="¿Eliminar permanentemente?"
              description="Esta acción no se puede deshacer."
              okType="danger"
              okText="Eliminar"
              onConfirm={() => handleEliminarPermanente(record.id)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} title="Eliminar permanentemente" />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<ProveedorRecord>(columns, "proveedores-list-cols-widths-v1");

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Proveedores</Title>
        <Space>
          <ColumnasToggleButton<ProveedorRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "ruc", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<ProveedorRecord>
            endpoint="/api/proveedores"
            filename="Proveedores"
            columns={[
              { label: "RUC", value: (r) => r.ruc },
              { label: "Razón social", value: (r) => r.razon_social },
              { label: "Nombre comercial", value: (r) => r.nombre_comercial ?? "" },
              { label: "Contacto", value: (r) => r.contacto ?? "" },
              { label: "Teléfono", value: (r) => r.telefono ?? "" },
              { label: "Email", value: (r) => r.email ?? "" },
              { label: "Dirección", value: (r) => r.direccion ?? "" },
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

      <ImportarExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => fetchData()}
        title="Importar proveedores desde Excel"
        endpoint="/api/proveedores/bulk"
        fields={[
          { key: "ruc", label: "RUC", required: true, aliases: ["nro_ruc", "nrouc"] },
          { key: "razon_social", label: "Razón social", required: true, aliases: ["razonsocial", "nombre"] },
          { key: "nombre_comercial", label: "Nombre comercial", aliases: ["comercial"] },
          { key: "contacto", label: "Contacto" },
          { key: "telefono", label: "Teléfono", aliases: ["tel", "celular"] },
          { key: "email", label: "Email", aliases: ["correo"] },
          { key: "direccion", label: "Dirección" },
        ]}
        templateRows={[
          ["20100123456", "Mi Proveedor SAC", "MiProvee", "Juan Pérez", "999999999", "ventas@miprovee.com", "Av. Industrial 100, Lima"],
        ]}
      />

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={16} md={10}>
            <Input
              placeholder="Buscar por RUC, razón social, nombre o contacto..."
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
        rowKey="id"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={data}
        loading={loading}
        locale={{
          emptyText: !loading && total === 0 && !search ? (
            <EmptyState
              title="Aún no hay proveedores cargados"
              description="Importá masivamente desde Excel (RUC, razón social, contacto) o creá uno manualmente."
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
          label: "proveedores",
        })}
        scroll={{ x: 900 }}
        sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        size="small"
      />

      <Modal
        title={editing ? `Editar ${editing.ruc}` : "Nuevo Proveedor"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={700}
        destroyOnHidden
      >
        <div style={{ fontSize: 12, color: brand.textSecondary, marginTop: 12 }}>
          Los campos con <span style={{ color: "#ff4d4f" }}>*</span> son obligatorios.
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
                <Input placeholder="Ej. Repuestos Industriales SAC" />
              </Form.Item>
              {!editing && (
                <RazonSocialDupHint form={form} />
              )}
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
              <Form.Item name="contacto" label="Contacto Principal">
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
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

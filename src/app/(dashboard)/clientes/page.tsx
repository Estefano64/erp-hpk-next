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
  Drawer,
  Switch,
  Spin,
  Empty,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  ReloadOutlined,
  ImportOutlined,
  UserAddOutlined,
  GlobalOutlined,
  KeyOutlined,
} from "@ant-design/icons";
import { Tooltip } from "antd";
import { puedeEscribirApi } from "@/lib/acceso-rutas";
import { formatOtCodigo } from "@/lib/ot-formato";
import { formatDateOnly } from "@/lib/dates";
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
  useAbortableFetch,
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
  // ── Panel "Portal del cliente": cuentas de acceso + qué OTs ve ──────────
  // Centraliza la gestión del portal acá (pedido del usuario: no sobrecargar
  // el listado de OTs externas). Publicar usa el mismo endpoint gateado.
  const rolesUsuario = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []);
  const puedeGestionarPortal = puedeEscribirApi(rolesUsuario, "/api/ordenes-trabajo", "POST");
  const [portalDrawer, setPortalDrawer] = useState<ClienteRecord | null>(null);
  const [portalData, setPortalData] = useState<{
    cuentas: { id: number; nombre: string; email: string | null; codigoEmpleado: string; activo: boolean }[];
    ots: { id: number; ot: number | null; tipo_codigo: string | null; descripcion: string | null; np: string | null; cod_rep_flota: string | null; taller_status_codigo: string | null; fecha_recepcion: string | null; visible_portal: boolean }[];
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalBuscar, setPortalBuscar] = useState("");
  const [portalToggling, setPortalToggling] = useState<number | null>(null);
  const cargarPortal = async (clienteId: number) => {
    setPortalLoading(true);
    try {
      const r = await fetch(`/api/clientes/${clienteId}/portal`);
      const j = await r.json().catch(() => null);
      if (r.ok) setPortalData(j);
      else message.error(j?.error ?? "Error al cargar el portal");
    } finally {
      setPortalLoading(false);
    }
  };
  const abrirPortal = (c: ClienteRecord) => {
    setPortalDrawer(c);
    setPortalData(null);
    setPortalBuscar("");
    void cargarPortal(c.cliente_id);
  };
  const togglePortalOT = async (otId: number, visible: boolean) => {
    setPortalToggling(otId);
    try {
      const r = await fetch(`/api/ordenes-trabajo/${otId}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Error al actualizar");
      setPortalData((prev) => prev
        ? { ...prev, ots: prev.ots.map((o) => (o.id === otId ? { ...o, visible_portal: visible } : o)) }
        : prev);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setPortalToggling(null);
    }
  };
  // Administración de cuentas de portal (solo admin): reset de contraseña y
  // activar/desactivar. Usa los endpoints admin de /api/usuarios existentes.
  const [cuentaPass, setCuentaPass] = useState<{ id: number; nombre: string } | null>(null);
  const [passNueva, setPassNueva] = useState("");
  const [passSaving, setPassSaving] = useState(false);
  const resetPassword = async () => {
    if (!cuentaPass) return;
    if (passNueva.trim().length < 6) { message.warning("Mínimo 6 caracteres"); return; }
    setPassSaving(true);
    try {
      const r = await fetch(`/api/usuarios/${cuentaPass.id}/cambiar-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nueva: passNueva.trim(), confirmacion: passNueva.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Error al cambiar la contraseña");
      message.success(`Contraseña actualizada — entregá la nueva al cliente.`);
      setCuentaPass(null);
      setPassNueva("");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setPassSaving(false);
    }
  };
  const toggleCuentaActiva = async (cuentaId: number, activo: boolean) => {
    try {
      const r = await fetch(`/api/usuarios/${cuentaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Error al actualizar la cuenta");
      message.success(activo ? "Cuenta activada" : "Cuenta desactivada — ya no puede iniciar sesión");
      if (portalDrawer) void cargarPortal(portalDrawer.cliente_id);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  };
  // Cuenta de PORTAL del cliente (rol "cliente"): solo timeline de sus OTs
  // publicadas. La crea el admin desde acá y le entrega las credenciales.
  const [portalCliente, setPortalCliente] = useState<ClienteRecord | null>(null);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalForm] = Form.useForm<{ nombre: string; email?: string; codigo: string; password: string }>();
  const abrirCuentaPortal = (c: ClienteRecord) => {
    setPortalCliente(c);
    portalForm.setFieldsValue({
      nombre: `Portal ${c.nombre_comercial ?? c.razon_social}`.slice(0, 100),
      codigo: `PORTAL-${c.codigo}`.slice(0, 20),
      email: undefined,
      password: undefined,
    });
  };
  const crearCuentaPortal = async () => {
    if (!portalCliente) return;
    try {
      const v = await portalForm.validateFields();
      setPortalSaving(true);
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoEmpleado: v.codigo.trim(),
          nombre: v.nombre.trim(),
          email: v.email?.trim() || null,
          password: v.password,
          roles: ["cliente"],
          clienteId: portalCliente.cliente_id,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? "Error al crear la cuenta");
      message.success(`Cuenta de portal creada. Usuario: ${v.email?.trim() || v.codigo.trim()} — entregá las credenciales al cliente.`);
      setPortalCliente(null);
      // Si el panel del portal está abierto para este cliente, refrescarlo.
      if (portalDrawer?.cliente_id === portalCliente.cliente_id) void cargarPortal(portalCliente.cliente_id);
    } catch (e) {
      if (e instanceof Error && e.message) message.error(e.message);
    } finally {
      setPortalSaving(false);
    }
  };
  const [editing, setEditing] = useState<ClienteRecord | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();

  const abortable = useAbortableFetch();
  const fetchData = useCallback(async () => {
    const controller = abortable.start();
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/clientes?${params}`, { signal: controller.signal });
      const json = await res.json();
      if (controller.signal.aborted) return;
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      if (abortable.isAbort(e)) return;
      throw e;
    } finally {
      if (abortable.isCurrent(controller)) setLoading(false);
    }
  }, [page, pageSize, search, abortable]);

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
          {puedeGestionarPortal && (
            <Tooltip title="Portal del cliente: cuentas de acceso y qué OTs ve">
              <Button type="text" icon={<GlobalOutlined style={{ color: brand.cyan }} />} onClick={() => abrirPortal(record)} />
            </Tooltip>
          )}
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
    useColumnasRedimensionables<ClienteRecord>(columns, "clientes-list-cols-widths-v1", { data });

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Clientes</Title>
        <Space wrap>
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
            // Respeta el filtro de búsqueda activo en la tabla.
            endpointParams={{ search }}
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
            <Col xs={24} sm={8}>
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
            <Col xs={24} sm={16}>
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
            <Col xs={24} sm={8}>
              <Form.Item name="contacto_principal" label="Contacto Principal">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="telefono" label="Teléfono">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
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

      {/* ── Panel "Portal del cliente": cuentas + qué OTs ve ─────────────── */}
      <Drawer
        title={
          <Space size={8}>
            <GlobalOutlined style={{ color: brand.cyan }} />
            <span>Portal — {portalDrawer?.nombre_comercial ?? portalDrawer?.razon_social ?? ""}</span>
          </Space>
        }
        placement="right"
        width={modalWidth(screens, 640)}
        open={!!portalDrawer}
        onClose={() => setPortalDrawer(null)}
      >
        {portalLoading || !portalData ? (
          <div style={{ textAlign: "center", padding: 48 }}><Spin /></div>
        ) : (
          <div>
            {/* Cuentas de acceso */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Text strong>Cuentas de acceso</Typography.Text>
              {isAdminUser && portalDrawer && (
                <Button size="small" icon={<UserAddOutlined />} onClick={() => abrirCuentaPortal(portalDrawer)}>
                  Nueva cuenta
                </Button>
              )}
            </div>
            {portalData.cuentas.length === 0 ? (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Este cliente todavía no tiene cuentas de portal.{isAdminUser ? " Creale una con el botón de arriba y entregale las credenciales." : " Un admin puede crearla."}
                </Typography.Text>
              </Card>
            ) : (
              <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 8 } }}>
                {portalData.cuentas.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text style={{ fontSize: 13 }}>{c.nombre}</Typography.Text>
                      <div style={{ fontSize: 11, color: brand.textSecondary }}>
                        Login: {c.email ?? c.codigoEmpleado}
                      </div>
                    </div>
                    <Space size={6}>
                      {isAdminUser && (
                        <Tooltip title="Generar nueva contraseña (si el cliente la olvidó)">
                          <Button size="small" icon={<KeyOutlined />} onClick={() => { setCuentaPass({ id: c.id, nombre: c.nombre }); setPassNueva(""); }} />
                        </Tooltip>
                      )}
                      {isAdminUser ? (
                        <Tooltip title={c.activo ? "Desactivar: la cuenta no podrá iniciar sesión" : "Reactivar la cuenta"}>
                          <Switch
                            size="small"
                            checked={c.activo}
                            checkedChildren="Activa"
                            unCheckedChildren="Inactiva"
                            onChange={(v) => toggleCuentaActiva(c.id, v)}
                          />
                        </Tooltip>
                      ) : (
                        <Tag color={c.activo ? "success" : "default"} style={{ margin: 0 }}>{c.activo ? "Activa" : "Inactiva"}</Tag>
                      )}
                    </Space>
                  </div>
                ))}
              </Card>
            )}

            {/* Modal: nueva contraseña para una cuenta (reset de soporte) */}
            <Modal
              title={`Nueva contraseña — ${cuentaPass?.nombre ?? ""}`}
              open={!!cuentaPass}
              onCancel={() => { setCuentaPass(null); setPassNueva(""); }}
              onOk={resetPassword}
              confirmLoading={passSaving}
              okText="Cambiar contraseña"
              cancelText="Cancelar"
              destroyOnHidden
            >
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                Se reemplaza la contraseña actual (no hace falta conocerla). Entregá la nueva al contacto del cliente.
              </Typography.Paragraph>
              <Input.Password
                placeholder="Nueva contraseña (mínimo 6 caracteres)"
                value={passNueva}
                onChange={(e) => setPassNueva(e.target.value)}
                onPressEnter={resetPassword}
                maxLength={100}
                autoFocus
              />
            </Modal>

            {/* OTs del cliente: publicar / ocultar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <Typography.Text strong>
                Qué OTs ve el cliente{" "}
                <Tag color="blue" style={{ marginLeft: 4 }}>
                  {portalData.ots.filter((o) => o.visible_portal).length} publicadas de {portalData.ots.length}
                </Tag>
              </Typography.Text>
              <Input
                allowClear
                size="small"
                prefix={<SearchOutlined />}
                placeholder="Buscar OT, componente, N/P..."
                value={portalBuscar}
                onChange={(e) => setPortalBuscar(e.target.value)}
                style={{ width: 220 }}
              />
            </div>
            {(() => {
              const q = portalBuscar.trim().toLowerCase();
              const lista = portalData.ots.filter((o) => !q || [String(o.ot ?? ""), o.descripcion, o.np, o.cod_rep_flota]
                .some((v) => (v ?? "").toLowerCase().includes(q)));
              if (lista.length === 0) return <Empty description="Sin OTs para mostrar" style={{ marginTop: 24 }} />;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lista.map((o) => (
                    <Card key={o.id} size="small" styles={{ body: { padding: "8px 10px" } }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <Typography.Text strong style={{ fontSize: 13, color: brand.navy }}>
                            OT {o.ot != null ? formatOtCodigo(o.ot, o.tipo_codigo, "") : `#${o.id}`}
                          </Typography.Text>
                          <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {o.descripcion ?? "—"}
                          </div>
                          <div style={{ fontSize: 11, color: brand.textSecondary }}>
                            {o.np ? `N/P ${o.np} · ` : ""}{o.cod_rep_flota ? `${o.cod_rep_flota} · ` : ""}
                            {o.taller_status_codigo ?? "Sin estado"} · Recibida {formatDateOnly(o.fecha_recepcion)}
                          </div>
                        </div>
                        <Switch
                          checked={o.visible_portal}
                          loading={portalToggling === o.id}
                          checkedChildren="Visible"
                          unCheckedChildren="Oculta"
                          onChange={(v) => togglePortalOT(o.id, v)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </Drawer>

      {/* Cuenta de portal para un cliente (solo admin). El login es el email
          (o el código) + la contraseña; el cliente solo verá /portal. */}
      <Modal
        title={`Cuenta de portal — ${portalCliente?.nombre_comercial ?? portalCliente?.razon_social ?? ""}`}
        open={!!portalCliente}
        onCancel={() => setPortalCliente(null)}
        onOk={crearCuentaPortal}
        confirmLoading={portalSaving}
        okText="Crear cuenta"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form form={portalForm} layout="vertical">
          <Form.Item name="nombre" label="Nombre de la cuenta" rules={[{ required: true, message: "Requerido" }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="email" label="Email del contacto (será su usuario de login)" rules={[{ type: "email", message: "Email inválido" }]}>
            <Input placeholder="contacto@cliente.com" maxLength={100} />
          </Form.Item>
          <Form.Item name="codigo" label="Código interno (login alternativo)" rules={[{ required: true, message: "Requerido" }]}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="password" label="Contraseña inicial" rules={[{ required: true, min: 6, message: "Mínimo 6 caracteres" }]}>
            <Input.Password maxLength={100} />
          </Form.Item>
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

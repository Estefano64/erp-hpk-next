"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Select, InputNumber,
  Modal, Form, Popconfirm, App, Tooltip, Segmented, Alert,
} from "antd";
import {
  TeamOutlined, ReloadOutlined, SearchOutlined, PlusOutlined,
  EditOutlined, DeleteOutlined, ToolOutlined,
  UserOutlined, UserAddOutlined, LinkOutlined, DisconnectOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import {
  numeracionColumn, paginacionEstandar, PAGINATION_PAGE_SIZE,
  useColumnasOcultas, ColumnasToggleButton, visibleColumns, filtroPorColumna,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Trabajador {
  trabajador_id: number;
  nombre: string;
  dni: string | null;
  area: string;
  puesto: string;
  equipo_codigo: string | null;
  costo_hora_hombre: number | string | null;
  costo_hora_extra: number | string | null;
  activo: boolean;
  equipo: { codigo: string; descripcion: string } | null;
}

interface EquipoOpt { codigo: string; descripcion: string }

interface Usuario {
  id: number;
  codigoEmpleado: string;
  email: string | null;
  dni: string | null;
  nombre: string;
  roles: string[];
  activo: boolean;
  trabajadorId: number | null;
}

// Roles disponibles para asignar. Los "bien definidos" tienen comportamiento
// implementado (filtros, acceso al panel, aprobaciones). Los "placeholder" se
// pueden asignar pero su efecto se irá habilitando en fases posteriores.
const ROLES = [
  // Bien definidos
  { value: "admin", label: "Admin — acceso total + gestiona usuarios" },
  { value: "viewer", label: "Viewer — solo lectura" },
  { value: "tecnico", label: "Técnico — operario + panel personal" },
  { value: "evaluador", label: "Evaluador — firma 'Evaluado por' en hojas" },
  { value: "aprobador_evaluacion", label: "Aprobador de hojas — firma 'Supervisor' y aprueba evaluaciones" },
  { value: "aprobador_requerimiento", label: "Aprobador de requerimientos" },
  // Placeholders (sin efecto todavía)
  { value: "planner", label: "Planner (placeholder)" },
  { value: "supervisor", label: "Supervisor (placeholder)" },
  { value: "logistica", label: "Logística (placeholder)" },
  { value: "mantenimiento", label: "Mantenimiento (placeholder)" },
  { value: "contabilidad", label: "Contabilidad (placeholder)" },
];

// Colores de tags por rol para los badges en la tabla.
const COLOR_POR_ROL: Record<string, string> = {
  admin: "magenta",
  tecnico: "cyan",
  evaluador: "geekblue",
  aprobador_evaluacion: "purple",
  aprobador_requerimiento: "volcano",
  viewer: "default",
};

export default function TrabajadoresPage() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<Trabajador[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroArea, setFiltroArea] = useState<string | undefined>();
  const [verInactivos, setVerInactivos] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("trabajadores-list-cols-v1");
  const [equipos, setEquipos] = useState<EquipoOpt[]>([]);

  // Modal crear/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Trabajador | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{
    nombre: string;
    dni?: string;
    area: string;
    puesto: string;
    equipo_codigo?: string;
    costo_hora_hombre?: number;
    costo_hora_extra?: number;
    activo?: boolean;
  }>();

  // Modal gestión de cuenta de usuario asociada
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const [cuentaTrabajador, setCuentaTrabajador] = useState<Trabajador | null>(null);
  const [cuentaUsuario, setCuentaUsuario] = useState<Usuario | null>(null);
  const [cuentaSaving, setCuentaSaving] = useState(false);
  // Cuando trabajador no tiene cuenta, elegir entre crear nueva o vincular existente.
  const [cuentaModo, setCuentaModo] = useState<"crear" | "vincular">("crear");
  // ID de cuenta seleccionada en el modo "vincular".
  const [cuentaAVincular, setCuentaAVincular] = useState<number | undefined>();
  const [cuentaForm] = Form.useForm<{
    email?: string;
    roles: string[];
    password?: string;
    activo: boolean;
  }>();
  // Lista completa de usuarios + mapa trabajadorId → Usuario (para badges).
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosByTrabajador, setUsuariosByTrabajador] = useState<Record<number, Usuario>>({});

  const fetchUsuarios = useCallback(async () => {
    const res = await fetch("/api/usuarios");
    if (!res.ok) return;
    const j = await res.json();
    const lista = (j.data ?? []) as Usuario[];
    setUsuarios(lista);
    const map: Record<number, Usuario> = {};
    for (const u of lista) {
      if (u.trabajadorId != null) map[u.trabajadorId] = u;
    }
    setUsuariosByTrabajador(map);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (search) params.set("search", search);
      if (filtroArea) params.set("area", filtroArea);
      params.set("activos", verInactivos ? "false" : "true");
      const res = await fetch(`/api/trabajadores?${params}`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filtroArea, verInactivos]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  useEffect(() => {
    fetch("/api/equipos?limit=500&tipo=MAQ")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.data) setEquipos(j.data); })
      .catch(() => { /* noop */ });
  }, []);

  function openCuenta(t: Trabajador) {
    setCuentaTrabajador(t);
    const u = usuariosByTrabajador[t.trabajador_id] ?? null;
    setCuentaUsuario(u);
    setCuentaModo("crear");
    setCuentaAVincular(undefined);
    cuentaForm.resetFields();
    if (u) {
      cuentaForm.setFieldsValue({
        email: u.email ?? undefined,
        roles: u.roles ?? [],
        password: undefined,
        activo: u.activo,
      });
    } else {
      // Default sensato al crear: "tecnico" y "evaluador" (todos los operarios
      // del taller son ambos por defecto). El admin puede quitar o agregar.
      cuentaForm.setFieldsValue({ email: undefined, roles: ["tecnico", "evaluador"], password: undefined, activo: true });
    }
    setCuentaModalOpen(true);
  }

  // Vincula una cuenta existente a este trabajador. Si la cuenta ya estaba
  // vinculada a otro trabajador, pide confirmación (transferencia).
  async function vincularCuenta(usuarioId: number) {
    if (!cuentaTrabajador) return;
    const u = usuarios.find((x) => x.id === usuarioId);
    if (!u) return;

    const confirmar = (): Promise<boolean> => new Promise((resolve) => {
      if (u.trabajadorId == null) { resolve(true); return; }
      const trabActual = rows.find((r) => r.trabajador_id === u.trabajadorId);
      modal.confirm({
        title: "Transferir cuenta",
        content: `La cuenta "${u.codigoEmpleado}" está vinculada actualmente a ${trabActual?.nombre ?? `trabajador #${u.trabajadorId}`}. ¿Querés transferirla a ${cuentaTrabajador.nombre}? El trabajador anterior quedará sin cuenta.`,
        okText: "Transferir", okButtonProps: { danger: true }, cancelText: "Cancelar",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    if (!(await confirmar())) return;

    setCuentaSaving(true);
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trabajadorId: cuentaTrabajador.trabajador_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      message.success("Cuenta vinculada");
      setCuentaModalOpen(false);
      fetchUsuarios();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCuentaSaving(false);
    }
  }

  // Desvincula la cuenta del trabajador (no la borra). La cuenta queda libre
  // para reasignarse a otro trabajador o quedarse como huérfana de sistema.
  async function desvincularCuenta() {
    if (!cuentaUsuario) return;
    modal.confirm({
      title: "Desvincular cuenta",
      content: `La cuenta "${cuentaUsuario.codigoEmpleado}" se va a desvincular de ${cuentaTrabajador?.nombre}. La cuenta sigue existiendo y puede asignarse a otro trabajador.`,
      okText: "Desvincular", okButtonProps: { danger: true }, cancelText: "Cancelar",
      onOk: async () => {
        setCuentaSaving(true);
        try {
          const res = await fetch(`/api/usuarios/${cuentaUsuario.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trabajadorId: null }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error ?? "Error");
          }
          message.success("Cuenta desvinculada");
          setCuentaModalOpen(false);
          fetchUsuarios();
        } catch (e) {
          message.error(e instanceof Error ? e.message : "Error");
        } finally {
          setCuentaSaving(false);
        }
      },
    });
  }

  async function handleSaveCuenta() {
    if (!cuentaTrabajador) return;

    // Modo "vincular": no usa el form, solo el ID seleccionado.
    if (!cuentaUsuario && cuentaModo === "vincular") {
      if (!cuentaAVincular) { message.warning("Elegí una cuenta para vincular"); return; }
      await vincularCuenta(cuentaAVincular);
      return;
    }

    try {
      const v = await cuentaForm.validateFields();
      setCuentaSaving(true);
      let res: Response;
      if (cuentaUsuario) {
        // Update existente
        const body: Record<string, unknown> = { roles: v.roles, activo: v.activo, email: v.email ?? null };
        if (v.password) body.password = v.password;
        res = await fetch(`/api/usuarios/${cuentaUsuario.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        // Crear nueva — codigoEmpleado = DNI si lo tiene, sino USR-<trabajador_id>
        const codigoEmpleado = cuentaTrabajador.dni ?? `USR-T${cuentaTrabajador.trabajador_id}`;
        if (!v.password) { message.error("La contraseña es obligatoria al crear una cuenta nueva"); setCuentaSaving(false); return; }
        res = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigoEmpleado,
            email: v.email ?? null,
            dni: cuentaTrabajador.dni ?? null,
            nombre: cuentaTrabajador.nombre,
            roles: v.roles,
            password: v.password,
            activo: v.activo,
            trabajadorId: cuentaTrabajador.trabajador_id,
          }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      message.success(cuentaUsuario ? "Cuenta actualizada" : "Cuenta creada");
      setCuentaModalOpen(false);
      fetchUsuarios();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setCuentaSaving(false);
    }
  }

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ activo: true });
    setModalOpen(true);
  }
  function openEdit(t: Trabajador) {
    setEditing(t);
    form.setFieldsValue({
      nombre: t.nombre,
      dni: t.dni ?? undefined,
      area: t.area,
      puesto: t.puesto,
      equipo_codigo: t.equipo_codigo ?? undefined,
      costo_hora_hombre: t.costo_hora_hombre != null ? Number(t.costo_hora_hombre) : undefined,
      costo_hora_extra: t.costo_hora_extra != null ? Number(t.costo_hora_extra) : undefined,
      activo: t.activo,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const url = editing ? `/api/trabajadores/${editing.trabajador_id}` : "/api/trabajadores";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      message.success(editing ? "Trabajador actualizado" : "Trabajador creado");
      setModalOpen(false);
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(t: Trabajador) {
    modal.confirm({
      title: `Desactivar a ${t.nombre}?`,
      content: "Se marca como inactivo. Las tareas asignadas no se borran.",
      okText: "Desactivar", okButtonProps: { danger: true }, cancelText: "Cancelar",
      onOk: async () => {
        const res = await fetch(`/api/trabajadores/${t.trabajador_id}`, { method: "DELETE" });
        if (res.ok) { message.success("Desactivado"); fetchData(); }
        else message.error("Error");
      },
    });
  }

  // Areas únicas para filtro
  const areasUnicas = [...new Set(rows.map((r) => r.area).filter(Boolean))].sort();

  const columns: ColumnsType<Trabajador> = [
    numeracionColumn<Trabajador>({ current: page, pageSize }),
    {
      key: "nombre", title: "Nombre", dataIndex: "nombre", width: 240,
      ...filtroPorColumna(rows, "nombre"),
      sorter: (a, b) => a.nombre.localeCompare(b.nombre),
      render: (v: string, r) => (
        <Space>
          <Text strong style={{ fontSize: 12 }}>{v}</Text>
          {!r.activo && <Tag color="default" style={{ fontSize: 10, margin: 0 }}>INACTIVO</Tag>}
        </Space>
      ),
    },
    {
      key: "dni", title: "DNI", dataIndex: "dni", width: 110,
      ...filtroPorColumna(rows, "dni"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      key: "area", title: "Área", dataIndex: "area", width: 140,
      filters: areasUnicas.map((a) => ({ text: a, value: a })),
      onFilter: (value, r) => r.area === value,
      render: (v: string) => <Tag color="blue" style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      key: "puesto", title: "Cargo / Puesto", dataIndex: "puesto", width: 160,
      ...filtroPorColumna(rows, "puesto"),
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      key: "equipo", title: "Máquina asignada", width: 220,
      filters: [...new Set(rows.map((r) => r.equipo?.codigo).filter(Boolean) as string[])]
        .map((c) => ({ text: c, value: c })),
      onFilter: (value, r) => r.equipo_codigo === value,
      render: (_, r) => r.equipo
        ? (
          <Space size={4}>
            <ToolOutlined style={{ color: brand.cyan }} />
            <Text style={{ fontSize: 12 }}>
              {r.equipo.descripcion} <Text type="secondary">— {r.equipo.codigo}</Text>
            </Text>
          </Space>
        )
        : <Text type="secondary">—</Text>,
    },
    {
      key: "costo_hh", title: "Costo H.H.", dataIndex: "costo_hora_hombre", width: 130, align: "right",
      sorter: (a, b) => Number(a.costo_hora_hombre ?? 0) - Number(b.costo_hora_hombre ?? 0),
      render: (v: number | string | null) => {
        if (v == null) return <Text type="secondary">—</Text>;
        return <Text style={{ fontSize: 12, color: brand.navy }}>S/ {Number(v).toFixed(2)}</Text>;
      },
    },
    {
      key: "costo_he", title: "Costo H.E.", dataIndex: "costo_hora_extra", width: 130, align: "right",
      sorter: (a, b) => Number(a.costo_hora_extra ?? 0) - Number(b.costo_hora_extra ?? 0),
      render: (v: number | string | null) => {
        if (v == null) return <Text type="secondary">—</Text>;
        return <Text style={{ fontSize: 12, color: brand.navy }}>S/ {Number(v).toFixed(2)}</Text>;
      },
    },
    {
      key: "cuenta", title: "Cuenta", width: 220, align: "center",
      render: (_, r) => {
        const u = usuariosByTrabajador[r.trabajador_id];
        if (!u) {
          return (
            <Tooltip title="Crear cuenta de usuario para este trabajador">
              <Button size="small" icon={<UserAddOutlined />} onClick={() => openCuenta(r)}>
                Sin cuenta
              </Button>
            </Tooltip>
          );
        }
        return (
          <Tooltip title={`${u.codigoEmpleado}${u.email ? ` · ${u.email}` : ""} · ${u.roles.join(", ") || "sin roles"}`}>
            <Space size={2} wrap onClick={() => openCuenta(r)} style={{ cursor: "pointer" }}>
              <UserOutlined style={{ color: u.activo ? brand.cyan : brand.textSecondary }} />
              {u.roles.length === 0
                ? <Tag color="default" style={{ fontSize: 10, margin: 0 }}>sin rol</Tag>
                : u.roles.map((r) => (
                    <Tag key={r} color={u.activo ? (COLOR_POR_ROL[r] ?? "blue") : "default"} style={{ fontSize: 10, margin: 0 }}>{r}</Tag>
                  ))
              }
              {!u.activo && <Tag color="default" style={{ fontSize: 10, margin: 0 }}>inactiva</Tag>}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      key: "acciones", title: "", width: 110, fixed: "right", align: "center",
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="Editar"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          {r.activo && (
            <Popconfirm title={`Desactivar a ${r.nombre}?`} onConfirm={() => handleDelete(r)} okText="Sí" cancelText="No">
              <Tooltip title="Desactivar"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, TableDragWrapper } =
    useColumnasRedimensionables<Trabajador>(columns, "trabajadores-cols-widths-v1");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />
          Trabajadores
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space wrap>
          <Input
            placeholder="Buscar nombre, DNI o cargo..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Select showSearch optionFilterProp="label"
            placeholder="Área"
            value={filtroArea}
            onChange={setFiltroArea}
            options={areasUnicas.map((a) => ({ value: a, label: a }))}
            allowClear
            style={{ width: 180 }}
          />
          <Button
            type={verInactivos ? "primary" : "default"}
            onClick={() => setVerInactivos((v) => !v)}
          >
            {verInactivos ? "Ver activos" : "Ver inactivos"}
          </Button>
          <ColumnasToggleButton<Trabajador>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "nombre", "acciones"]}
          />
        </Space>
      </Card>

      <TableDragWrapper>
        <Table<Trabajador>
          rowKey="trabajador_id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={rows}
          loading={loading}
          size="small"
          pagination={paginacionEstandar({
            current: page, pageSize, total: rows.length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "trabajadores",
            placement: ["topEnd", "bottomEnd"],
          })}
          scroll={{ x: 1100 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${editing.nombre}` : "Nuevo Trabajador"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="Guardar" cancelText="Cancelar"
        width={620}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="nombre" label="Nombre completo" rules={[{ required: true, message: "Requerido" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dni" label="DNI">
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="area" label="Área" rules={[{ required: true, message: "Requerido" }]}>
            <Select
              showSearch allowClear
              placeholder="Seleccioná o tipeá nueva..."
              options={areasUnicas.map((a) => ({ value: a, label: a }))}
              mode="tags"
              maxCount={1}
              tokenSeparators={[]}
            />
          </Form.Item>
          <Form.Item name="puesto" label="Cargo / Puesto" rules={[{ required: true, message: "Requerido" }]}>
            <Input placeholder="Ej. SOLDADOR, TORNERO, EVALUADOR..." />
          </Form.Item>
          <Form.Item name="equipo_codigo" label="Máquina asignada (default al asignar tareas)">
            <Select
              showSearch allowClear
              placeholder="Ninguna"
              filterOption={(i, o) => String(o?.label ?? "").toLowerCase().includes(i.toLowerCase())}
              options={equipos.map((e) => ({
                value: e.codigo,
                label: `${e.descripcion} — ${e.codigo}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="costo_hora_hombre" label="Costo Hora Hombre (S/.)">
            <InputNumber
              min={0} step={0.5} precision={2}
              style={{ width: "100%" }}
              placeholder="0.00"
            />
          </Form.Item>
          <Form.Item name="costo_hora_extra" label="Costo Hora Extra (S/.)">
            <InputNumber
              min={0} step={0.5} precision={2}
              style={{ width: "100%" }}
              placeholder="0.00"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          cuentaUsuario
            ? `Cuenta de ${cuentaTrabajador?.nombre}`
            : `Asignar cuenta a ${cuentaTrabajador?.nombre}`
        }
        open={cuentaModalOpen}
        onCancel={() => setCuentaModalOpen(false)}
        confirmLoading={cuentaSaving}
        width={560}
        destroyOnHidden
        footer={
          <Space>
            {cuentaUsuario && (
              <Button danger icon={<DisconnectOutlined />} onClick={desvincularCuenta} loading={cuentaSaving}>
                Desvincular
              </Button>
            )}
            <Button onClick={() => setCuentaModalOpen(false)}>Cancelar</Button>
            <Button type="primary" onClick={handleSaveCuenta} loading={cuentaSaving}>
              {cuentaUsuario ? "Guardar cambios" : cuentaModo === "vincular" ? "Vincular cuenta" : "Crear cuenta"}
            </Button>
          </Space>
        }
      >
        {cuentaTrabajador && (
          <>
            <div style={{ marginBottom: 12, padding: 8, background: brand.bgPage, borderRadius: 4, fontSize: 12 }}>
              <div><Text type="secondary">Trabajador:</Text> <strong>{cuentaTrabajador.nombre}</strong></div>
              <div><Text type="secondary">DNI:</Text> {cuentaTrabajador.dni ?? "—"} · <Text type="secondary">Área:</Text> {cuentaTrabajador.area} · <Text type="secondary">Cargo:</Text> {cuentaTrabajador.puesto}</div>
              {cuentaUsuario && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">Código de empleado (login):</Text> <strong>{cuentaUsuario.codigoEmpleado}</strong>
                </div>
              )}
            </div>

            {!cuentaUsuario && (
              <Segmented
                block
                value={cuentaModo}
                onChange={(v) => setCuentaModo(v as "crear" | "vincular")}
                options={[
                  { value: "crear", label: <><UserAddOutlined /> Crear cuenta nueva</> },
                  { value: "vincular", label: <><LinkOutlined /> Vincular cuenta existente</> },
                ]}
                style={{ marginBottom: 16 }}
              />
            )}

            {!cuentaUsuario && cuentaModo === "vincular" && (
              <>
                <Alert
                  showIcon
                  type="info"
                  style={{ marginBottom: 12 }}
                  message="Vincular cuenta existente"
                  description="Elegí una cuenta ya creada. Las cuentas resaltadas en gris ya están vinculadas a otro trabajador — si las elegís, se va a transferir (el trabajador anterior queda sin cuenta)."
                />
                <Select
                  showSearch
                  style={{ width: "100%" }}
                  placeholder="Buscá por nombre, email o código..."
                  value={cuentaAVincular}
                  onChange={(v) => setCuentaAVincular(v)}
                  filterOption={(input, option) =>
                    String((option as { search?: string })?.search ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                  options={usuarios.map((u) => {
                    const yaVinculada = u.trabajadorId != null && u.trabajadorId !== cuentaTrabajador.trabajador_id;
                    const trabActual = yaVinculada ? rows.find((r) => r.trabajador_id === u.trabajadorId) : null;
                    return {
                      value: u.id,
                      search: `${u.codigoEmpleado} ${u.nombre} ${u.email ?? ""} ${u.roles.join(" ")}`,
                      label: (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: yaVinculada ? 0.6 : 1 }}>
                          <UserOutlined />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {u.nombre} <Text type="secondary" style={{ fontSize: 11 }}>— {u.codigoEmpleado}</Text>
                            </div>
                            <div style={{ fontSize: 11, color: brand.textSecondary }}>
                              {u.email ?? "(sin email)"} · {u.roles.join(", ") || "sin rol"}
                              {yaVinculada && trabActual && ` · vinculada a ${trabActual.nombre}`}
                              {yaVinculada && !trabActual && ` · vinculada a trabajador #${u.trabajadorId}`}
                              {!u.activo && " · INACTIVA"}
                            </div>
                          </div>
                          {yaVinculada && <Tag color="warning" style={{ fontSize: 10, margin: 0 }}>en uso</Tag>}
                        </div>
                      ),
                    };
                  })}
                />
              </>
            )}

            {!cuentaUsuario && cuentaModo === "crear" && (
              <div style={{ marginBottom: 12, fontSize: 11, color: brand.textSecondary }}>
                El código de login será:{" "}
                <strong>{cuentaTrabajador.dni ?? `USR-T${cuentaTrabajador.trabajador_id}`}</strong>
              </div>
            )}

            {(cuentaUsuario || cuentaModo === "crear") && (
              <Form form={cuentaForm} layout="vertical">
                <Form.Item name="email" label="Email (opcional, para login por correo)">
                  <Input type="email" placeholder="usuario@hpkinv.com" />
                </Form.Item>
                <Form.Item
                  name="roles"
                  label="Roles (multi-rol)"
                  rules={[{ required: true, type: "array", min: 1, message: "Asigná al menos un rol" }]}
                  extra="Tip: para un operario asignale tecnico + evaluador. Para un jefe que aprueba hojas, sumá aprobador_evaluacion."
                >
                  <Select
                    mode="multiple"
                    options={ROLES}
                    placeholder="Elegí uno o más roles..."
                    optionFilterProp="label"
                    tagRender={({ value, closable, onClose }) => (
                      <Tag
                        color={COLOR_POR_ROL[value as string] ?? "blue"}
                        closable={closable}
                        onClose={onClose}
                        style={{ marginInlineEnd: 4 }}
                      >
                        {value}
                      </Tag>
                    )}
                  />
                </Form.Item>
                <Form.Item
                  name="password"
                  label={cuentaUsuario ? "Nueva contraseña (dejá en blanco para no cambiar)" : "Contraseña inicial"}
                  rules={cuentaUsuario ? [] : [{ required: true, min: 6, message: "Mínimo 6 caracteres" }]}
                >
                  <Input.Password placeholder={cuentaUsuario ? "Sin cambios" : "Mínimo 6 caracteres"} autoComplete="new-password" />
                </Form.Item>
                <Form.Item name="activo" label="Estado de la cuenta">
                  <Select showSearch optionFilterProp="label" options={[{ value: true, label: "Activa" }, { value: false, label: "Inactiva" }]} />
                </Form.Item>
              </Form>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

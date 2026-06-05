"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, DatePicker, Popconfirm, Tooltip, Switch,
} from "antd";
import {
  ToolOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  EditOutlined, DeleteOutlined, EyeOutlined, StopOutlined, UndoOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSession } from "next-auth/react";
import dayjs, { type Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
  filtroPorColumna,
  usePersistedState,
} from "@/lib/tables";
import { areasTallerGrouped, areaTallerLabel } from "@/lib/areas-taller";
import { formatOtInternaCodigo } from "@/lib/ot-formato";

const { Title, Text } = Typography;

interface CatalogOption { codigo: string; nombre: string }
interface EquipoOption { codigo: string; descripcion: string }
interface EstrategiaOption { estrategia_id: number; codigo: string; descripcion: string }

interface OTInternaRow {
  id: number;
  // ot ahora es INTEGER (NNNNYY) tras la migración; el display OIXXXXYY se
  // construye con formatOtInternaCodigo.
  ot: number | string | null;
  activo: boolean;
  descripcion: string | null;
  planta_codigo: string | null;
  equipo_codigo: string | null;
  area_taller: string | null;
  semana_revision: string | null;
  task_list: string | null;
  estrategia_id: number | null;
  fecha_creacion: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  fecha_cierre: string | null;
  asignado_a: string | null;
  comentarios: string | null;
  version: number;
  equipo: { codigo: string; descripcion: string } | null;
  planta: { codigo: string; nombre: string } | null;
  tipo_ot_interna: { codigo: string; nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  estrategia: { estrategia_id: number; codigo: string; descripcion: string } | null;
  user_status: { codigo: string; nombre: string } | null;
  ot_status: { codigo: string; nombre: string } | null;
  recursos_status: { codigo: string; nombre: string } | null;
}

interface FormValues {
  tipo_ot_interna_codigo: string;
  area_taller: string;
  equipo_codigo?: string;
  descripcion: string;
  planta_codigo?: string;
  prioridad_atencion_codigo?: string;
  semana_revision?: string;
  estrategia_id?: number;
  task_list?: string;
  user_status_codigo?: string;
  asignado_a?: string;
  comentarios?: string;
  fecha_inicio_plan?: Dayjs | null;
  fecha_fin_plan?: Dayjs | null;
}

interface TrabajadorOpt { nombre: string; area: string; puesto: string }

export default function OrdenesTrabajoInternasPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { screens } = useResponsive();
  const { data: session } = useSession();
  // Eliminar / desactivar OTs internas es exclusivo del admin (destructivo).
  const esAdmin = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [form] = Form.useForm<FormValues>();

  // Estado
  const [rows, setRows] = useState<OTInternaRow[]>([]);
  const [verInactivas, setVerInactivas] = usePersistedState<boolean>("oti-list-ver-inactivas", false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  // Filtros persistidos por usuario (localStorage namespaced).
  const [search, setSearch] = usePersistedState<string>("oti-list-search", "");
  const [filterTipo, setFilterTipo] = usePersistedState<string | undefined>("oti-list-tipo", undefined);
  const [filterEquipo, setFilterEquipo] = usePersistedState<string | undefined>("oti-list-equipo", undefined);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OTInternaRow | null>(null);

  // Catálogos
  const [tiposOTInterna, setTiposOTInterna] = useState<CatalogOption[]>([]);
  const [equipos, setEquipos] = useState<EquipoOption[]>([]);
  const [plantas, setPlantas] = useState<CatalogOption[]>([]);
  const [prioridades, setPrioridades] = useState<CatalogOption[]>([]);
  const [userStatuses, setUserStatuses] = useState<CatalogOption[]>([]);
  const [estrategias, setEstrategias] = useState<EstrategiaOption[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);

  // El dropdown "Asignado a" en OTs internas muestra TODO el personal de
  // Logística (incluyendo jefe/compras/almacén) + Mantenimiento + Limpieza
  // + Software, más Antonio (Antonio Zumaeta Mendoza) por nombre.
  // Decisión del usuario (2026-05-28).
  const AREAS_ASIGNABLES_OT_INTERNA = new Set([
    "LOGISTICA",
    "MANTENIMIENTO",
    "LIMPIEZA",
    "SOFTWARE",
  ]);
  const trabajadoresAsignables = trabajadores.filter(
    (t) =>
      (t.area && AREAS_ASIGNABLES_OT_INTERNA.has(t.area.toUpperCase())) ||
      t.nombre.toLowerCase().includes("antonio"),
  );

  const { ocultas, setOcultas } = useColumnasOcultas("ot-internas-cols-v1", [
    "fecha_inicio_real", "fecha_fin_real", "fecha_cierre", "estrategia", "task_list", "recursos_status",
  ]);

  // Cargar catálogos una vez
  useEffect(() => {
    (async () => {
      const [tRes, eRes, pRes, prRes, usRes, estRes, trRes] = await Promise.all([
        fetch("/api/catalogos?tabla=tipoOTInterna"),
        // tipo=MAQ → solo máquinas (excluye herramientas/instrumentos). Las OT
        // internas se levantan contra máquinas del taller, no herramientas.
        fetch("/api/equipos?limit=500&tipo=MAQ"),
        fetch("/api/catalogos?tabla=planta"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=userStatus"),
        fetch("/api/catalogos?tabla=estrategia"),
        // No usamos soloOperarios=1 acá: necesitamos incluir JEFE DE LOGISTICA
        // y COMPRAS (que sí pueden ser asignados de OTs internas).
        fetch("/api/trabajadores?limit=200"),
      ]);
      if (tRes.ok) setTiposOTInterna((await tRes.json()).data ?? []);
      if (eRes.ok) setEquipos((await eRes.json()).data ?? []);
      if (pRes.ok) setPlantas((await pRes.json()).data ?? []);
      if (prRes.ok) setPrioridades((await prRes.json()).data ?? []);
      if (usRes.ok) setUserStatuses((await usRes.json()).data ?? []);
      if (estRes.ok) setEstrategias((await estRes.json()).data ?? []);
      if (trRes.ok) setTrabajadores((await trRes.json()).data ?? []);
    })();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (search) params.set("search", search);
      if (filterTipo) params.set("tipo", filterTipo);
      if (filterEquipo) params.set("equipo", filterEquipo);
      if (verInactivas) params.set("incluirInactivas", "1");
      const res = await fetch(`/api/ordenes-trabajo-internas?${params}`);
      if (res.ok) {
        const json = await res.json();
        setRows(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterTipo, filterEquipo, verInactivas]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openNuevoModal() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEditarModal(row: OTInternaRow) {
    setEditing(row);
    form.setFieldsValue({
      tipo_ot_interna_codigo: row.tipo_ot_interna?.codigo ?? "",
      area_taller: row.area_taller ?? "",
      equipo_codigo: row.equipo?.codigo,
      descripcion: row.descripcion ?? "",
      planta_codigo: row.planta?.codigo,
      prioridad_atencion_codigo: row.prioridad_atencion?.codigo,
      semana_revision: row.semana_revision ?? undefined,
      estrategia_id: row.estrategia?.estrategia_id,
      task_list: row.task_list ?? undefined,
      user_status_codigo: row.user_status?.codigo,
      asignado_a: row.asignado_a ?? undefined,
      comentarios: row.comentarios ?? undefined,
      fecha_inicio_plan: row.fecha_inicio_plan ? dayjs(row.fecha_inicio_plan) : null,
      fecha_fin_plan: row.fecha_fin_plan ? dayjs(row.fecha_fin_plan) : null,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        ...values,
        fecha_inicio_plan: values.fecha_inicio_plan ? values.fecha_inicio_plan.toISOString() : null,
        fecha_fin_plan: values.fecha_fin_plan ? values.fecha_fin_plan.toISOString() : null,
        ...(editing ? { version: editing.version } : {}),
      };
      const url = editing
        ? `/api/ordenes-trabajo-internas/${editing.id}`
        : "/api/ordenes-trabajo-internas";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error ?? "Error al guardar");
      }
      message.success(editing ? "OT actualizada" : "OT interna creada");
      setModalOpen(false);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Desactivar (anular, reversible) / reactivar. Solo admin.
  async function toggleActivo(r: OTInternaRow) {
    const activar = !r.activo;
    const res = await fetch(`/api/ordenes-trabajo-internas/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: activar }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { message.error(j.error ?? "No se pudo cambiar el estado"); return; }
    message.success(activar ? "OT interna reactivada" : "OT interna desactivada");
    fetchData();
  }

  // Eliminar en cascada (irreversible). Solo admin. Confirmación reforzada.
  function confirmarEliminar(r: OTInternaRow) {
    modal.confirm({
      title: `Eliminar OT interna ${formatOtInternaCodigo(r.ot, `#${r.id}`)} definitivamente`,
      okText: "Eliminar todo",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      width: 500,
      content: (
        <div style={{ fontSize: 13 }}>
          Esto borra <b>permanentemente</b> la OT interna y <b>todo lo relacionado</b>
          (requerimientos, adjuntos, historial). No se puede deshacer.
          <br /><br />
          Si solo querés ocultarla, usá <b>Desactivar</b> en su lugar.
        </div>
      ),
      onOk: async () => {
        const res = await fetch(`/api/ordenes-trabajo-internas/${r.id}`, { method: "DELETE" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(j.error ?? "No se pudo eliminar"); throw new Error("fail"); }
        message.success("OT interna eliminada");
        fetchData();
      },
    });
  }

  // Columnas
  const baseColumns: ColumnsType<OTInternaRow> = useMemo(() => [
    numeracionColumn<OTInternaRow>({ current: page, pageSize }),
    {
      key: "ot", title: "OT", dataIndex: "ot", width: 130,
      render: (_: unknown, r: OTInternaRow) => (
        <Space size={4}>
          {r.ot != null
            ? <Tag style={{ background: brand.navy, color: brand.white, border: "none", fontFamily: "monospace" }}>{formatOtInternaCodigo(r.ot)}</Tag>
            : "-"}
          {!r.activo && <Tag color="default">desactivada</Tag>}
        </Space>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 110,
      ...filtroPorColumna(rows, "tipo_ot_interna" as never),
      render: (_: unknown, r: OTInternaRow) => {
        const t = r.tipo_ot_interna?.codigo;
        if (!t) return "-";
        const color = t === "PREVENTIVA" ? "blue" : "orange";
        return <Tag color={color}>{r.tipo_ot_interna?.nombre}</Tag>;
      },
    },
    {
      key: "area_taller", title: "Área del taller", width: 200, ellipsis: true,
      render: (_: unknown, r: OTInternaRow) => {
        // Prioridad: área del taller (campo nuevo). Si no, fallback a equipo legacy.
        if (r.area_taller) return <span>{areaTallerLabel(r.area_taller)}</span>;
        if (r.equipo) {
          return <Tooltip title={r.equipo.descripcion}><span><b>{r.equipo.codigo}</b> · {r.equipo.descripcion}</span></Tooltip>;
        }
        return "-";
      },
    },
    {
      key: "descripcion", title: "Descripción", dataIndex: "descripcion", width: 260, ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "planta", title: "Planta", width: 90,
      render: (_: unknown, r: OTInternaRow) => r.planta?.codigo ?? "-",
    },
    {
      key: "prioridad", title: "Prio.", width: 70, align: "center",
      render: (_: unknown, r: OTInternaRow) => {
        const p = r.prioridad_atencion?.codigo;
        if (!p) return "-";
        const color = p === "1" ? "red" : p === "2" ? "orange" : p === "E" ? "volcano" : "default";
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      key: "semana_revision", title: "Revisión", dataIndex: "semana_revision", width: 100,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "user_status", title: "User Status", width: 130,
      render: (_: unknown, r: OTInternaRow) => r.user_status?.nombre
        ? <Tag>{r.user_status.nombre}</Tag>
        : "-",
    },
    {
      key: "ot_status", title: "OT Status", width: 110,
      render: (_: unknown, r: OTInternaRow) => r.ot_status?.nombre
        ? <Tag color={r.ot_status.codigo === "Abierta" ? "processing" : r.ot_status.codigo === "Cerrada" ? "success" : "default"}>
            {r.ot_status.nombre}
          </Tag>
        : "-",
    },
    {
      key: "recursos_status", title: "Recursos Status", width: 150,
      render: (_: unknown, r: OTInternaRow) => r.recursos_status?.nombre ?? "-",
    },
    {
      key: "asignado_a", title: "Asignado a", dataIndex: "asignado_a", width: 160, ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "comentarios", title: "Comentarios", dataIndex: "comentarios", width: 220, ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span>{v}</span></Tooltip>
        : "-",
    },
    {
      key: "estrategia", title: "Estrategia", width: 130,
      render: (_: unknown, r: OTInternaRow) => r.estrategia?.codigo ?? "-",
    },
    {
      key: "task_list", title: "Task list", dataIndex: "task_list", width: 200, ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "fecha_inicio_plan", title: "Inicio Plan", dataIndex: "fecha_inicio_plan", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_fin_plan", title: "Fin Plan", dataIndex: "fecha_fin_plan", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_inicio_real", title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_fin_real", title: "Fin Real", dataIndex: "fecha_fin_real", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_cierre", title: "Cierre", dataIndex: "fecha_cierre", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "acciones", title: "", width: esAdmin ? 180 : 120, fixed: "right",
      render: (_: unknown, r: OTInternaRow) => (
        <Space size="small">
          <Tooltip title="Ver detalle">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/ordenes-trabajo-internas/${r.id}`)}
            />
          </Tooltip>
          <Tooltip title="Editar">
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditarModal(r)} />
          </Tooltip>
          {esAdmin && (r.activo ? (
            <Popconfirm
              title="Desactivar esta OT interna"
              description="Se oculta de los listados. Reversible (los datos se conservan)."
              okText="Desactivar" cancelText="Cancelar"
              onConfirm={() => toggleActivo(r)}
            >
              <Tooltip title="Desactivar (anular)">
                <Button size="small" type="text" icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Reactivar">
              <Button size="small" type="text" icon={<UndoOutlined style={{ color: brand.success }} />} onClick={() => toggleActivo(r)} />
            </Tooltip>
          ))}
          {esAdmin && (
            <Tooltip title="Eliminar definitivamente (cascada)">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmarEliminar(r)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [page, pageSize, rows, esAdmin]);

  const { columnas, components, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<OTInternaRow>(baseColumns, "ot-internas-cols-widths-v1", { data: rows });

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8, color: brand.cyan }} />
            OTs Internas
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Mantenimiento de equipos del taller HP&amp;K (correctivas y preventivas).
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNuevoModal}>
            Nueva OT Interna
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8}>
            <Input
              placeholder="OT, equipo, descripción…"
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select showSearch optionFilterProp="label"
              placeholder="Tipo (Correctiva / Preventiva)"
              allowClear
              value={filterTipo}
              onChange={(v) => { setFilterTipo(v); setPage(1); }}
              options={tiposOTInterna.map((t) => ({ value: t.codigo, label: t.nombre }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={6}>
            <Select
              placeholder="Equipo"
              allowClear
              showSearch
              optionFilterProp="label"
              value={filterEquipo}
              onChange={(v) => { setFilterEquipo(v); setPage(1); }}
              options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} · ${e.descripcion}` }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={5}>
            <Space>
              <ColumnasToggleButton<OTInternaRow>
                columns={baseColumns}
                ocultas={ocultas}
                setOcultas={setOcultas}
                obligatorias={["__num", "ot", "acciones"]}
              />
              <Button onClick={resetAnchos}>Restablecer anchos</Button>
            </Space>
          </Col>
          {esAdmin && (
            <Col xs={24}>
              <Switch size="small" checked={verInactivas} onChange={(v) => { setVerInactivas(v); setPage(1); }} />
              <span style={{ marginLeft: 8, fontSize: 13, color: brand.textSecondary }}>
                Ver OTs internas desactivadas (anuladas)
              </span>
            </Col>
          )}
        </Row>
      </Card>

      <TableDragWrapper>
        <Table
          rowKey="id"
          columns={visibleColumns(columnas, ocultas, ["__num", "ot", "acciones"])}
          components={components}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: 2200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          // Row clickable — navega a la página detalle (igual que OT externas).
          // Filtramos clicks de los botones de acciones para no navegar cuando
          // ya están haciendo editar/eliminar desde la columna fija.
          onRow={(r) => ({
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button, .ant-popover, .ant-popconfirm")) return;
              router.push(`/ordenes-trabajo-internas/${r.id}`);
            },
            style: { cursor: "pointer" },
          })}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "OTs internas",
          })}
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${formatOtInternaCodigo(editing.ot, "")}` : "Nueva OT Interna"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText={editing ? "Guardar" : "Crear"}
        cancelText="Cancelar"
        width={modalWidth(screens, 720)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="tipo_ot_interna_codigo"
                label="Tipo de OT"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Select showSearch optionFilterProp="label"
                  placeholder="Correctiva / Preventiva"
                  options={tiposOTInterna.map((t) => ({ value: t.codigo, label: t.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item
                name="area_taller"
                label="Área del taller"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Select
                  placeholder="Elegí un área o sub-área"
                  showSearch
                  optionFilterProp="label"
                  options={areasTallerGrouped()}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item
                name="equipo_codigo"
                label="Equipo"
                tooltip="Equipo (máquina) del taller al que aplica la OT interna. Solo se listan equipos tipo MAQ — las herramientas no aparecen."
              >
                <Select
                  placeholder="Buscar equipo (código o descripción)"
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                name="descripcion"
                label="Descripción"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Input.TextArea rows={2} maxLength={500} placeholder="Detalle del trabajo a realizar" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="planta_codigo" label="Planta">
                <Select showSearch optionFilterProp="label"
                  allowClear
                  placeholder="Opcional"
                  options={plantas.map((p) => ({ value: p.codigo, label: p.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="prioridad_atencion_codigo" label="Prioridad">
                <Select showSearch optionFilterProp="label"
                  allowClear
                  placeholder="Opcional"
                  options={prioridades.map((p) => ({ value: p.codigo, label: p.nombre }))}
                />
              </Form.Item>
            </Col>
            {/* Semana revisión: solo aparece al editar — al crear no se pide. */}
            {editing && (
              <Col xs={12} md={6}>
                <Form.Item
                  name="semana_revision"
                  label="Semana revisión"
                  tooltip="Formato ISO YYYY-Www (ej: 2026W18)"
                >
                  <Input placeholder="2026W18" maxLength={10} />
                </Form.Item>
              </Col>
            )}
            <Col xs={12} md={6}>
              <Form.Item name="user_status_codigo" label="User Status">
                <Select showSearch optionFilterProp="label"
                  allowClear
                  placeholder="Opcional"
                  options={userStatuses.map((u) => ({ value: u.codigo, label: u.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item name="fecha_inicio_plan" label="Inicio planificado">
                <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item name="fecha_fin_plan" label="Fin planificado">
                <DatePicker showTime format="DD/MM/YY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="estrategia_id" label="Estrategia (opcional)">
                <Select
                  allowClear
                  showSearch
                  placeholder="Vincular a estrategia"
                  optionFilterProp="label"
                  options={estrategias.map((e) => ({ value: e.estrategia_id, label: `${e.codigo} — ${e.descripcion}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="task_list"
                label="Task list (referencia libre)"
                tooltip="Texto libre por ahora. En el futuro se vinculará al catálogo de Tarea."
              >
                <Input placeholder="MP1 · Cambio aceite trimestral" maxLength={200} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="asignado_a" label="Asignado a">
                <Select
                  allowClear
                  showSearch
                  placeholder="Operario que ejecuta"
                  optionFilterProp="label"
                  options={trabajadoresAsignables.map((t) => ({
                    value: t.nombre,
                    label: `${t.nombre} — ${t.area}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="comentarios" label="Comentarios">
                <Input.TextArea rows={3} maxLength={2000} placeholder="Notas / instrucciones / contexto adicional" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

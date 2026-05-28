"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Select, InputNumber,
  Modal, Form, Popconfirm, App, Tooltip,
} from "antd";
import {
  TeamOutlined, ReloadOutlined, SearchOutlined, PlusOutlined,
  EditOutlined, DeleteOutlined, ToolOutlined,
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

  useEffect(() => {
    fetch("/api/equipos?limit=500&tipo=MAQ")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.data) setEquipos(j.data); })
      .catch(() => { /* noop */ });
  }, []);

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
          <Select
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
    </div>
  );
}

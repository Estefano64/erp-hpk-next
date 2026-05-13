"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Table, Button, Space, Tag, InputNumber, Input, message, Spin, Alert, Row, Col,
  Select, Modal, Form, Tooltip, Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleFilled, DeleteOutlined, PlusOutlined,
  ArrowUpOutlined, ArrowDownOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
} from "@/lib/tables";

interface OperacionRow {
  operacion_cod_rep_id: number;
  cod_rep_codigo: string;
  componente_codigo: string;
  componente: { codigo: string; nombre: string } | null;
  operacion_reparacion_codigo: string | null;
  operacion_reparacion: { codigo: string; nombre: string } | null;
  trabajo: string;
  qty: number;
  horas: string | null;
  hh: string | null;
  orden: number;
}

interface CodRepSummary {
  codigo: string;
  descripcion: string;
  np: string | null;
  modelo_evaluacion?: { codigo: string; nombre: string } | null;
}

interface CatalogoOpcion { codigo: string; nombre: string }

type Draft = {
  horas?: number | null;
  hh?: number | null;
  trabajo?: string;
  componente_codigo?: string;
  operacion_reparacion_codigo?: string | null;
  qty?: number;
};

export default function OperacionesCodRepPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const codRepId = Number(params?.id);

  const [loading, setLoading] = useState(true);
  const [codRep, setCodRep] = useState<CodRepSummary | null>(null);
  const [rows, setRows] = useState<OperacionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { ocultas, setOcultas } = useColumnasOcultas("codrep-operaciones-cols-v1");

  // Modal nueva operación
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const componentesRes = useCachedFetch<Wrapped<CatalogoOpcion>>("/api/catalogos?tabla=componente");
  const operacionesRes = useCachedFetch<Wrapped<CatalogoOpcion>>("/api/catalogos?tabla=operacionReparacion");
  const componentes = componentesRes?.data ?? [];
  const operaciones = operacionesRes?.data ?? [];

  const componenteOpts = useMemo(
    () => componentes.map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.nombre}` })),
    [componentes],
  );
  const operacionOpts = useMemo(
    () => operaciones.map((o) => ({ value: o.codigo, label: `${o.codigo} — ${o.nombre}` })),
    [operaciones],
  );

  const fetchCodRep = useCallback(async () => {
    const res = await fetch(`/api/codigos-reparacion/${codRepId}`);
    if (res.ok) {
      const json = await res.json();
      setCodRep(json.data);
    }
  }, [codRepId]);

  const fetchOperaciones = useCallback(async (codigo: string) => {
    const res = await fetch(`/api/operaciones-cod-rep?cod_rep_codigo=${encodeURIComponent(codigo)}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchCodRep();
      setLoading(false);
    })();
  }, [fetchCodRep]);

  useEffect(() => {
    if (codRep?.codigo) fetchOperaciones(codRep.codigo);
  }, [codRep?.codigo, fetchOperaciones]);

  const persist = useCallback(async (id: number, patch: Draft) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/operaciones-cod-rep/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setRows((prev) => prev.map((r) => r.operacion_cod_rep_id === id ? { ...r, ...json.data } : r));
      }
      // Limpio el draft de los campos que ya se guardaron
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [messageApi]);

  // Update con debounce (para campos numéricos / texto)
  const updateDraftDebounced = useCallback((id: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(() => {
      persist(id, patch);
    }, 600);
  }, [persist]);

  // Update inmediato (para selects que no escriben rápido)
  const updateImmediate = useCallback((id: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    persist(id, patch);
  }, [persist]);

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/operaciones-cod-rep/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const err = await res.json().catch(() => null);
        messageApi.warning(err?.error ?? "No se puede eliminar.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al eliminar.");
        return;
      }
      messageApi.success("Operación eliminada.");
      if (codRep?.codigo) fetchOperaciones(codRep.codigo);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function handleMove(idx: number, direction: -1 | 1) {
    const j = idx + direction;
    if (j < 0 || j >= rows.length) return;
    const a = rows[idx];
    const b = rows[j];
    // Swap de orden
    await Promise.all([
      fetch(`/api/operaciones-cod-rep/${a.operacion_cod_rep_id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: b.orden }),
      }),
      fetch(`/api/operaciones-cod-rep/${b.operacion_cod_rep_id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: a.orden }),
      }),
    ]);
    if (codRep?.codigo) fetchOperaciones(codRep.codigo);
  }

  async function handleCreate(values: {
    componente_codigo: string;
    trabajo: string;
    operacion_reparacion_codigo?: string | null;
    qty?: number;
    horas?: number | null;
    hh?: number | null;
  }) {
    if (!codRep?.codigo) return;
    setCreating(true);
    try {
      const res = await fetch("/api/operaciones-cod-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cod_rep_codigo: codRep.codigo,
          ...values,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al crear.");
        return;
      }
      messageApi.success("Operación agregada.");
      setModalOpen(false);
      form.resetFields();
      fetchOperaciones(codRep.codigo);
    } finally {
      setCreating(false);
    }
  }

  // Cuando el usuario elige un código de catálogo en el modal, autocompleta el trabajo con su nombre
  function onCatalogoChangeNuevo(codigo: string | null) {
    if (!codigo) return;
    const op = operaciones.find((o) => o.codigo === codigo);
    if (op) {
      const trabajoActual = form.getFieldValue("trabajo");
      if (!trabajoActual) form.setFieldValue("trabajo", op.nombre);
    }
  }

  const totalHH = rows.reduce((a, r) => a + Number(r.hh ?? 0), 0);
  const totalHoras = rows.reduce((a, r) => a + Number(r.horas ?? 0), 0);

  // Valores únicos para filtros
  const componenteValores = [...new Set(rows.map((r) => r.componente_codigo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const trabajoValores = [...new Set(rows.map((r) => r.trabajo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const opCatValores = [...new Set(rows.map((r) => r.operacion_reparacion_codigo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const qtyValores = [...new Set(rows.map((r) => r.qty))]
    .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) }));
  const horasValores = [...new Set(rows.map((r) => r.horas).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: Number(v).toFixed(2), value: v }));
  const hhValores = [...new Set(rows.map((r) => r.hh).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: Number(v).toFixed(2), value: v }));

  const columns: ColumnsType<OperacionRow> = [
    {
      title: "#", key: "orden", width: 70, align: "center",
      render: (_, _r, idx) => (
        <Space size={0}>
          <Tooltip title="Subir">
            <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => handleMove(idx, -1)} />
          </Tooltip>
          <Tooltip title="Bajar">
            <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={idx === rows.length - 1} onClick={() => handleMove(idx, 1)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: "Componente", key: "componente", width: 200,
      filters: componenteValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.operacion_cod_rep_id]?.componente_codigo ?? r.componente_codigo) === value,
      render: (_, r) => (
        <Select
          value={drafts[r.operacion_cod_rep_id]?.componente_codigo ?? r.componente_codigo}
          onChange={(v) => updateImmediate(r.operacion_cod_rep_id, { componente_codigo: v })}
          options={componenteOpts}
          showSearch
          size="small"
          style={{ width: "100%" }}
          filterOption={(i, o) => String(o?.label ?? "").toLowerCase().includes(i.toLowerCase())}
        />
      ),
    },
    {
      title: "Trabajo", key: "trabajo", ellipsis: true,
      filters: trabajoValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.operacion_cod_rep_id]?.trabajo ?? r.trabajo) === value,
      render: (_, r) => (
        <Input
          value={drafts[r.operacion_cod_rep_id]?.trabajo ?? r.trabajo}
          size="small"
          onChange={(e) => updateDraftDebounced(r.operacion_cod_rep_id, { trabajo: e.target.value })}
          placeholder="Descripción del trabajo…"
        />
      ),
    },
    {
      title: "Op. (catálogo)", key: "op", width: 200,
      filters: opCatValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.operacion_cod_rep_id]?.operacion_reparacion_codigo ?? r.operacion_reparacion_codigo) === value,
      render: (_, r) => (
        <Select
          value={drafts[r.operacion_cod_rep_id]?.operacion_reparacion_codigo ?? r.operacion_reparacion_codigo ?? undefined}
          onChange={(v) => updateImmediate(r.operacion_cod_rep_id, { operacion_reparacion_codigo: v ?? null })}
          options={operacionOpts}
          allowClear
          showSearch
          size="small"
          style={{ width: "100%" }}
          placeholder="Sin código"
          filterOption={(i, o) => String(o?.label ?? "").toLowerCase().includes(i.toLowerCase())}
        />
      ),
    },
    {
      title: "QTY", key: "qty", width: 80, align: "center",
      filters: qtyValores, filterSearch: true,
      onFilter: (value, r) => String(drafts[r.operacion_cod_rep_id]?.qty ?? r.qty) === value,
      render: (_, r) => (
        <InputNumber
          value={drafts[r.operacion_cod_rep_id]?.qty ?? r.qty}
          min={1}
          step={1}
          size="small"
          style={{ width: "100%" }}
          onChange={(v) => updateDraftDebounced(r.operacion_cod_rep_id, { qty: v == null ? 1 : Number(v) })}
        />
      ),
    },
    {
      title: "HORAS", key: "horas", width: 100, align: "right",
      filters: horasValores, filterSearch: true,
      onFilter: (value, r) => String(drafts[r.operacion_cod_rep_id]?.horas ?? r.horas ?? "") === value,
      render: (_, r) => {
        const current = drafts[r.operacion_cod_rep_id]?.horas ?? (r.horas != null ? Number(r.horas) : null);
        return (
          <InputNumber
            value={current ?? undefined}
            min={0}
            step={0.5}
            size="small"
            style={{ width: "100%" }}
            placeholder="—"
            onChange={(v) => updateDraftDebounced(r.operacion_cod_rep_id, { horas: v == null ? null : Number(v) })}
          />
        );
      },
    },
    {
      title: "HH", key: "hh", width: 100, align: "right",
      filters: hhValores, filterSearch: true,
      onFilter: (value, r) => String(drafts[r.operacion_cod_rep_id]?.hh ?? r.hh ?? "") === value,
      render: (_, r) => {
        const current = drafts[r.operacion_cod_rep_id]?.hh ?? (r.hh != null ? Number(r.hh) : null);
        return (
          <InputNumber
            value={current ?? undefined}
            min={0}
            step={0.5}
            size="small"
            style={{ width: "100%" }}
            placeholder="—"
            onChange={(v) => updateDraftDebounced(r.operacion_cod_rep_id, { hh: v == null ? null : Number(v) })}
          />
        );
      },
    },
    {
      title: "", key: "estado", width: 40, align: "center",
      render: (_, r) => {
        const isSaving = savingId === r.operacion_cod_rep_id;
        const hasHoras = r.horas != null && Number(r.horas) > 0;
        if (isSaving) return <span style={{ color: brand.cyan, fontSize: 11 }}>…</span>;
        if (hasHoras) return <CheckCircleFilled style={{ color: brand.success }} />;
        return null;
      },
    },
    {
      title: "", key: "actions", width: 50, align: "center",
      render: (_, r) => (
        <Popconfirm
          title="Eliminar esta operación"
          description="Falla si hay planificaciones referenciándola."
          onConfirm={() => handleDelete(r.operacion_cod_rep_id)}
          okText="Eliminar"
          okButtonProps={{ danger: true }}
          cancelText="Cancelar"
        >
          <Tooltip title="Eliminar">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<OperacionRow>(columns, "codrep-ops-cols-widths-v1");

  if (loading) return <Spin size="large" />;
  if (!codRep) return <Alert type="error" title="CodRep no encontrado" />;

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/codigos-reparacion")}>Volver</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Operaciones <Tag color={brand.navy} style={{ marginLeft: 8 }}>{codRep.codigo}</Tag>
        </Typography.Title>
      </Space>

      <Alert
        type="info"
        showIcon
        title="Plantilla de operaciones para esta reparación"
        description="Editá inline cualquier campo (Componente, Trabajo, Op. del catálogo, Qty, Horas, HH). Los cambios se guardan automáticamente. Usá ▲▼ para reordenar y 🗑️ para eliminar."
        style={{ marginBottom: 16 }}
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <div style={{ fontWeight: 500 }}>{codRep.descripcion}</div>
            <div style={{ fontSize: 12, color: brand.textSecondary }}>NP: {codRep.np ?? "-"}</div>
          </Col>
          <Col>
            <div style={{ fontSize: 12 }}>Total HORAS</div>
            <div style={{ fontWeight: 600 }}>{totalHoras.toFixed(2)}</div>
          </Col>
          <Col>
            <div style={{ fontSize: 12 }}>Total HH</div>
            <div style={{ fontWeight: 600, color: brand.cyan }}>{totalHH.toFixed(2)}</div>
          </Col>
          <Col>
            <ColumnasToggleButton<OperacionRow>
              columns={columns}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["orden", "componente", "trabajo", "actions"]}
            />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Agregar operación
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="operacion_cod_rep_id"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={rows}
        pagination={false}
        size="small"
        scroll={{ x: 1200 }}
        sticky={{ offsetHeader: 56, offsetScroll: 0 }}
      />

      <Modal
        title="Agregar operación a la plantilla"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText="Crear"
        cancelText="Cancelar"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ qty: 1 }}>
          <Form.Item
            name="componente_codigo"
            label="Componente"
            rules={[{ required: true, message: "Componente requerido" }]}
          >
            <Select showSearch options={componenteOpts}
              filterOption={(i, o) => String(o?.label ?? "").toLowerCase().includes(i.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="operacion_reparacion_codigo" label="Op. (catálogo)" extra="Opcional. Si elegís uno, se autocompleta el Trabajo.">
            <Select showSearch allowClear options={operacionOpts}
              onChange={onCatalogoChangeNuevo}
              filterOption={(i, o) => String(o?.label ?? "").toLowerCase().includes(i.toLowerCase())}
            />
          </Form.Item>
          <Form.Item
            name="trabajo"
            label="Trabajo (descripción)"
            rules={[{ required: true, message: "Descripción requerida" }, { max: 200 }]}
          >
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="qty" label="Qty"><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="horas" label="Horas"><InputNumber min={0} step={0.5} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="hh" label="HH"><InputNumber min={0} step={0.5} style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

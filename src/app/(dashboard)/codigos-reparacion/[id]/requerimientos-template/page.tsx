"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Table, Button, Space, Tag, Input, InputNumber, Select,
  Modal, Form, Tooltip, Popconfirm, message, Spin, Alert, Row, Col,
} from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined,
  ArrowUpOutlined, ArrowDownOutlined, InboxOutlined,
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

const { Title, Text } = Typography;

interface CodRepSummary {
  codigo: string;
  descripcion: string;
  np: string | null;
}

interface TareaRow {
  tarea_id: number;
  cod_rep_codigo: string | null;
  actividad_codigo: string;
  tipo_codigo: string;
  material_codigo: string | null;
  material: { codigo: string; descripcion: string; fabricante_codigo: string | null; unidad_medida_codigo: string | null; precio: string | null; moneda_codigo: string | null } | null;
  fabricante_codigo: string | null;
  fabricante: { codigo: string; nombre: string } | null;
  servicio_codigo: string | null;
  np: string | null;
  np_cod1: string | null;
  np_cod2: string | null;
  texto: string | null;
  descripcion: string;
  ref_descripcion: string | null;
  requerimiento: string;
  precio: string | null;
  item_numero: number;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  fabricante_codigo: string | null;
  unidad_medida_codigo: string | null;
  precio: string | null;
  moneda_codigo: string | null;
  np: string | null;
}

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };

type Draft = {
  tipo_codigo?: string;
  material_codigo?: string | null;
  fabricante_codigo?: string | null;
  servicio_codigo?: string | null;
  descripcion?: string;
  requerimiento?: number;
  precio?: number | null;
  np?: string | null;
  texto?: string | null;
};

export default function TemplateRequerimientosPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const codRepId = Number(params?.id);

  const [loading, setLoading] = useState(true);
  const [codRep, setCodRep] = useState<CodRepSummary | null>(null);
  const [rows, setRows] = useState<TareaRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { ocultas, setOcultas } = useColumnasOcultas("codrep-req-template-cols-v1");

  // Modal nueva
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<{
    tipo_codigo: "MAC" | "CAD" | "SER";
    material_codigo?: string;
    fabricante_codigo?: string;
    servicio_codigo?: string;
    descripcion: string;
    requerimiento: number;
    precio?: number;
    np?: string;
    texto?: string;
    actividad_codigo: string;
  }>();
  const tipoForm = Form.useWatch("tipo_codigo", form);

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const matsRes = useCachedFetch<Wrapped<MaterialOpt>>("/api/materiales?limit=2000");
  const materiales = matsRes?.data ?? [];
  const fabsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string }>>("/api/catalogos?tabla=fabricante");
  const fabricantes = fabsRes?.data ?? [];
  const sersRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string; descripcion: string | null }>>("/api/catalogos?tabla=servicioReparacion");
  const servicios = sersRes?.data ?? [];

  const fetchCodRep = useCallback(async () => {
    const res = await fetch(`/api/codigos-reparacion/${codRepId}`);
    if (res.ok) {
      const json = await res.json();
      setCodRep(json.data);
    }
  }, [codRepId]);

  const fetchTareas = useCallback(async (codigo: string) => {
    const res = await fetch(`/api/tareas?cod_rep_codigo=${encodeURIComponent(codigo)}`);
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
    if (codRep?.codigo) fetchTareas(codRep.codigo);
  }, [codRep?.codigo, fetchTareas]);

  // ── Persist con debounce ──
  const persist = useCallback(async (id: number, patch: Draft) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/tareas/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 403) {
        messageApi.error("Solo los administradores pueden modificar templates.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setRows((prev) => prev.map((r) => r.tarea_id === id ? { ...r, ...json.data } : r));
      }
      setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [messageApi]);

  const updateDebounced = useCallback((id: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(() => persist(id, patch), 600);
  }, [persist]);

  const updateImmediate = useCallback((id: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    persist(id, patch);
  }, [persist]);

  // ── Reorder ──
  async function handleMove(idx: number, direction: -1 | 1) {
    const j = idx + direction;
    if (j < 0 || j >= rows.length) return;
    const a = rows[idx], b = rows[j];
    await Promise.all([
      fetch(`/api/tareas/${a.tarea_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_numero: b.item_numero }) }),
      fetch(`/api/tareas/${b.tarea_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_numero: a.item_numero }) }),
    ]);
    if (codRep?.codigo) fetchTareas(codRep.codigo);
  }

  // ── Eliminar ──
  async function handleDelete(id: number) {
    const res = await fetch(`/api/tareas/${id}`, { method: "DELETE" });
    if (res.status === 403) {
      messageApi.error("Solo los administradores pueden modificar templates.");
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al eliminar.");
      return;
    }
    messageApi.success("Item eliminado.");
    if (codRep?.codigo) fetchTareas(codRep.codigo);
  }

  // ── Auto-fill modales ──
  function onMaterialSelect(codigo: string | undefined) {
    if (!codigo) return;
    const m = materiales.find((x) => x.codigo === codigo);
    if (!m) return;
    form.setFieldsValue({
      descripcion: form.getFieldValue("descripcion") || m.descripcion,
      np: form.getFieldValue("np") || (m.codigo ?? undefined),
      precio: m.precio != null ? Number(m.precio) : undefined,
      fabricante_codigo: m.fabricante_codigo ?? undefined,
    });
  }
  function onServicioSelect(codigo: string | undefined) {
    if (!codigo) return;
    const s = servicios.find((x) => x.codigo === codigo);
    if (!s) return;
    form.setFieldsValue({
      descripcion: s.nombre,
      texto: s.descripcion ?? form.getFieldValue("texto") ?? undefined,
    });
  }

  // ── Crear (modal) ──
  function abrirCrear() {
    form.resetFields();
    form.setFieldsValue({
      tipo_codigo: "MAC",
      requerimiento: 1,
      actividad_codigo: codRep?.codigo ?? "",
    });
    setModalOpen(true);
  }
  async function onSubmitCrear() {
    if (!codRep?.codigo) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tareas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, cod_rep_codigo: codRep.codigo }),
      });
      if (res.status === 403) {
        messageApi.error("Solo los administradores pueden modificar templates.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al crear.");
        return;
      }
      messageApi.success("Item agregado al template.");
      setModalOpen(false);
      fetchTareas(codRep.codigo);
    } finally {
      setCreating(false);
    }
  }

  // Stats — incluye totales por moneda (USD, SOL, y "Sin moneda" para precios manuales sin material)
  const stats = useMemo(() => {
    const counts = { MAC: 0, CAD: 0, SER: 0 };
    let total = 0;
    const totalPorMoneda: Record<string, number> = {};
    const matByCode = new Map(materiales.map((m) => [m.codigo, m] as const));
    for (const r of rows) {
      if (r.tipo_codigo === "MAC") counts.MAC++;
      else if (r.tipo_codigo === "CAD") counts.CAD++;
      else if (r.tipo_codigo === "SER") counts.SER++;
      total++;
      const draft = drafts[r.tarea_id];
      const matCode = draft?.material_codigo ?? r.material_codigo;
      let precio: number | null = null;
      let moneda: string = "—";
      if (matCode) {
        const mat = matByCode.get(matCode);
        if (mat?.precio != null) {
          precio = Number(mat.precio);
          moneda = mat.moneda_codigo ?? "—";
        }
      }
      if (precio == null) {
        const p = draft?.precio ?? (r.precio != null ? Number(r.precio) : null);
        if (p != null && !Number.isNaN(p)) precio = p;
      }
      const qty = draft?.requerimiento ?? Number(r.requerimiento ?? 0);
      if (precio != null && !Number.isNaN(qty)) {
        totalPorMoneda[moneda] = (totalPorMoneda[moneda] ?? 0) + precio * qty;
      }
    }
    return { ...counts, total, totalPorMoneda };
  }, [rows, drafts, materiales]);

  // Helper: material efectivo (draft tiene prioridad sobre el guardado).
  const getEffectiveMaterial = (r: TareaRow): MaterialOpt | null => {
    const code = drafts[r.tarea_id]?.material_codigo ?? r.material_codigo;
    if (!code) return null;
    return materiales.find((m) => m.codigo === code) ?? null;
  };

  // Valores únicos para filtros
  const materialValores = [...new Set(rows.map((r) => r.material_codigo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const fabValores = [...new Set(rows.map((r) => r.fabricante_codigo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const npValores = [...new Set(rows.map((r) => r.np).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const textoValores = [...new Set(rows.map((r) => r.texto).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const qtyValores = [...new Set(rows.map((r) => Number(r.requerimiento)))]
    .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) }));
  const precioValores = [...new Set(rows.map((r) => r.precio).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: Number(v).toFixed(2), value: v }));

  // Columnas
  const columns: ColumnsType<TareaRow> = [
    {
      title: "#", key: "orden", width: 90, align: "center",
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
      title: "Tipo", key: "tipo", width: 110,
      filters: [
        { text: "MAC", value: "MAC" },
        { text: "CAD", value: "CAD" },
        { text: "SER", value: "SER" },
      ],
      onFilter: (value, r) => (drafts[r.tarea_id]?.tipo_codigo ?? r.tipo_codigo) === value,
      render: (_, r) => (
        <Select
          value={drafts[r.tarea_id]?.tipo_codigo ?? r.tipo_codigo}
          onChange={(v) => updateImmediate(r.tarea_id, { tipo_codigo: v })}
          options={[
            { value: "MAC", label: <Tag color="blue" style={{ margin: 0 }}>MAC</Tag> },
            { value: "CAD", label: <Tag color="orange" style={{ margin: 0 }}>CAD</Tag> },
            { value: "SER", label: <Tag color="purple" style={{ margin: 0 }}>SER</Tag> },
          ]}
          size="small"
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Material", key: "material", width: 240,
      filters: materialValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.tarea_id]?.material_codigo ?? r.material_codigo) === value,
      render: (_, r) => {
        const isMac = (drafts[r.tarea_id]?.tipo_codigo ?? r.tipo_codigo) === "MAC";
        if (!isMac) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        return (
          <Select
            value={drafts[r.tarea_id]?.material_codigo ?? r.material_codigo ?? undefined}
            onChange={(v) => updateImmediate(r.tarea_id, { material_codigo: v ?? null })}
            options={materiales.map((m) => ({
              value: m.codigo,
              label: `${m.codigo} — ${m.descripcion}${m.np ? ` · NP ${m.np}` : ""}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
            }))}
            allowClear
            showSearch
            optionFilterProp="label"
            size="small"
            style={{ width: "100%" }}
            placeholder="—"
          />
        );
      },
    },
    {
      title: "Fabricante", key: "fab", width: 180,
      filters: fabValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.tarea_id]?.fabricante_codigo ?? r.fabricante_codigo) === value,
      render: (_, r) => {
        const mat = getEffectiveMaterial(r);
        if (mat) {
          return mat.fabricante_codigo
            ? <Tag color="default" style={{ margin: 0 }}>{mat.fabricante_codigo}</Tag>
            : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        }
        return (
          <Select
            value={drafts[r.tarea_id]?.fabricante_codigo ?? r.fabricante_codigo ?? undefined}
            onChange={(v) => updateImmediate(r.tarea_id, { fabricante_codigo: v ?? null })}
            options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
            allowClear
            showSearch
            optionFilterProp="label"
            size="small"
            style={{ width: "100%" }}
            placeholder="—"
          />
        );
      },
    },
    {
      title: "N/P", key: "np", width: 130,
      filters: npValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.tarea_id]?.np ?? r.np) === value,
      render: (_, r) => {
        const mat = getEffectiveMaterial(r);
        if (mat) {
          return mat.np
            ? <Text style={{ fontSize: 12 }}>{mat.np}</Text>
            : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        }
        return (
          <Input
            value={drafts[r.tarea_id]?.np ?? r.np ?? ""}
            size="small"
            onChange={(e) => updateDebounced(r.tarea_id, { np: e.target.value || null })}
            placeholder="—"
          />
        );
      },
    },
    {
      title: "Texto", key: "texto", width: 160,
      filters: textoValores, filterSearch: true,
      onFilter: (value, r) => (drafts[r.tarea_id]?.texto ?? r.texto) === value,
      render: (_, r) => {
        const tipo = drafts[r.tarea_id]?.tipo_codigo ?? r.tipo_codigo;
        if (tipo !== "SER") {
          return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        }
        return (
          <Input
            value={drafts[r.tarea_id]?.texto ?? r.texto ?? ""}
            size="small"
            onChange={(e) => updateDebounced(r.tarea_id, { texto: e.target.value || null })}
            placeholder="—"
          />
        );
      },
    },
    {
      title: "Qty", key: "qty", width: 80, align: "right",
      filters: qtyValores, filterSearch: true,
      onFilter: (value, r) => String(drafts[r.tarea_id]?.requerimiento ?? Number(r.requerimiento)) === value,
      render: (_, r) => (
        <InputNumber
          value={drafts[r.tarea_id]?.requerimiento ?? Number(r.requerimiento)}
          min={0}
          step={1}
          size="small"
          style={{ width: "100%" }}
          onChange={(v) => updateDebounced(r.tarea_id, { requerimiento: v == null ? 0 : Number(v) })}
        />
      ),
    },
    {
      title: "Precio", key: "precio", width: 100, align: "right",
      filters: precioValores, filterSearch: true,
      onFilter: (value, r) => String(drafts[r.tarea_id]?.precio ?? r.precio ?? "") === value,
      render: (_, r) => {
        const mat = getEffectiveMaterial(r);
        if (mat) {
          return mat.precio != null
            ? <Text style={{ fontSize: 12 }}>{Number(mat.precio).toFixed(2)}</Text>
            : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        }
        return (
          <InputNumber
            value={drafts[r.tarea_id]?.precio ?? (r.precio != null ? Number(r.precio) : undefined)}
            min={0}
            step={0.01}
            size="small"
            style={{ width: "100%" }}
            placeholder="—"
            onChange={(v) => updateDebounced(r.tarea_id, { precio: v == null ? null : Number(v) })}
          />
        );
      },
    },
    {
      title: "", key: "saving", width: 30, align: "center",
      render: (_, r) => savingId === r.tarea_id ? <span style={{ color: brand.cyan, fontSize: 11 }}>…</span> : null,
    },
    {
      title: "", key: "actions", width: 50, align: "center", fixed: "right",
      render: (_, r) => (
        <Popconfirm
          title="Eliminar este item del template"
          onConfirm={() => handleDelete(r.tarea_id)}
          okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar"
        >
          <Tooltip title="Eliminar">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<TareaRow>(columns, "codrep-req-cols-widths-v1");

  if (loading) return <Spin size="large" />;
  if (!codRep) return <Alert type="error" title="CodRep no encontrado" />;

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/codigos-reparacion")}>Volver</Button>
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8 }} />
          Template requerimientos <Tag color={brand.navy} style={{ marginLeft: 8 }}>{codRep.codigo}</Tag>
        </Title>
      </Space>

      <Alert
        type="info"
        showIcon
        title="Plantilla de requerimientos para esta reparación"
        description="Editá inline cualquier campo. Estos items se copiarán a los requerimientos de cada OT que use este cod_rep cuando se apriete 'Generar desde template'. Los cambios acá NO afectan OTs ya creadas."
        style={{ marginBottom: 16 }}
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <div style={{ fontWeight: 500 }}>{codRep.descripcion}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>NP: {codRep.np ?? "-"}</Text>
          </Col>
          <Col><Tag color={brand.navy}>Total: {stats.total}</Tag></Col>
          <Col><Tag color="blue">MAC: {stats.MAC}</Tag></Col>
          <Col><Tag color="orange">CAD: {stats.CAD}</Tag></Col>
          <Col><Tag color="purple">SER: {stats.SER}</Tag></Col>
          {Object.entries(stats.totalPorMoneda).map(([moneda, monto]) => {
            const simbolo = moneda === "USD" ? "$" : moneda === "SOL" ? "S/" : moneda === "—" ? "" : moneda;
            const label = moneda === "—" ? "Sin moneda" : moneda;
            return (
              <Col key={moneda}>
                <Tag color={brand.cyan} style={{ fontSize: 13, padding: "2px 10px" }}>
                  {label}: {simbolo}{simbolo && " "}{monto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Tag>
              </Col>
            );
          })}
          <Col>
            <ColumnasToggleButton<TareaRow>
              columns={columns}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["orden", "tipo", "desc", "actions"]}
            />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={abrirCrear}>
              Agregar item
            </Button>
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="tarea_id"
        columns={visibleColumns(columnsResizable, ocultas)}
        components={tableComponents}
        dataSource={rows}
        size="small"
        pagination={false}
        scroll={{ x: 1300 }}
        sticky={{ offsetHeader: 56, offsetScroll: 0 }}
      />

      <Modal
        title="Agregar item al template"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={onSubmitCrear}
        confirmLoading={creating}
        okText="Agregar"
        cancelText="Cancelar"
        width={680}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="tipo_codigo" label="Tipo" rules={[{ required: true }]}>
            <Select options={[
              { value: "MAC", label: "MAC — Material catalogado" },
              { value: "CAD", label: "CAD — Cargo directo" },
              { value: "SER", label: "SER — Servicio" },
            ]} />
          </Form.Item>

          <Form.Item name="actividad_codigo" label="Actividad / NP cod 1" rules={[{ required: true }]}
            extra="Identificador interno; por defecto se usa el código del cod_rep.">
            <Input />
          </Form.Item>

          {tipoForm === "MAC" && (
            <Form.Item name="material_codigo" label="Material" rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder="Buscá por código o descripción…"
                optionFilterProp="label"
                onChange={onMaterialSelect}
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}${m.np ? ` · NP ${m.np}` : ""}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
                }))}
              />
            </Form.Item>
          )}

          {tipoForm === "SER" && (
            <Form.Item name="servicio_codigo" label="Servicio (catálogo)"
              extra="Seleccioná uno del catálogo y se autocompleta la descripción.">
              <Select
                showSearch allowClear
                optionFilterProp="label"
                onChange={onServicioSelect}
                options={servicios.map((s) => ({
                  value: s.codigo,
                  label: `${s.codigo} — ${s.nombre}`,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, max: 500 }]}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="requerimiento" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select
                  showSearch allowClear
                  optionFilterProp="label"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
                  placeholder="—"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="precio" label="Precio (opcional)">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="np" label="N/P">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="texto" label="Texto / Detalle">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

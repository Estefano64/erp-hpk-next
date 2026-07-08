"use client";

// Requerimientos (template) del grupo (Máquina + Pauta PM). Espejo del
// patrón /codigos-reparacion/[id]/requerimientos-template/page.tsx.
//
// Cada fila es un TaskListItem — puede pertenecer a distintas Tareas
// (TaskList) del mismo grupo. Se muestra la Tarea padre como referencia para
// mantener el contexto (varias tareas en un mismo PM comparten un pool).
//
// CRUD inline por fila: Tipo (MAC/CAD/SER), Material (Select con autocomplete
// para MAC), N/P, Cantidad, UM, Notas, Precio referencial. Al crear un item
// nuevo, se pide seleccionar a qué Tarea padre pertenece.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Typography, Card, Table, Button, Space, Tag, Input, InputNumber, Select, message, Spin, Alert,
  Row, Col, Popconfirm, Modal, Form,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleFilled, DeleteOutlined, PlusOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Tarea {
  id: number;
  descripcion: string;
  usuario_responsable: string | null;
  items: TaskItem[];
}

interface TaskItem {
  id: number;
  task_list_id: number;
  item: number;
  tipo: "MAC" | "CAD" | "SER";
  material_codigo: string | null;
  ref_descripcion: string | null;
  np: string | null;
  requerimiento: number | string | null;
  um: string | null;
  texto: string | null;
  precio: number | string | null;
  material?: { codigo: string; descripcion: string; np: string | null } | null;
}

// Fila plana en la tabla: item + su tarea padre (denormalizado desde el
// resultado del fetch al endpoint principal).
interface Row extends TaskItem {
  tarea_id: number;
  tarea_descripcion: string;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
}

type Draft = Partial<{
  tipo: "MAC" | "CAD" | "SER";
  material_codigo: string | null;
  ref_descripcion: string | null;
  np: string | null;
  requerimiento: number | null;
  um: string | null;
  texto: string | null;
  precio: number | null;
}>;

const TIPO_COLOR: Record<string, string> = {
  MAC: "blue",
  CAD: "geekblue",
  SER: "purple",
};

export default function RequerimientosGrupoPage() {
  const params = useParams<{ maquina: string; actividad: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const maquina = decodeURIComponent(params?.maquina ?? "");
  const actividad = decodeURIComponent(params?.actividad ?? "");

  // Filtro opcional por tarea padre — cuando se llega desde el botón "Ítems"
  // en la sub-página de Tareas (?tarea=123).
  const tareaFiltroInicial = searchParams.get("tarea");
  const [tareaFiltro, setTareaFiltro] = useState<string | undefined>(
    tareaFiltroInicial ?? undefined,
  );

  const [loading, setLoading] = useState(true);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { ocultas, setOcultas } = useColumnasOcultas("task-lists-requerimientos-cols-v1");

  // Modal para nuevo item — hay que elegir la Tarea padre + tipo + datos.
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  type Wrapped<T> = { data: T[] } | null;
  const matsRes = useCachedFetch<Wrapped<MaterialOpt>>("/api/materiales?limit=10000");
  const materiales = matsRes?.data ?? [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "1000");
      qs.set("maquina_taller", maquina);
      qs.set("actividad_codigo", actividad);
      const res = await fetch(`/api/mantenimiento/task-lists?${qs}`);
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      setTareas(json.data ?? []);
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [maquina, actividad, messageApi]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Aplanar items con su tarea padre para la tabla plana.
  const allRows: Row[] = useMemo(() => {
    const acc: Row[] = [];
    for (const t of tareas) {
      for (const it of t.items) {
        acc.push({ ...it, tarea_id: t.id, tarea_descripcion: t.descripcion });
      }
    }
    return acc;
  }, [tareas]);

  const rows: Row[] = useMemo(() => {
    if (!tareaFiltro) return allRows;
    const filterId = Number(tareaFiltro);
    if (!Number.isFinite(filterId)) return allRows;
    return allRows.filter((r) => r.tarea_id === filterId);
  }, [allRows, tareaFiltro]);

  // Totales por tipo + por moneda (aproximado: no distinguimos USD/PEN, el
  // schema no tiene moneda a nivel ítem — mostramos el subtotal genérico).
  const totales = useMemo(() => {
    let mac = 0, cad = 0, ser = 0;
    let subtotal = 0;
    for (const r of rows) {
      if (r.tipo === "MAC") mac++;
      else if (r.tipo === "CAD") cad++;
      else if (r.tipo === "SER") ser++;
      const q = Number(r.requerimiento ?? 0);
      const p = Number(r.precio ?? 0);
      if (Number.isFinite(q) && Number.isFinite(p)) subtotal += q * p;
    }
    return { mac, cad, ser, subtotal };
  }, [rows]);

  // Debounced save por fila.
  const flushSave = useCallback(async (itemId: number, patch: Draft) => {
    setSavingId(itemId);
    try {
      const res = await fetch(`/api/mantenimiento/task-lists/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al guardar");
      }
      const j = await res.json();
      setTareas((prev) => prev.map((t) => ({
        ...t,
        items: t.items.map((it) => (it.id === itemId ? { ...it, ...j.data } : it)),
      })));
      setDrafts((prev) => {
        const { [itemId]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }, [messageApi]);

  const scheduleSave = useCallback((itemId: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
    if (debounceTimers.current[itemId]) clearTimeout(debounceTimers.current[itemId]);
    debounceTimers.current[itemId] = setTimeout(() => {
      const merged = { ...(drafts[itemId] ?? {}), ...patch };
      flushSave(itemId, merged);
    }, 600);
  }, [drafts, flushSave]);

  async function eliminarItem(itemId: number) {
    try {
      const res = await fetch(`/api/mantenimiento/task-lists/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al eliminar");
      }
      setTareas((prev) => prev.map((t) => ({ ...t, items: t.items.filter((it) => it.id !== itemId) })));
      messageApi.success("Ítem eliminado");
    } catch (e) {
      messageApi.error((e as Error).message);
    }
  }

  async function crearItem(values: {
    task_list_id: number;
    tipo: "MAC" | "CAD" | "SER";
    material_codigo?: string | null;
    ref_descripcion?: string | null;
    np?: string | null;
    requerimiento?: number | null;
    um?: string | null;
    texto?: string | null;
    precio?: number | null;
  }) {
    setCreating(true);
    try {
      const { task_list_id, ...body } = values;
      const res = await fetch(`/api/mantenimiento/task-lists/${task_list_id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al crear");
      }
      const j = await res.json();
      setTareas((prev) => prev.map((t) =>
        t.id === task_list_id ? { ...t, items: [...t.items, j.data] } : t,
      ));
      setModalOpen(false);
      form.resetFields();
      messageApi.success("Ítem creado");
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnsType<Row> = useMemo(() => [
    {
      key: "num", title: "#", width: 60, align: "center",
      render: (_: unknown, __: Row, i: number) => i + 1,
    },
    {
      key: "tarea", title: "Tarea", width: 180, ellipsis: true,
      render: (_: unknown, r: Row) => (
        <Text style={{ fontSize: 12 }} title={r.tarea_descripcion}>
          {r.tarea_descripcion}
        </Text>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 100,
      render: (_: unknown, r: Row) => {
        const value = drafts[r.id]?.tipo ?? r.tipo;
        return (
          <Select
            size="small"
            style={{ width: "100%" }}
            value={value}
            onChange={(v) => scheduleSave(r.id, { tipo: v })}
            options={[
              { value: "MAC", label: <Tag color={TIPO_COLOR.MAC}>MAC</Tag> },
              { value: "CAD", label: <Tag color={TIPO_COLOR.CAD}>CAD</Tag> },
              { value: "SER", label: <Tag color={TIPO_COLOR.SER}>SER</Tag> },
            ]}
          />
        );
      },
    },
    {
      key: "material", title: "Material / Descripción",
      render: (_: unknown, r: Row) => {
        const tipo = drafts[r.id]?.tipo ?? r.tipo;
        if (tipo === "MAC") {
          const value = drafts[r.id]?.material_codigo ?? r.material_codigo ?? undefined;
          return (
            <Select
              size="small"
              showSearch
              allowClear
              optionFilterProp="label"
              style={{ width: "100%" }}
              value={value}
              placeholder="Buscar material…"
              onChange={(v) => scheduleSave(r.id, { material_codigo: v ?? null })}
              options={materiales.map((m) => ({
                value: m.codigo,
                label: `${m.codigo} — ${m.descripcion}${m.np ? ` · ${m.np}` : ""}`,
              }))}
            />
          );
        }
        const value = drafts[r.id]?.ref_descripcion ?? r.ref_descripcion ?? "";
        return (
          <Input
            size="small"
            value={value}
            placeholder={tipo === "SER" ? "Servicio (ej SVC Cromado)" : "Descripción del cargo"}
            onChange={(e) => scheduleSave(r.id, { ref_descripcion: e.target.value || null })}
          />
        );
      },
    },
    {
      key: "np", title: "N/P", width: 130,
      render: (_: unknown, r: Row) => {
        const value = drafts[r.id]?.np ?? r.np ?? "";
        return (
          <Input
            size="small"
            value={value}
            onChange={(e) => scheduleSave(r.id, { np: e.target.value || null })}
            placeholder="—"
          />
        );
      },
    },
    {
      key: "requerimiento", title: "Cantidad", width: 100, align: "right",
      render: (_: unknown, r: Row) => {
        const draftV = drafts[r.id]?.requerimiento;
        const value = draftV !== undefined ? draftV : (r.requerimiento != null ? Number(r.requerimiento) : null);
        return (
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            value={value}
            step={0.001}
            onChange={(v) => scheduleSave(r.id, { requerimiento: v == null ? null : Number(v) })}
          />
        );
      },
    },
    {
      key: "um", title: "UM", width: 80, align: "center",
      render: (_: unknown, r: Row) => {
        const value = drafts[r.id]?.um ?? r.um ?? "";
        return (
          <Input
            size="small"
            value={value}
            onChange={(e) => scheduleSave(r.id, { um: e.target.value || null })}
            placeholder="—"
          />
        );
      },
    },
    {
      key: "texto", title: "Notas",
      render: (_: unknown, r: Row) => {
        const value = drafts[r.id]?.texto ?? r.texto ?? "";
        return (
          <Input.TextArea
            size="small"
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={value}
            onChange={(e) => scheduleSave(r.id, { texto: e.target.value || null })}
            placeholder="—"
          />
        );
      },
    },
    {
      key: "precio", title: "Precio ref.", width: 110, align: "right",
      render: (_: unknown, r: Row) => {
        const draftV = drafts[r.id]?.precio;
        const value = draftV !== undefined ? draftV : (r.precio != null ? Number(r.precio) : null);
        return (
          <InputNumber
            size="small"
            style={{ width: "100%" }}
            value={value}
            step={0.01}
            precision={2}
            onChange={(v) => scheduleSave(r.id, { precio: v == null ? null : Number(v) })}
          />
        );
      },
    },
    {
      key: "estado", title: "", width: 40, align: "center",
      render: (_: unknown, r: Row) =>
        savingId === r.id ? (
          <Spin size="small" />
        ) : drafts[r.id] ? (
          <Tag color="warning">•</Tag>
        ) : (
          <CheckCircleFilled style={{ color: brand.success }} />
        ),
    },
    {
      key: "acciones", title: "", width: 60, align: "center",
      render: (_: unknown, r: Row) => (
        <Popconfirm
          title="¿Eliminar este ítem?"
          okType="danger"
          onConfirm={() => eliminarItem(r.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [rows, drafts, savingId, materiales, scheduleSave]);

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Row>(columns, "task-lists-requerimientos-widths-v1", { data: rows });

  const tipoSeleccionado = Form.useWatch("tipo", form) as "MAC" | "CAD" | "SER" | undefined;

  if (!maquina || !actividad) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}>Grupo inválido</div></Card>;
  }

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/mantenimiento/task-lists")}>
            Volver
          </Button>
          <Title level={3} style={{ margin: 0 }}>Template requerimientos</Title>
          <Tag color={brand.navy} style={{ fontSize: 13 }}>{maquina}</Tag>
          <Tag color="cyan" style={{ fontSize: 13 }}>{actividad}</Tag>
        </Space>
      </div>

      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        title="Plantilla de requerimientos para este grupo"
        description={
          <>
            Estos ítems son los materiales / cargos directos / servicios que
            se copiarán a los requerimientos de cada OT interna que use la
            misma máquina + pauta cuando se apriete
            <b> &quot;Aplicar Task List&quot;</b>. Los cambios acá <b>NO</b> afectan OTs
            ya creadas.
          </>
        }
      />

      <Card
        size="small"
        styles={{ body: { padding: 12 } }}
        style={{ marginBottom: 12, borderColor: brand.border }}
      >
        <Row justify="space-between" align="middle" gutter={[8, 8]}>
          <Col>
            <Space wrap size={12}>
              <Text style={{ fontSize: 11, color: brand.textSecondary, textTransform: "uppercase" }}>Total</Text>
              <Text strong>{rows.length}</Text>
              <Tag color={TIPO_COLOR.MAC}>MAC: {totales.mac}</Tag>
              <Tag color={TIPO_COLOR.CAD}>CAD: {totales.cad}</Tag>
              <Tag color={TIPO_COLOR.SER}>SER: {totales.ser}</Tag>
              <Tag color="green">
                Subtotal ref.: {totales.subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Tag>
              {tareaFiltro && (
                <Tag closable onClose={() => setTareaFiltro(undefined)} color="orange">
                  Filtrando por tarea #{tareaFiltro}
                </Tag>
              )}
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <ColumnasToggleButton<Row>
                columns={columns}
                ocultas={ocultas}
                setOcultas={setOcultas}
                obligatorias={["num", "tipo", "material", "acciones"]}
              />
              <Button onClick={resetAnchos}>Restablecer anchos</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  form.setFieldsValue({
                    tipo: "MAC",
                    // Precarga la tarea filtrada si viene por URL.
                    task_list_id: tareaFiltro ? Number(tareaFiltro) : undefined,
                  });
                  setModalOpen(true);
                }}
                disabled={tareas.length === 0}
              >
                Agregar ítem
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<Row>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1300 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </TableDragWrapper>

      {/* Modal para crear un item — pide Tarea padre + tipo + datos según tipo. */}
      <Modal
        open={modalOpen}
        title="Nuevo ítem del template"
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
        width={modalWidth(screens, 640)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={crearItem}
          initialValues={{ tipo: "MAC" }}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="task_list_id" label="Tarea padre" rules={[{ required: true, message: "Elegí a qué tarea pertenece el ítem" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Elegí la tarea padre"
                  options={tareas.map((t) => ({
                    value: t.id,
                    label: `${t.descripcion} (${t.items.length} ítems)`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}>
                <Select options={[
                  { value: "MAC", label: "MAC" },
                  { value: "CAD", label: "CAD" },
                  { value: "SER", label: "SER" },
                ]} />
              </Form.Item>
            </Col>
            {tipoSeleccionado === "MAC" ? (
              <Col span={24}>
                <Form.Item name="material_codigo" label="Material" rules={[{ required: true, message: "Elegí un material" }]}>
                  <Select
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Buscar material…"
                    options={materiales.map((m) => ({
                      value: m.codigo,
                      label: `${m.codigo} — ${m.descripcion}${m.np ? ` · ${m.np}` : ""}`,
                    }))}
                  />
                </Form.Item>
              </Col>
            ) : (
              <Col span={24}>
                <Form.Item name="ref_descripcion" label={tipoSeleccionado === "SER" ? "Servicio" : "Descripción del cargo"} rules={[{ required: true }]}>
                  <Input placeholder={tipoSeleccionado === "SER" ? "SVC Cromado, SVC NDT, ..." : "Aceite, disolvente, ..."} />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="np" label="Número de parte">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="requerimiento" label="Cantidad">
                <InputNumber style={{ width: "100%" }} step={0.001} min={0} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="um" label="UM">
                <Input placeholder="lt, und, kg…" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="precio" label="Precio referencial">
                <InputNumber style={{ width: "100%" }} step={0.01} precision={2} min={0} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="texto" label="Notas">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

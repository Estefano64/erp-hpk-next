"use client";

// Tareas del grupo (Máquina + Pauta PM) — plantilla inline-editable.
// Espejo del patrón /codigos-reparacion/[id]/operaciones/page.tsx pero para
// Task Lists de Mantenimiento. Cada fila es una TaskList del grupo (todas
// comparten máquina + actividad). El usuario puede:
//   - Editar descripción / responsable inline (debounce 600ms → PUT).
//   - Agregar una tarea nueva (POST).
//   - Eliminar una tarea (DELETE — cascadea a items).
//
// El grupo se identifica por dos segmentos de URL codificados
// (encodeURIComponent). No hay ID de grupo en BD — es virtual.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Table, Button, Space, Tag, Input, message, Spin, Alert, Row, Col, Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleFilled, DeleteOutlined, PlusOutlined, InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface Tarea {
  id: number;
  maquina_taller: string;
  actividad_codigo: string;
  descripcion: string;
  usuario_responsable: string | null;
  activo: boolean;
  items: { id: number }[];
}

type Draft = {
  descripcion?: string;
  usuario_responsable?: string | null;
};

export default function TareasGrupoPage() {
  const params = useParams<{ maquina: string; actividad: string }>();
  const router = useRouter();
  const maquina = decodeURIComponent(params?.maquina ?? "");
  const actividad = decodeURIComponent(params?.actividad ?? "");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Tarea[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _responsive = useResponsive();
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { ocultas, setOcultas } = useColumnasOcultas("task-lists-tareas-cols-v1");

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
      setRows(json.data ?? []);
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [maquina, actividad, messageApi]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounced save: acumula el draft por fila y a los 600ms manda un solo
  // PUT con el patch. Idéntico patrón a operaciones-cod-rep.
  const flushSave = useCallback(async (rowId: number, patch: Draft) => {
    setSavingId(rowId);
    try {
      const res = await fetch(`/api/mantenimiento/task-lists/${rowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al guardar");
      }
      const j = await res.json();
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...j.data } : r)));
      setDrafts((prev) => {
        const { [rowId]: _drop, ...rest } = prev;
        return rest;
      });
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }, [messageApi]);

  const scheduleSave = useCallback((rowId: number, patch: Draft) => {
    setDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
    if (debounceTimers.current[rowId]) clearTimeout(debounceTimers.current[rowId]);
    debounceTimers.current[rowId] = setTimeout(() => {
      const merged = { ...(drafts[rowId] ?? {}), ...patch };
      flushSave(rowId, merged);
    }, 600);
  }, [drafts, flushSave]);

  async function agregarTarea() {
    setCreating(true);
    try {
      const res = await fetch(`/api/mantenimiento/task-lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maquina_taller: maquina,
          actividad_codigo: actividad,
          descripcion: "Nueva tarea",
          usuario_responsable: null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al crear tarea");
      }
      const j = await res.json();
      // Insertamos la nueva tarea en la lista y foco visual al principio.
      setRows((prev) => [...prev, { ...j.data, items: j.data.items ?? [] }]);
      messageApi.success("Tarea creada");
    } catch (e) {
      messageApi.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function eliminarTarea(id: number) {
    try {
      const res = await fetch(`/api/mantenimiento/task-lists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al eliminar");
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      messageApi.success("Tarea eliminada");
    } catch (e) {
      messageApi.error((e as Error).message);
    }
  }

  const columns: ColumnsType<Tarea> = useMemo(() => [
    {
      key: "num", title: "#", width: 60, align: "center",
      render: (_: unknown, __: Tarea, i: number) => i + 1,
    },
    {
      key: "descripcion", title: "Descripción de la tarea",
      render: (_: unknown, r: Tarea) => {
        const value = drafts[r.id]?.descripcion ?? r.descripcion;
        return (
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 4 }}
            value={value}
            onChange={(e) => scheduleSave(r.id, { descripcion: e.target.value })}
            placeholder="Descripción de la tarea"
          />
        );
      },
    },
    {
      key: "responsable", title: "Responsable", width: 200,
      render: (_: unknown, r: Tarea) => {
        const value = drafts[r.id]?.usuario_responsable ?? r.usuario_responsable ?? "";
        return (
          <Input
            value={value}
            onChange={(e) => scheduleSave(r.id, { usuario_responsable: e.target.value || null })}
            placeholder="Responsable"
            allowClear
          />
        );
      },
    },
    {
      key: "items_count", title: "Ítems", width: 90, align: "center",
      render: (_: unknown, r: Tarea) => (
        <Button
          type="link"
          size="small"
          icon={<InboxOutlined />}
          onClick={() =>
            router.push(
              `/mantenimiento/task-lists/grupo/${encodeURIComponent(maquina)}/${encodeURIComponent(actividad)}/requerimientos?tarea=${r.id}`,
            )
          }
        >
          {r.items.length}
        </Button>
      ),
    },
    {
      key: "estado", title: "", width: 40, align: "center",
      render: (_: unknown, r: Tarea) =>
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
      render: (_: unknown, r: Tarea) => (
        <Popconfirm
          title="¿Eliminar esta tarea?"
          description="Se borrarán también sus ítems (materiales/servicios)."
          okType="danger"
          onConfirm={() => eliminarTarea(r.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [rows, drafts, savingId, router, maquina, actividad, scheduleSave]);

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<Tarea>(columns, "task-lists-tareas-widths-v1", { data: rows });

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
          <Title level={3} style={{ margin: 0 }}>Tareas</Title>
          <Tag color={brand.navy} style={{ fontSize: 13 }}>{maquina}</Tag>
          <Tag color="cyan" style={{ fontSize: 13 }}>{actividad}</Tag>
        </Space>
      </div>

      <Alert
        style={{ marginBottom: 12 }}
        type="info"
        showIcon
        title="Plantilla de tareas para este grupo (máquina + pauta)"
        description={
          <>
            Editá inline cualquier campo. Los cambios se guardan automáticamente.
            Los ítems (materiales / cargos / servicios) se ven en el tab
            <b> Requerimientos</b>, y también podés abrirlos desde el conteo por
            fila.
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
            <Space wrap size={16}>
              <Text style={{ fontSize: 11, color: brand.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Total tareas
              </Text>
              <Text strong style={{ fontSize: 16 }}>{rows.length}</Text>
              <Text style={{ fontSize: 11, color: brand.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Total ítems
              </Text>
              <Text strong style={{ fontSize: 16, color: brand.cyan }}>
                {rows.reduce((s, r) => s + r.items.length, 0)}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <ColumnasToggleButton<Tarea>
                columns={columns}
                ocultas={ocultas}
                setOcultas={setOcultas}
                obligatorias={["num", "descripcion", "acciones"]}
              />
              <Button onClick={resetAnchos}>Restablecer anchos</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={agregarTarea}
                loading={creating}
              >
                Agregar tarea
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <TableDragWrapper>
        <Table<Tarea>
          rowKey="id"
          size="small"
          loading={loading}
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
        />
      </TableDragWrapper>
    </div>
  );
}

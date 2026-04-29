"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography, message,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, UnorderedListOutlined, EditOutlined, DeleteOutlined, CloseOutlined,
  PlayCircleOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useTabSync } from "@/lib/useTabSync";

interface Props {
  otId: number;
  codRepCodigo: string | null;
}

interface PlanRow {
  id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
  tipo_reparacion: string | null;
  orden: number;
  qty?: number;
  horas_estimadas: string | null;
  horas_reales: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  tecnico: string | null;
  maquina: string | null;
  estado: string | null;
  version: number;
  operacion_cod_rep_id: number | null;
  created_at: string;
}

interface ComponenteOpt { codigo: string; nombre: string }
interface OperacionOpt { codigo: string; nombre: string; componente_codigo: string | null; clasificacion: string }
interface EquipoOpt { codigo: string; descripcion: string }

const TIPO_TAREA_OPTS = [
  { value: "Estandar", label: "Estándar" },
  { value: "NoEstandar", label: "No estándar" },
];

interface StatusTareaOpt { codigo: string; nombre: string; color: string | null }

export default function OTTareasTab({ otId, codRepCodigo }: Props) {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autogenerating, setAutogenerating] = useState(false);
  const [componentes, setComponentes] = useState<ComponenteOpt[]>([]);
  const [operaciones, setOperaciones] = useState<OperacionOpt[]>([]);
  const [equipos, setEquipos] = useState<EquipoOpt[]>([]);
  const [estadosCat, setEstadosCat] = useState<StatusTareaOpt[]>([]);
  const [form] = Form.useForm();
  const [parte, setParte] = useState<string | null>(null);
  const [tipoTarea, setTipoTarea] = useState<string>("Estandar");
  const [messageApi, contextHolder] = message.useMessage();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ordenes-trabajo/${otId}/planificacion`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
    }
    setLoading(false);
  }, [otId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  const notifySync = useTabSync("planificacion", fetchRows);

  // Carga catálogos una vez al montar el tab (no al abrir el form)
  useEffect(() => {
    (async () => {
      try {
        const [resC, resO, resE, resS] = await Promise.all([
          fetch("/api/catalogos?tabla=componente"),
          fetch("/api/catalogos?tabla=operacionReparacion"),
          fetch("/api/equipos?limit=200&tipo=MAQ"),
          fetch("/api/catalogos?tabla=statusTarea"),
        ]);
        const jsonC = await resC.json();
        const jsonO = await resO.json();
        const jsonE = await resE.json();
        const jsonS = await resS.json();
        setComponentes(jsonC.data ?? []);
        setOperaciones(jsonO.data ?? []);
        setEquipos((jsonE.data ?? []).map((e: { codigo: string; descripcion: string }) => ({ codigo: e.codigo, descripcion: e.descripcion })));
        setEstadosCat(jsonS.data ?? []);
      } catch (e) {
        console.error("Error cargando catálogos Tareas:", e);
      }
    })();
  }, []);

  async function ejecutarAutogen(sobreescribir: boolean) {
    setAutogenerating(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/planificacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sobreescribir }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      const json = await res.json();
      messageApi.success(`${json.inserted} tareas generadas desde ${json.cod_rep}`);
      fetchRows();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al autogenerar");
    } finally {
      setAutogenerating(false);
    }
  }

  function handleAutogenerar() {
    if (!codRepCodigo) {
      messageApi.warning("Esta OT no tiene CodRep asignado; no se puede autogenerar.");
      return;
    }
    if (rows.length === 0) {
      ejecutarAutogen(false);
      return;
    }
    Modal.confirm({
      title: "¿Regenerar task list?",
      content: `Esta OT ya tiene ${rows.length} tarea(s). Si confirmás, se BORRARÁN todas y se generarán de nuevo desde ${codRepCodigo}. Los cambios manuales (técnico asignado, fechas, estado) se perderán.`,
      okText: "Sí, regenerar",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      onOk: () => ejecutarAutogen(true),
    });
  }

  function openForm() {
    form.resetFields();
    form.setFieldsValue({ tipo_tarea: "Estandar", qty: 1 });
    setParte(null);
    setTipoTarea("Estandar");
    setFormOpen(true);
  }

  async function saveTarea() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const body: Record<string, unknown> = {
        ot_id: otId,
        componente_codigo: values.parte,
        tipo_reparacion: values.tipo_tarea ?? "Estandar",
        qty: Number(values.qty ?? 1),
        maquina: values.equipo ?? null,
      };
      if (usarTextoLibre) {
        body.trabajo = values.trabajo_manual;
      } else {
        body.operacion_reparacion_codigo = values.operacion_codigo;
      }
      const res = await fetch("/api/planificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      messageApi.success("Tarea agregada");
      setFormOpen(false);
      fetchRows();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/planificacion/${id}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Tarea eliminada");
      fetchRows();
    } else {
      messageApi.error("Error al eliminar");
    }
  }

  // Helper para PUT con versioning + manejo de 409
  async function putTarea(r: PlanRow, patch: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/planificacion/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, version: r.version }),
    });
    if (res.status === 409) {
      messageApi.warning("Otro usuario actualizó esta tarea. Refresco para sincronizar.");
      fetchRows();
      return false;
    }
    if (res.status === 423) {
      messageApi.error("Tarea cerrada (realizado). No se puede editar.");
      return false;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al guardar");
      return false;
    }
    notifySync();
    return true;
  }

  async function handleIniciar(r: PlanRow) {
    const ok = await putTarea(r, { fecha_inicio_real: new Date().toISOString() });
    if (ok) {
      messageApi.success("Tarea iniciada");
      fetchRows();
    }
  }

  async function handleFinalizar(r: PlanRow) {
    if (!r.fecha_inicio_real) {
      messageApi.warning("Marcá Iniciar primero.");
      return;
    }
    const horasReales = (Date.now() - new Date(r.fecha_inicio_real).getTime()) / 3600_000;
    const ok = await putTarea(r, {
      fecha_fin_real: new Date().toISOString(),
      horas_reales: Number(horasReales.toFixed(2)),
    });
    if (ok) {
      messageApi.success(`Tarea finalizada (${horasReales.toFixed(2)}h)`);
      fetchRows();
    }
  }

  const progreso = rows.length
    ? Math.round((rows.filter((r) => r.estado === "realizado").length / rows.length) * 100)
    : 0;

  // Filtro por Parte + Clasificación (STD / NO_STD). Si el tipoTarea no matchea ninguna clasificación
  // (ej: "NoEstandar" pero no hay ops NO_STD para esa Parte), se cae a texto libre.
  const clasObjetivo = tipoTarea === "NoEstandar" ? "NO_STD" : "STD";
  const operacionesFiltradas = parte
    ? operaciones.filter((o) => o.componente_codigo === parte && o.clasificacion === clasObjetivo)
    : [];
  const usarTextoLibre = parte !== null && operacionesFiltradas.length === 0;

  const columns: ColumnsType<PlanRow> = [
    { title: "N°", dataIndex: "orden", width: 50, align: "center" },
    {
      title: "Parte", dataIndex: "componente", width: 110,
      render: (v: string) => <Tag color={brand.cyan}>{v}</Tag>,
    },
    { title: "Tarea", dataIndex: "descripcion", ellipsis: true,
      render: (v: string, r) => {
        const code = (r.operacion_codigo ?? "").trim();
        const desc = (v ?? "").trim();
        // No prefijar si es fallback (EVAL/CUSTOM) o si el código === descripción (autogenerado sin match)
        const isFallback = !code || code === "EVAL" || code === "CUSTOM" || code.toLowerCase() === desc.toLowerCase();
        return <div style={{ fontWeight: 500 }}>{isFallback ? desc : `${code} - ${desc}`}</div>;
      },
    },
    { title: "Tipo", dataIndex: "tipo_reparacion", width: 100, render: (v: string | null) => v ?? "Estandar" },
    { title: "Qty", key: "qty", width: 60, align: "center", render: () => 1 },
    { title: "HE", key: "he", width: 55, align: "center", render: () => <span style={{ color: brand.textSecondary }}>—</span> },
    { title: "Qty HE", key: "qty_he", width: 60, align: "center", render: () => <span style={{ color: brand.textSecondary }}>—</span> },
    {
      title: "Dur.(hrs)", dataIndex: "horas_estimadas", width: 80, align: "right",
      render: (v: string | null) => v == null ? <span style={{ color: brand.textSecondary }}>—</span> : Number(v).toFixed(2),
    },
    {
      title: "HH", key: "hh", width: 70, align: "right",
      render: () => <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Inicio Est.", dataIndex: "fecha_inicio", width: 100,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY") : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Fin Est.", dataIndex: "fecha_fin", width: 100,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY") : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Equipo", dataIndex: "maquina", width: 130,
      render: (v: string | null) => v ?? <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Operario", dataIndex: "tecnico", width: 120,
      render: (v: string | null) => v ?? <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 110,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Fin Real", dataIndex: "fecha_fin_real", width: 110,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Dur. Real", key: "dur_real", width: 90, align: "right",
      render: (_: unknown, r: PlanRow) => {
        // Si hay ambas fechas reales, calcular duración (resta sin descontar almuerzo)
        if (r.fecha_inicio_real && r.fecha_fin_real) {
          const h = dayjs(r.fecha_fin_real).diff(dayjs(r.fecha_inicio_real), "minute") / 60;
          return <span>{h.toFixed(2)}</span>;
        }
        if (r.horas_reales != null) return Number(r.horas_reales).toFixed(2);
        return <span style={{ color: brand.textSecondary }}>—</span>;
      },
    },
    {
      title: "Estado Tarea", dataIndex: "estado", width: 120,
      render: (v: string | null) => {
        const cat = estadosCat.find((e) => e.codigo === (v ?? "abierto"));
        return <Tag color={cat?.color ?? "default"}>{cat?.nombre ?? v ?? "-"}</Tag>;
      },
    },
    {
      title: "Creado", dataIndex: "created_at", width: 120,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      title: "Acc.", key: "acc", width: 130, align: "center", fixed: "right",
      render: (_: unknown, r: PlanRow) => {
        const realizada = r.estado === "realizado";
        const iniciada = !!r.fecha_inicio_real;
        const finalizada = !!r.fecha_fin_real;
        return (
          <Space size="small">
            {!realizada && !iniciada && (
              <Tooltip title="Iniciar tarea (registra fecha/hora real)">
                <Button type="text" size="small" icon={<PlayCircleOutlined style={{ color: brand.success }} />} onClick={() => handleIniciar(r)} />
              </Tooltip>
            )}
            {!realizada && iniciada && !finalizada && (
              <Tooltip title="Finalizar tarea (calcula horas reales)">
                <Button type="text" size="small" icon={<CheckCircleOutlined style={{ color: brand.cyan }} />} onClick={() => handleFinalizar(r)} />
              </Tooltip>
            )}
            <Button type="text" size="small" icon={<EditOutlined style={{ color: brand.navy }} />} disabled={realizada} />
            <Popconfirm title="¿Eliminar tarea?" onConfirm={() => handleDelete(r.id)} disabled={realizada}>
              <Button type="text" size="small" icon={<DeleteOutlined style={{ color: realizada ? "#ccc" : brand.error }} />} disabled={realizada} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {contextHolder}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <UnorderedListOutlined style={{ marginRight: 8 }} />
          Planeamiento de Operaciones
        </Typography.Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleAutogenerar}
            loading={autogenerating}
            disabled={!codRepCodigo}
            title={codRepCodigo ? `Generar desde ${codRepCodigo}` : "La OT necesita CodRep"}
          >
            Task list (autogenerar)
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openForm}>
            Nueva Tarea
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16, background: "#F0F7FF" }} styles={{ body: { padding: "10px 16px" } }}>
        <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 4 }}>Progreso General</div>
        <Progress percent={progreso} size="small" />
      </Card>

      {formOpen && (
        <Card
          title={<span style={{ fontSize: 14 }}>Nueva Tarea</span>}
          size="small"
          style={{ marginBottom: 16, borderStyle: "dashed", borderColor: brand.cyan }}
          extra={<Button type="text" icon={<CloseOutlined />} onClick={() => setFormOpen(false)} />}
        >
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col xs={24} sm={12} md={5}>
                <Form.Item name="parte" label="Parte*" rules={[{ required: true, message: "Requerido" }]}>
                  <Select
                    placeholder="Seleccione..."
                    onChange={(v) => { setParte(v); form.setFieldValue("operacion_codigo", undefined); }}
                    options={componentes.map((c) => ({ value: c.codigo, label: c.nombre }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={4}>
                <Form.Item name="tipo_tarea" label="Tipo Tarea*" rules={[{ required: true, message: "Requerido" }]}>
                  <Select
                    placeholder="Seleccione parte primero..."
                    options={TIPO_TAREA_OPTS}
                    disabled={!parte}
                    onChange={(v) => { setTipoTarea(v); form.setFieldValue("operacion_codigo", undefined); form.setFieldValue("trabajo_manual", undefined); }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={24} md={8}>
                {usarTextoLibre ? (
                  <Form.Item name="trabajo_manual" label="Tarea (sin catálogo, texto libre)*" rules={[{ required: true, message: "Requerido" }]}>
                    <Input placeholder={`Describa la tarea ${tipoTarea === "NoEstandar" ? "no estándar" : ""} para ${parte}...`} />
                  </Form.Item>
                ) : (
                  <Form.Item name="operacion_codigo" label="Tarea*" rules={[{ required: true, message: "Requerido" }]}>
                    <Select
                      placeholder={!parte ? "Seleccione parte primero..." : "Seleccione operación..."}
                      showSearch
                      disabled={!parte}
                      filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                      options={operacionesFiltradas.map((o) => ({
                        value: o.codigo,
                        label: `${o.codigo} - ${o.nombre}`,
                      }))}
                    />
                  </Form.Item>
                )}
              </Col>
              <Col xs={24} sm={12} md={5}>
                <Form.Item name="equipo" label="Equipo Asignado">
                  <Select
                    placeholder="Seleccione..."
                    allowClear
                    showSearch
                    filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                    options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={2}>
                <Form.Item label=" ">
                  <Button type="primary" style={{ width: "100%", background: brand.success, borderColor: brand.success }} loading={saving} onClick={saveTarea}>
                    Guardar
                  </Button>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={false}
        size="small"
        loading={loading}
        scroll={{ x: 1800 }}
        locale={{ emptyText: <Empty description="Sin tareas. Usá 'Task list (autogenerar)' o 'Nueva Tarea'." /> }}
      />
    </div>
  );
}

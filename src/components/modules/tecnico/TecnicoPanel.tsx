"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Row, Col, Table, Tag, Button, Statistic, Empty, Progress, Space, App, Tooltip, Segmented, Modal, Input,
} from "antd";
import {
  PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, TrophyOutlined,
  ClockCircleOutlined, ReloadOutlined, FireOutlined, LineChartOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";

const { Title, Text } = Typography;

interface OTLite {
  ot: string | null;
  descripcion: string | null;
  np: string | null;
  tipo: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  fecha_entrega: string | null;
  fabricante: { nombre: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string; flota: { codigo: string; nombre: string } | null } | null;
  prioridad_atencion: { codigo: string; nombre: string; nivel: number | null } | null;
}
interface TareaPlan {
  id: number;
  ot_id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
  horas_estimadas: string | number | null;
  horas_reales: string | number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  estado: string | null;
  tecnico: string | null;
  maquina: string | null;
  comentario: string | null;      // comentario del planner → técnico
  observaciones: string | null;   // observaciones de ejecución del técnico
  orden_trabajo: OTLite | null;
  // Estado del técnico logueado en esta tarea (derivado de sus sesiones).
  // Independiente del estado global de la tarea (que es multi-técnico).
  miEstado?: "sin_empezar" | "en_proceso" | "pausado" | "realizado";
}
interface SesionEnCurso {
  sesion_id: number;
  planificacion_ot_id: number;
  inicio: string;
  transcurrido_seg: number;
  ot: string | null;
  descripcion: string;
  componente: string;
  operacion: string;
  horas_estimadas: number;
  horas_reales_previas: number;
}
interface Rendimiento {
  totalProgramadas: number;
  realizadas: number;
  horas_estimadas: number;
  horas_reales: number;
  eficienciaPct: number | null;
}
interface MiTrabajo {
  me: { nombre: string; trabajador_id: number; area: string; puesto: string };
  sesionEnCurso: SesionEnCurso | null;
  tareasHoy: TareaPlan[];
  tareasSemana: TareaPlan[];
  rendimientoSemana: Rendimiento;
  rendimientoMes: Rendimiento;
  historico: { semana: string; estimadas: number; reales: number; eficienciaPct: number | null }[];
}
interface RankingItem {
  tecnico: string;
  tareas: number;
  horas_estimadas: number;
  horas_reales: number;
  eficienciaPct: number | null;
}

function eficienciaColor(pct: number | null): string {
  if (pct == null) return brand.textSecondary;
  if (pct >= 100) return "#52c41a";
  if (pct >= 80) return "#faad14";
  return "#cf1322";
}
function formatSegundos(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function TecnicoPanel() {
  const { message } = App.useApp();
  const [data, setData] = useState<MiTrabajo | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingPeriodo, setRankingPeriodo] = useState<"semana" | "mes">("semana");
  const [loading, setLoading] = useState(false);
  const [accionLoading, setAccionLoading] = useState<number | null>(null);
  // Cronómetro local que avanza desde transcurrido_seg
  const [secondsTick, setSecondsTick] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/mi-trabajo");
      if (r.ok) {
        const j = await r.json();
        setData(j);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRanking = useCallback(async (periodo: "semana" | "mes") => {
    const r = await fetch(`/api/ranking-tecnicos?periodo=${periodo}`);
    if (r.ok) {
      const j = await r.json();
      setRanking(j.ranking ?? []);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchRanking(rankingPeriodo); }, [fetchRanking, rankingPeriodo]);

  // Tick del cronómetro cada segundo si hay sesión en curso.
  useEffect(() => {
    if (!data?.sesionEnCurso) return;
    const handle = window.setInterval(() => setSecondsTick((s) => s + 1), 1000);
    return () => window.clearInterval(handle);
  }, [data?.sesionEnCurso]);

  // Reset del tick cuando cambia la sesión.
  useEffect(() => { setSecondsTick(0); }, [data?.sesionEnCurso?.sesion_id]);

  async function accion(taskId: number, accion: "iniciar" | "pausar" | "finalizar", observaciones?: string) {
    setAccionLoading(taskId);
    try {
      const r = await fetch(`/api/planificacion/${taskId}/${accion}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(observaciones ? { observaciones } : {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? `Error al ${accion}`);
      const msg = accion === "iniciar" ? "Tarea iniciada" : accion === "pausar" ? "Tarea pausada" : "Tarea finalizada";
      message.success(msg);
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : `Error al ${accion}`);
    } finally {
      setAccionLoading(null);
    }
  }

  // Modal para que el técnico deje observaciones al pausar/finalizar.
  const [obsModal, setObsModal] = useState<{ taskId: number; accion: "pausar" | "finalizar" } | null>(null);
  const [obsText, setObsText] = useState("");
  function abrirObs(taskId: number, acc: "pausar" | "finalizar") {
    setObsText("");
    setObsModal({ taskId, accion: acc });
  }
  async function confirmarObs() {
    if (!obsModal) return;
    const { taskId, accion: acc } = obsModal;
    setObsModal(null);
    await accion(taskId, acc, obsText.trim() || undefined);
  }

  const sesionActivaSegundos = useMemo(() => {
    if (!data?.sesionEnCurso) return 0;
    return data.sesionEnCurso.transcurrido_seg + secondsTick;
  }, [data?.sesionEnCurso, secondsTick]);

  const columnas: ColumnsType<TareaPlan> = [
    {
      title: "OT", dataIndex: ["orden_trabajo", "ot"], width: 90,
      render: (v, r) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v ?? `#${r.ot_id}`}</Text>,
    },
    {
      title: "Tarea", width: 280,
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{r.descripcion}</div>
          <div style={{ fontSize: 10, color: brand.textSecondary }}>
            {r.componente} · {r.operacion_codigo} {r.maquina ? `· ${r.maquina}` : ""}
          </div>
          {r.comentario && <Tag color="cyan" style={{ fontSize: 10, marginTop: 2 }}>💬 Comentario</Tag>}
        </div>
      ),
    },
    {
      title: "Flota / N/P", width: 140,
      render: (_, r) => (
        <div style={{ fontSize: 11 }}>
          <div>{r.orden_trabajo?.codigo_reparacion?.flota?.codigo ?? "—"}</div>
          {r.orden_trabajo?.np && <div style={{ color: brand.textSecondary }}>{r.orden_trabajo.np}</div>}
        </div>
      ),
    },
    {
      title: "Hora", width: 110, align: "center",
      render: (_, r) => r.fecha_inicio
        ? <Text style={{ fontSize: 11 }}>{dayjs(r.fecha_inicio).format("HH:mm")} — {r.fecha_fin ? dayjs(r.fecha_fin).format("HH:mm") : "—"}</Text>
        : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: "Estado", width: 100, align: "center",
      render: (_, r) => {
        const map: Record<string, { color: string; label: string }> = {
          abierto: { color: "default", label: "Abierto" },
          programado: { color: "blue", label: "Programado" },
          en_proceso: { color: "processing", label: "En proceso" },
          pausado: { color: "warning", label: "Pausado" },
          realizado: { color: "success", label: "Realizado" },
        };
        const v = map[r.estado ?? ""] ?? { color: "default", label: r.estado ?? "—" };
        return <Tag color={v.color} style={{ fontSize: 10, margin: 0 }}>{v.label}</Tag>;
      },
    },
    {
      title: "Acción", width: 200, align: "center", fixed: "right",
      render: (_, r) => {
        // Acciones según el estado PERSONAL del técnico (miEstado), no el global
        // de la tarea: así dos técnicos en la misma tarea actúan por separado.
        const mi = r.miEstado ?? "sin_empezar";
        const tieneSesion = data?.sesionEnCurso?.planificacion_ot_id === r.id;
        if (r.estado === "cancelado") return <Tag color="default">Cancelada</Tag>;
        if (mi === "realizado") return <Tag color="success" icon={<CheckCircleOutlined />}>Terminada</Tag>;
        if (mi === "en_proceso" || tieneSesion) {
          return (
            <Space size={4}>
              <Tooltip title="Pausar — la tarea queda lista para retomarse después">
                <Button size="small" icon={<PauseCircleOutlined />} loading={accionLoading === r.id}
                  onClick={() => abrirObs(r.id, "pausar")}>Pausar</Button>
              </Tooltip>
              <Tooltip title="Finalizar — registra tu fin y horas reales">
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={accionLoading === r.id}
                  onClick={() => abrirObs(r.id, "finalizar")}>Terminar</Button>
              </Tooltip>
            </Space>
          );
        }
        // sin_empezar → Iniciar · pausado → Retomar. Deshabilitado si el técnico
        // ya tiene otra tarea en curso (solo puede trabajar una a la vez).
        return (
          <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={accionLoading === r.id}
            onClick={() => accion(r.id, "iniciar")} disabled={!!data?.sesionEnCurso}>
            {mi === "pausado" ? "Retomar" : "Iniciar"}
          </Button>
        );
      },
    },
  ];

  // Color de prioridad: E=emergencia, 1=alta, 2=media, 3=baja.
  const prioColor: Record<string, string> = { E: "volcano", "1": "red", "2": "orange", "3": "cyan" };
  // Detalle expandible: toda la info que le llega al técnico para la tarea.
  function renderDetalle(r: TareaPlan) {
    const o = r.orden_trabajo;
    const dato = (label: string, val: React.ReactNode) => (
      <Col xs={12} md={8} lg={6}>
        <Text type="secondary" style={{ fontSize: 11, display: "block" }}>{label}</Text>
        <div style={{ fontSize: 12 }}>{val || <Text type="secondary">—</Text>}</div>
      </Col>
    );
    const prio = o?.prioridad_atencion;
    return (
      <div style={{ padding: "4px 8px" }}>
        {r.comentario && (
          <div style={{ marginBottom: 10, padding: 8, background: brand.bgPage, borderRadius: 4, borderLeft: `3px solid ${brand.cyan}` }}>
            <Text strong style={{ fontSize: 11 }}>Comentario del planner:</Text>
            <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.comentario}</div>
          </div>
        )}
        <Row gutter={[12, 8]}>
          {dato("OT", o?.ot ?? `#${r.ot_id}`)}
          {dato("Duración est.", r.horas_estimadas != null ? `${Number(r.horas_estimadas)} h` : null)}
          {dato("Prioridad", prio ? <Tag color={prioColor[prio.codigo] ?? "default"} style={{ margin: 0 }}>{prio.nombre}</Tag> : null)}
          {dato("Fecha de entrega", o?.fecha_entrega ? dayjs(o.fecha_entrega).format("DD/MM/YYYY") : null)}
          {dato("Tipo", o?.tipo)}
          {dato("N/P", o?.np)}
          {dato("Descripción", o?.descripcion)}
          {dato("Fabricante", o?.fabricante?.nombre)}
          {dato("Flota", o?.cod_rep_flota ?? o?.codigo_reparacion?.flota?.nombre)}
          {dato("Posición", o?.cod_rep_posicion)}
        </Row>
        {r.observaciones && (
          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Mis observaciones:</Text>
            <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{r.observaciones}</div>
          </div>
        )}
      </div>
    );
  }
  const expandable = {
    expandedRowRender: renderDetalle,
    // Solo expandible si hay algo que mostrar (siempre hay OT/cilindro).
    rowExpandable: () => true,
  };

  // Columna de día para la vista semanal (marca "Hoy"). Se antepone a las columnas.
  const hoyStr = dayjs().format("YYYY-MM-DD");
  const diaCol: ColumnsType<TareaPlan>[number] = {
    title: "Día", key: "dia", width: 90, fixed: "left",
    render: (_, r) => {
      if (!r.fecha_inicio) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
      const d = dayjs(r.fecha_inicio);
      const esHoy = d.format("YYYY-MM-DD") === hoyStr;
      return <Tag color={esHoy ? "blue" : "default"} style={{ fontSize: 11, margin: 0 }}>{esHoy ? "Hoy" : d.format("ddd DD/MM")}</Tag>;
    },
  };
  const columnasSemana: ColumnsType<TareaPlan> = [diaCol, ...columnas];

  if (!data) {
    return (
      <div>
        <Title level={3}>Mi panel</Title>
        <Card loading={loading} />
      </div>
    );
  }

  const miPosicion = ranking.findIndex((r) => r.tecnico === data.me.nombre);

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Hola, {data.me.nombre.split(",")[0].split(" ")[0]} 👋</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{data.me.area} · {data.me.puesto}</Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
        </Col>
      </Row>

      {/* Sesión activa */}
      {data.sesionEnCurso && (
        <Card style={{ marginBottom: 16, borderColor: brand.cyan, background: "#E6FFFB" }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Space align="center">
                <FireOutlined style={{ fontSize: 28, color: "#fa541c" }} />
                <div>
                  <div style={{ fontSize: 12, color: brand.textSecondary }}>Trabajando ahora en:</div>
                  <Text strong style={{ fontSize: 15 }}>
                    OT-{data.sesionEnCurso.ot ?? "—"} · {data.sesionEnCurso.descripcion}
                  </Text>
                  <div style={{ fontSize: 11, color: brand.textSecondary }}>
                    {data.sesionEnCurso.componente} · {data.sesionEnCurso.operacion}
                  </div>
                </div>
              </Space>
            </Col>
            <Col>
              <Statistic
                title="Tiempo en esta sesión"
                value={formatSegundos(sesionActivaSegundos)}
                prefix={<ClockCircleOutlined style={{ color: brand.cyan }} />}
                valueStyle={{ color: brand.cyan, fontFamily: "monospace", fontSize: 28 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Acumulado previo: {data.sesionEnCurso.horas_reales_previas.toFixed(2)}h /
                estimado {data.sesionEnCurso.horas_estimadas.toFixed(1)}h
              </Text>
            </Col>
            <Col>
              <Space direction="vertical">
                <Button
                  size="large"
                  icon={<PauseCircleOutlined />}
                  loading={accionLoading === data.sesionEnCurso.planificacion_ot_id}
                  onClick={() => data.sesionEnCurso && abrirObs(data.sesionEnCurso.planificacion_ot_id, "pausar")}
                >
                  Pausar
                </Button>
                <Button
                  size="large"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={accionLoading === data.sesionEnCurso.planificacion_ot_id}
                  onClick={() => data.sesionEnCurso && abrirObs(data.sesionEnCurso.planificacion_ot_id, "finalizar")}
                >
                  Finalizar
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Rendimiento semana / mes */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card size="small" title={<><LineChartOutlined /> Mi semana</>}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Tareas hechas" value={data.rendimientoSemana.realizadas} suffix={`/ ${data.rendimientoSemana.totalProgramadas}`} />
              </Col>
              <Col span={8}>
                <Statistic title="Horas reales" value={data.rendimientoSemana.horas_reales} suffix="h" precision={1} />
                <Text type="secondary" style={{ fontSize: 11 }}>est. {data.rendimientoSemana.horas_estimadas.toFixed(1)}h</Text>
              </Col>
              <Col span={8}>
                <Statistic
                  title="Eficiencia"
                  value={data.rendimientoSemana.eficienciaPct ?? "—"}
                  suffix={data.rendimientoSemana.eficienciaPct != null ? "%" : ""}
                  valueStyle={{ color: eficienciaColor(data.rendimientoSemana.eficienciaPct) }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={<><LineChartOutlined /> Mi mes</>}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Tareas hechas" value={data.rendimientoMes.realizadas} suffix={`/ ${data.rendimientoMes.totalProgramadas}`} />
              </Col>
              <Col span={8}>
                <Statistic title="Horas reales" value={data.rendimientoMes.horas_reales} suffix="h" precision={1} />
                <Text type="secondary" style={{ fontSize: 11 }}>est. {data.rendimientoMes.horas_estimadas.toFixed(1)}h</Text>
              </Col>
              <Col span={8}>
                <Statistic
                  title="Eficiencia"
                  value={data.rendimientoMes.eficienciaPct ?? "—"}
                  suffix={data.rendimientoMes.eficienciaPct != null ? "%" : ""}
                  valueStyle={{ color: eficienciaColor(data.rendimientoMes.eficienciaPct) }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Tareas de TODA la semana (hoy resaltado con el tag "Hoy") */}
        <Col xs={24} lg={16}>
          <Card size="small" title={`Mis tareas de la semana (${data.tareasSemana.length}) · hoy: ${data.tareasHoy.length}`}>
            {data.tareasSemana.length === 0
              ? <Empty description="No tenés tareas programadas esta semana" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : (
                <Table<TareaPlan>
                  rowKey="id"
                  columns={columnasSemana}
                  dataSource={data.tareasSemana}
                  size="small"
                  pagination={false}
                  scroll={{ x: 1010 }}
                  expandable={expandable}
                />
              )
            }
          </Card>
        </Col>

        {/* Ranking público + histórico */}
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title={<><TrophyOutlined /> Ranking de técnicos</>}
            extra={<Segmented size="small" value={rankingPeriodo} onChange={(v) => setRankingPeriodo(v as "semana" | "mes")} options={[{ value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }]} />}
          >
            {ranking.length === 0
              ? <Empty description="Aún no hay tareas realizadas en el período" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : (
                <div>
                  {miPosicion >= 0 && (
                    <div style={{ marginBottom: 8, padding: 6, background: "#FFF1F0", borderRadius: 4, fontSize: 12, textAlign: "center" }}>
                      Estás en el puesto <strong>#{miPosicion + 1}</strong> de {ranking.length}
                    </div>
                  )}
                  {ranking.slice(0, 10).map((r, i) => {
                    const esYo = r.tecnico === data.me.nombre;
                    return (
                      <div
                        key={r.tecnico}
                        style={{
                          display: "flex", alignItems: "center", padding: 6, gap: 8,
                          background: esYo ? "#FFF1F0" : (i % 2 ? "transparent" : "#FAFAFA"),
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: esYo ? 600 : 400,
                        }}
                      >
                        <span style={{ width: 22, textAlign: "center", color: i < 3 ? "#fa8c16" : brand.textSecondary, fontWeight: 700 }}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.tecnico}{esYo && " (vos)"}
                        </span>
                        <Tag color={eficienciaColor(r.eficienciaPct) === "#52c41a" ? "success" : eficienciaColor(r.eficienciaPct) === "#faad14" ? "warning" : "error"} style={{ fontSize: 10, margin: 0 }}>
                          {r.eficienciaPct != null ? `${r.eficienciaPct}%` : "—"}
                        </Tag>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </Card>

          <Card size="small" title="Últimas 4 semanas" style={{ marginTop: 16 }}>
            {data.historico.length === 0
              ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : data.historico.map((h, idx) => (
                  <div key={idx} style={{ marginBottom: 8 }}>
                    <Row justify="space-between" style={{ marginBottom: 2 }}>
                      <Text style={{ fontSize: 12 }}>Sem. {h.semana}</Text>
                      <Text strong style={{ fontSize: 12, color: eficienciaColor(h.eficienciaPct) }}>
                        {h.eficienciaPct != null ? `${h.eficienciaPct}%` : "—"}
                      </Text>
                    </Row>
                    <Progress
                      percent={h.estimadas > 0 && h.reales > 0 ? Math.min(100, Math.round((h.estimadas / h.reales) * 100)) : 0}
                      size="small"
                      status={h.eficienciaPct == null || h.eficienciaPct < 80 ? "exception" : "active"}
                      showInfo={false}
                    />
                    <Text type="secondary" style={{ fontSize: 10 }}>{h.estimadas}h est. / {h.reales}h real</Text>
                  </div>
                ))
            }
          </Card>
        </Col>
      </Row>

      {/* Observaciones del técnico al pausar / finalizar (opcional). */}
      <Modal
        open={!!obsModal}
        title={obsModal?.accion === "finalizar" ? "Finalizar tarea" : "Pausar tarea"}
        okText={obsModal?.accion === "finalizar" ? "Finalizar" : "Pausar"}
        cancelText="Cancelar"
        onOk={confirmarObs}
        onCancel={() => setObsModal(null)}
        confirmLoading={obsModal ? accionLoading === obsModal.taskId : false}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Podés dejar una observación de lo que hiciste (opcional). Se guarda en la tarea.
        </Text>
        <Input.TextArea
          rows={4}
          value={obsText}
          onChange={(e) => setObsText(e.target.value)}
          placeholder="Ej: faltó repuesto X, se avanzó hasta Y, etc."
          maxLength={1000}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}

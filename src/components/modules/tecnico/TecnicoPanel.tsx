"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Row, Col, Table, Tag, Button, Statistic, Empty, Progress, Space, App, Tooltip, Segmented, Modal, Input,
} from "antd";
import {
  PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, TrophyOutlined,
  ClockCircleOutlined, ReloadOutlined, FireOutlined, LineChartOutlined,
  LeftOutlined, RightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";

dayjs.extend(isoWeek);

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
  // Planificación publicada por el planner. Si es borrador, el técnico la ve
  // pero no la puede iniciar todavía.
  publicado?: boolean;
  // Emergencia (correctiva): se resalta y se prioriza sobre las normales.
  es_correctivo?: boolean;
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
// Nombres de trabajador vienen como "APELLIDO APELLIDO NOMBRE NOMBRE" (sin coma).
// Para el saludo mostramos "Primer nombre Primer apellido" (ej. "Jose Huamani").
function saludoNombre(full: string): string {
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "";
  const primerApellido = w[0];
  const primerNombre = w.length >= 3 ? w[2] : (w[1] ?? w[0]);
  return `${cap(primerNombre)} ${cap(primerApellido)}`.trim();
}
function formatSegundos(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function TecnicoPanel() {
  const { message, modal } = App.useApp();
  const { screens, isMobile } = useResponsive(); // isMobile = < 768px
  const [data, setData] = useState<MiTrabajo | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingPeriodo, setRankingPeriodo] = useState<"semana" | "mes">("semana");
  const [loading, setLoading] = useState(false);
  const [accionLoading, setAccionLoading] = useState<number | null>(null);
  // Cronómetro local que avanza desde transcurrido_seg
  const [secondsTick, setSecondsTick] = useState(0);
  // Semana que se está viendo (navegable con flechas) y filtro por día.
  const [semanaRef, setSemanaRef] = useState<Dayjs>(() => dayjs());
  const [diaFiltro, setDiaFiltro] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mi-trabajo?semana=${semanaRef.format("YYYY-MM-DD")}`);
      if (r.ok) {
        const j = await r.json();
        setData(j);
      }
    } finally {
      setLoading(false);
    }
  }, [semanaRef]);

  const irSemana = useCallback((delta: number) => {
    setDiaFiltro("all");
    setSemanaRef((s) => (delta === 0 ? dayjs() : s.add(delta, "week")));
  }, []);

  // Navegación de semana + filtro por día para la tabla de "Mis tareas".
  const lunesRef = semanaRef.startOf("isoWeek");
  const viernesRef = lunesRef.add(4, "day");
  const hoyDj = dayjs();
  const esSemanaActual = semanaRef.isoWeek() === hoyDj.isoWeek() && semanaRef.isoWeekYear() === hoyDj.isoWeekYear();
  const diaOpts = [
    { value: "all", label: "Semana" },
    ...["Lun", "Mar", "Mié", "Jue", "Vie"].map((nm, i) => {
      const d = lunesRef.add(i, "day");
      return { value: d.format("YYYY-MM-DD"), label: `${nm} ${d.format("DD")}` };
    }),
  ];
  const tareasFiltradas = (() => {
    if (!data) return [];
    const base = diaFiltro === "all"
      ? data.tareasSemana
      : data.tareasSemana.filter((t) => t.fecha_inicio && dayjs(t.fecha_inicio).format("YYYY-MM-DD") === diaFiltro);
    // Las emergencias primero (sort estable; conserva el orden por fecha del API).
    return [...base].sort((a, b) => Number(!!b.es_correctivo) - Number(!!a.es_correctivo));
  })();

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

  async function accion(taskId: number, accion: "iniciar" | "pausar" | "finalizar", observaciones?: string): Promise<boolean> {
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
      return true;
    } catch (e) {
      message.error(e instanceof Error ? e.message : `Error al ${accion}`);
      return false;
    } finally {
      setAccionLoading(null);
    }
  }

  // Iniciar una tarea cuando el técnico ya tiene otra en curso: ofrece pausar la
  // actual y arrancar esta (clave para atender una emergencia sin perder la que
  // estaba haciendo, que queda pausada para retomar después).
  async function iniciarConPausa(r: TareaPlan) {
    const enCurso = data?.sesionEnCurso;
    if (enCurso && enCurso.planificacion_ot_id !== r.id) {
      modal.confirm({
        title: "Pausar la tarea en curso e iniciar esta",
        content: `Se pausa "${enCurso.descripcion}" y arranca "${r.descripcion}". Después podés retomar la pausada.`,
        okText: "Pausar e iniciar",
        cancelText: "Cancelar",
        okButtonProps: { danger: true },
        onOk: async () => {
          const ok = await accion(enCurso.planificacion_ot_id, "pausar");
          if (ok) await accion(r.id, "iniciar");
        },
      });
      return;
    }
    accion(r.id, "iniciar");
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
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            {r.es_correctivo && <Tag color="error" style={{ fontSize: 10, marginRight: 4 }}>🚨 EMERGENCIA</Tag>}
            {r.descripcion}
          </div>
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
      title: "Hora", width: 120, align: "center",
      render: (_, r) => {
        if (!r.fecha_inicio) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        const ini = dayjs(r.fecha_inicio);
        const fin = r.fecha_fin ? dayjs(r.fecha_fin) : null;
        const cruzaDia = fin ? fin.startOf("day").diff(ini.startOf("day"), "day") : 0;
        return (
          <Text style={{ fontSize: 11 }}>
            {ini.format("HH:mm")} — {fin ? fin.format("HH:mm") : "—"}
            {cruzaDia > 0 && <Text type="warning" style={{ fontSize: 9 }}> (+{cruzaDia}d)</Text>}
          </Text>
        );
      },
    },
    {
      // Estado PERSONAL del técnico (miEstado), coherente con la columna Acción.
      // Una tarea sin fecha (p.ej. desplazada por una emergencia) se ve como
      // "Sin programar", no como "Programado".
      title: "Estado", width: 110, align: "center",
      render: (_, r) => {
        const mi = r.miEstado ?? "sin_empezar";
        if (mi === "en_proceso") return <Tag color="processing" style={{ fontSize: 10, margin: 0 }}>En proceso</Tag>;
        if (mi === "pausado") return <Tag color="warning" style={{ fontSize: 10, margin: 0 }}>Pausado</Tag>;
        if (mi === "realizado") return <Tag color="success" style={{ fontSize: 10, margin: 0 }}>Realizado</Tag>;
        if (!r.fecha_inicio) return <Tag color="default" style={{ fontSize: 10, margin: 0 }}>Sin programar</Tag>;
        return <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Programado</Tag>;
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
        // Borrador (el planner no publicó): visible pero aún no ejecutable.
        if (r.publicado === false && mi === "sin_empezar" && !tieneSesion) {
          return <Tooltip title="El planner todavía no confirmó (publicó) esta tarea."><Tag color="warning">Borrador</Tag></Tooltip>;
        }
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
        // sin_empezar → Iniciar · pausado → Retomar. Si el técnico ya tiene otra
        // en curso, las normales se deshabilitan (una a la vez); las EMERGENCIAS
        // se permiten y ofrecen "pausar la actual e iniciar esta".
        return (
          <Button size="small" type="primary" danger={r.es_correctivo} icon={<PlayCircleOutlined />} loading={accionLoading === r.id}
            onClick={() => iniciarConPausa(r)} disabled={!!data?.sesionEnCurso && !r.es_correctivo}>
            {r.es_correctivo ? "Atender 🚨" : mi === "pausado" ? "Retomar" : "Iniciar"}
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
          {dato("Inicio real", r.fecha_inicio_real ? dayjs(r.fecha_inicio_real).format("DD/MM/YY HH:mm") : null)}
          {dato("Fin real", r.fecha_fin_real ? dayjs(r.fecha_fin_real).format("DD/MM/YY HH:mm") : null)}
          {dato("Horas reales", r.horas_reales != null ? `${Number(r.horas_reales)} h` : null)}
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
          <Title level={3} style={{ margin: 0 }}>Hola, {saludoNombre(data.me.nombre)} 👋</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{data.me.area} · {data.me.puesto}</Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
        </Col>
      </Row>

      {/* Sesión activa */}
      {data.sesionEnCurso && (
        <Card style={{ marginBottom: 16, borderColor: brand.cyan, background: "#E6FFFB" }} styles={{ body: { padding: isMobile ? 12 : 24 } }}>
          <Row gutter={[16, 16]} align="middle" wrap>
            <Col xs={24} md="auto" flex={screens.md ? "auto" : undefined}>
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
            <Col xs={24} sm={12} md="auto">
              <Statistic
                title="Tiempo en esta sesión"
                value={formatSegundos(sesionActivaSegundos)}
                prefix={<ClockCircleOutlined style={{ color: brand.cyan }} />}
                valueStyle={{ color: brand.cyan, fontFamily: "monospace", fontSize: isMobile ? 22 : 28 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Acumulado previo: {data.sesionEnCurso.horas_reales_previas.toFixed(2)}h /
                estimado {data.sesionEnCurso.horas_estimadas.toFixed(1)}h
              </Text>
            </Col>
            <Col xs={24} sm={12} md="auto">
              <Space direction={isMobile ? "horizontal" : "vertical"} style={{ width: "100%" }}>
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
          <Card
            size="small"
            title={
              <Space wrap size={4}>
                <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => irSemana(-1)} aria-label="Semana anterior" />
                <span style={{ fontWeight: 600 }}>{lunesRef.format("DD/MM")} – {viernesRef.format("DD/MM")}</span>
                <Button size="small" type="text" icon={<RightOutlined />} onClick={() => irSemana(1)} aria-label="Semana siguiente" />
                <Button size="small" onClick={() => irSemana(0)} disabled={esSemanaActual}>Hoy</Button>
                <Tag color={esSemanaActual ? "blue" : "default"}>
                  {data.tareasSemana.length} {data.tareasSemana.length === 1 ? "tarea" : "tareas"}
                  {esSemanaActual && data.tareasHoy.length ? ` · hoy ${data.tareasHoy.length}` : ""}
                </Tag>
              </Space>
            }
            extra={
              <Segmented
                size="small"
                value={diaFiltro}
                onChange={(v) => setDiaFiltro(v as string)}
                options={diaOpts}
              />
            }
          >
            {data.tareasSemana.length === 0
              ? <Empty description="No tenés tareas programadas esta semana" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : tareasFiltradas.length === 0
                ? <Empty description="Sin tareas para el día seleccionado" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : (
                  <Table<TareaPlan>
                    rowKey="id"
                    columns={columnasSemana}
                    dataSource={tareasFiltradas}
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
        width={modalWidth(screens, 480)}
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

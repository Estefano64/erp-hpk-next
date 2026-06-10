"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Row, Col, Table, Tag, Button, Statistic, Empty, Space, App, Tooltip, Segmented, Modal, Input, Upload, Radio, Spin,
} from "antd";
import {
  PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ReloadOutlined, FireOutlined, LineChartOutlined,
  LeftOutlined, RightOutlined, DownOutlined, UpOutlined,
  PaperClipOutlined, DeleteOutlined, FileTextOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { uploadToR2 } from "@/lib/r2-client";
import { MOTIVOS_PAUSA, MOTIVO_CAMBIO_TAREA } from "@/lib/motivos-pausa";
import dynamic from "next/dynamic";

// Formulario de evaluación en diferido: es un componente grande y solo se usa
// si el técnico abre "Ver hoja de evaluación" (solo lectura).
const EvaluacionFormulario = dynamic(() => import("@/components/modules/evaluacion/EvaluacionFormulario"), { ssr: false });
import TareaAdjuntosLista from "@/components/TareaAdjuntosLista";

// Tipos de archivo aceptados al pausar/finalizar (fotos + documentos).
const ADJUNTO_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,image/*";

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
  cliente: { razon_social: string; nombre_comercial: string | null } | null;
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
  maquina_nombre?: string | null;  // nombre del equipo (resuelto del código)
  comentario: string | null;      // comentario del planner → técnico
  observaciones: string | null;   // observaciones de ejecución del técnico
  orden_trabajo: OTLite | null;
  // Hoja de evaluación APROBADA de la OT (si aplica): el técnico puede verla
  // en solo lectura. null = sin OT, sin hoja, o la hoja no está aprobada.
  evaluacion_aprobada_id?: number | null;
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
  es_horas_extras?: boolean;
}

// ¿"Ahora" cuenta para el cronómetro? Ventana de conteo 07:00–20:00 L–V (más
// ancha que la jornada: los minutos antes de las 8 / después de las 18 corren
// como hora normal). Durante el almuerzo (12:30–13:30) el tick se congela: si
// el técnico trabaja de corrido esa hora se descuenta al guardar; si pausa
// (almuerzo corrido de horario), el guardado le devuelve lo trabajado.
function enVentanaConteo(d: Date): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const min = d.getHours() * 60 + d.getMinutes();
  if (min < 7 * 60 || min >= 20 * 60) return false;
  if (min >= 12 * 60 + 30 && min < 13 * 60 + 30) return false;
  return true;
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
// Día abreviado en español (evita cambiar el locale global de dayjs).
const DIAS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function diaEs(d: Dayjs): string {
  return `${DIAS_ES[d.day()]} ${d.format("DD/MM")}`;
}
function clienteDe(o: OTLite | null | undefined): string {
  return o?.cliente?.nombre_comercial ?? o?.cliente?.razon_social ?? "";
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
  const [loading, setLoading] = useState(false);
  const [accionLoading, setAccionLoading] = useState<number | null>(null);
  // Cronómetro local que avanza desde transcurrido_seg
  const [secondsTick, setSecondsTick] = useState(0);
  // Semana que se está viendo (navegable con flechas) y filtro por día.
  const [semanaRef, setSemanaRef] = useState<Dayjs>(() => dayjs());
  const [diaFiltro, setDiaFiltro] = useState<string>("all");
  // En celular no hay fila expandible: cada tarjeta puede mostrar/ocultar el
  // mismo detalle (renderDetalle) con un botón. Guardamos los ids abiertos.
  const [detalleMobile, setDetalleMobile] = useState<Set<number>>(() => new Set());
  const toggleDetalleMobile = useCallback((id: number) => {
    setDetalleMobile((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

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

  useEffect(() => { fetchData(); }, [fetchData]);

  // Tick del cronómetro cada segundo si hay sesión en curso. Solo avanza en
  // tiempo HÁBIL (se congela en el almuerzo y fuera de jornada — igual que las
  // horas reales que se guardan), salvo tareas de horas extra.
  useEffect(() => {
    if (!data?.sesionEnCurso) return;
    const esHE = !!data.sesionEnCurso.es_horas_extras;
    const handle = window.setInterval(() => {
      if (esHE || enVentanaConteo(new Date())) setSecondsTick((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(handle);
  }, [data?.sesionEnCurso]);

  // Reset del tick cuando cambia la sesión.
  useEffect(() => { setSecondsTick(0); }, [data?.sesionEnCurso?.sesion_id]);

  async function accion(taskId: number, accion: "iniciar" | "pausar" | "finalizar", observaciones?: string, motivo?: string): Promise<boolean> {
    setAccionLoading(taskId);
    try {
      const r = await fetch(`/api/planificacion/${taskId}/${accion}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(observaciones ? { observaciones } : {}),
          ...(motivo ? { motivo } : {}),
        }),
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
          // Motivo automático: pausó para arrancar otra tarea (no pasa por el
          // modal de motivos).
          const ok = await accion(enCurso.planificacion_ot_id, "pausar", undefined, MOTIVO_CAMBIO_TAREA.codigo);
          if (ok) await accion(r.id, "iniciar");
        },
      });
      return;
    }
    accion(r.id, "iniciar");
  }

  // ── Ver hoja de evaluación de la OT (solo lectura, solo APROBADAS) ──
  interface EvalView {
    id: number;
    modelo_evaluacion: string;
    sistema_medicion: string;
    datos_formulario: Record<string, unknown>;
    fecha_evaluacion: string | null;
    evaluado_por: string | null;
    supervisor: string | null;
    resultado_general: string | null;
    recomendaciones_general: string | null;
    estado: string;
    orden_trabajo?: { ot: number | null; np: string | null; descripcion: string | null; cod_rep_flota: string | null } | null;
  }
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalData, setEvalData] = useState<EvalView | null>(null);
  async function abrirEvaluacion(evaluacionId: number) {
    setEvalOpen(true);
    setEvalLoading(true);
    setEvalData(null);
    try {
      const res = await fetch(`/api/evaluaciones/${evaluacionId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al cargar la evaluación");
      // Defensa: el panel solo ofrece hojas aprobadas, pero igual validamos acá.
      if (j?.data?.estado !== "APROBADA") {
        message.info("La hoja de evaluación todavía no está aprobada.");
        setEvalOpen(false);
        return;
      }
      setEvalData(j.data as EvalView);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al cargar la evaluación");
      setEvalOpen(false);
    } finally {
      setEvalLoading(false);
    }
  }

  // Modal para que el técnico deje observaciones + adjunte archivos/fotos al pausar/finalizar.
  type AdjuntoObs = { id: number; nombre_archivo: string; r2_key: string; tipo_mime: string };
  const [obsModal, setObsModal] = useState<{ taskId: number; accion: "pausar" | "finalizar" } | null>(null);
  const [obsText, setObsText] = useState("");
  // Motivo categorizado de la pausa — OBLIGATORIO al pausar (es lo que vuelve
  // agregable el "por qué se paró": apoyo, montacarga, falta material, etc.).
  const [obsMotivo, setObsMotivo] = useState<string | null>(null);
  const [obsAdjuntos, setObsAdjuntos] = useState<AdjuntoObs[]>([]);
  const [obsSubiendo, setObsSubiendo] = useState(false);
  function abrirObs(taskId: number, acc: "pausar" | "finalizar") {
    setObsText("");
    setObsMotivo(null);
    setObsAdjuntos([]);
    setObsModal({ taskId, accion: acc });
  }
  function cerrarObs() {
    setObsModal(null);
    setObsAdjuntos([]);
  }
  // Sube el archivo a R2 y lo registra contra la tarea. Se llama desde el Upload
  // (beforeUpload) por cada archivo; devuelve false para evitar el upload nativo.
  async function subirAdjuntoObs(file: File): Promise<boolean> {
    if (!obsModal) return false;
    setObsSubiendo(true);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/planificacion/${obsModal.taskId}/adjuntos/upload-url`,
      });
      const res = await fetch(`/api/planificacion/${obsModal.taskId}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al adjuntar");
      setObsAdjuntos((prev) => [...prev, j.data]);
      message.success("Archivo adjuntado");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al adjuntar archivo");
    } finally {
      setObsSubiendo(false);
    }
    return false;
  }
  async function quitarAdjuntoObs(adjuntoId: number) {
    if (!obsModal) return;
    const res = await fetch(`/api/planificacion/${obsModal.taskId}/adjuntos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjunto_id: adjuntoId }),
    });
    if (res.ok) setObsAdjuntos((prev) => prev.filter((a) => a.id !== adjuntoId));
    else message.error("No se pudo quitar el adjunto");
  }
  async function confirmarObs() {
    if (!obsModal) return;
    const { taskId, accion: acc } = obsModal;
    if (acc === "pausar" && !obsMotivo) {
      message.warning("Elegí el motivo de la pausa.");
      return;
    }
    cerrarObs();
    await accion(taskId, acc, obsText.trim() || undefined, acc === "pausar" ? (obsMotivo ?? undefined) : undefined);
  }

  const sesionActivaSegundos = useMemo(() => {
    if (!data?.sesionEnCurso) return 0;
    return data.sesionEnCurso.transcurrido_seg + secondsTick;
  }, [data?.sesionEnCurso, secondsTick]);

  // Botones/estado de acción del técnico para una tarea (se reusa en la tabla de
  // escritorio y en las tarjetas de celular).
  function renderAccion(r: TareaPlan, block = false) {
    const mi = r.miEstado ?? "sin_empezar";
    const tieneSesion = data?.sesionEnCurso?.planificacion_ot_id === r.id;
    if (r.estado === "cancelado") return <Tag color="default">Cancelada</Tag>;
    if (mi === "realizado") return <Tag color="success" icon={<CheckCircleOutlined />}>Terminada</Tag>;
    if (r.publicado === false && mi === "sin_empezar" && !tieneSesion) {
      return <Tooltip title="El planner todavía no confirmó (publicó) esta tarea."><Tag color="warning">Borrador</Tag></Tooltip>;
    }
    if (mi === "sin_empezar" && !r.fecha_inicio && !tieneSesion) {
      return <Tooltip title="Sin fecha: esperá a que el planner la reprograme."><Tag color="default">Sin programar</Tag></Tooltip>;
    }
    if (mi === "en_proceso" || tieneSesion) {
      return (
        <Space size={4} style={block ? { width: "100%" } : undefined}>
          <Button size="small" block={block} icon={<PauseCircleOutlined />} loading={accionLoading === r.id}
            onClick={() => abrirObs(r.id, "pausar")}>Pausar</Button>
          <Button size="small" block={block} type="primary" icon={<CheckCircleOutlined />} loading={accionLoading === r.id}
            onClick={() => abrirObs(r.id, "finalizar")}>Terminar</Button>
        </Space>
      );
    }
    return (
      <Button size="small" block={block} type="primary" danger={r.es_correctivo} icon={<PlayCircleOutlined />} loading={accionLoading === r.id}
        onClick={() => iniciarConPausa(r)} disabled={!!data?.sesionEnCurso && !r.es_correctivo}>
        {r.es_correctivo ? "Atender 🚨" : mi === "pausado" ? "Retomar" : "Iniciar"}
      </Button>
    );
  }

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
            {[r.componente, r.operacion_codigo, r.maquina_nombre ?? r.maquina].filter(Boolean).join(" · ")}
          </div>
          {clienteDe(r.orden_trabajo) && (
            <div style={{ fontSize: 10, color: brand.textSecondary }}>🏢 {clienteDe(r.orden_trabajo)}</div>
          )}
          {r.comentario && (
            <Tooltip title={<span style={{ whiteSpace: "pre-wrap" }}>{r.comentario}</span>}>
              <Tag color="cyan" style={{ fontSize: 10, marginTop: 2, cursor: "help", whiteSpace: "normal", maxWidth: 240 }}>💬 {r.comentario}</Tag>
            </Tooltip>
          )}
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
      render: (_, r) => renderAccion(r),
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
          {dato("Cliente", clienteDe(o) || null)}
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
        {/* Hoja de evaluación de la OT (si aplica y está APROBADA): solo lectura. */}
        {r.evaluacion_aprobada_id != null && (
          <div style={{ marginTop: 10 }}>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              onClick={() => abrirEvaluacion(r.evaluacion_aprobada_id!)}
            >
              Ver hoja de evaluación
            </Button>
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <TareaAdjuntosLista taskId={r.id} />
        </div>
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
      return <Tag color={esHoy ? "blue" : "default"} style={{ fontSize: 11, margin: 0 }}>{esHoy ? "Hoy" : diaEs(d)}</Tag>;
    },
  };
  const columnasSemana: ColumnsType<TareaPlan> = [diaCol, ...columnas];

  // Tarjeta compacta de tarea para celular (en vez de la tabla ancha).
  function renderTareaMobile(r: TareaPlan) {
    const o = r.orden_trabajo;
    const flota = o?.codigo_reparacion?.flota?.codigo ?? "—";
    const ini = r.fecha_inicio ? dayjs(r.fecha_inicio) : null;
    const fin = r.fecha_fin ? dayjs(r.fecha_fin) : null;
    const esHoy = ini ? ini.format("YYYY-MM-DD") === hoyStr : false;
    const cruzaDia = ini && fin ? fin.startOf("day").diff(ini.startOf("day"), "day") : 0;
    const mi = r.miEstado ?? "sin_empezar";
    const estadoTag = mi === "en_proceso" ? <Tag color="processing" style={{ margin: 0 }}>En proceso</Tag>
      : mi === "pausado" ? <Tag color="warning" style={{ margin: 0 }}>Pausado</Tag>
      : mi === "realizado" ? <Tag color="success" style={{ margin: 0 }}>Realizado</Tag>
      : !r.fecha_inicio ? <Tag style={{ margin: 0 }}>Sin programar</Tag>
      : <Tag color="blue" style={{ margin: 0 }}>Programado</Tag>;
    return (
      <Card
        key={r.id}
        size="small"
        style={{ marginBottom: 8, borderLeft: r.es_correctivo ? `4px solid ${brand.error}` : undefined }}
        styles={{ body: { padding: 12 } }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <Text strong style={{ fontSize: 13 }}>OT-{o?.ot ?? r.ot_id} · {flota}</Text>
          <Tag color={esHoy ? "blue" : "default"} style={{ margin: 0 }}>{ini ? (esHoy ? "Hoy" : diaEs(ini)) : "—"}</Tag>
        </div>
        {clienteDe(o) && <div style={{ fontSize: 11, color: brand.textSecondary, marginBottom: 2 }}>🏢 {clienteDe(o)}</div>}
        {r.es_correctivo && <Tag color="error" style={{ marginBottom: 4 }}>🚨 EMERGENCIA</Tag>}
        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.descripcion}</div>
        <div style={{ fontSize: 11, color: brand.textSecondary }}>
          {[r.componente, r.operacion_codigo, r.maquina_nombre ?? r.maquina].filter(Boolean).join(" · ")}
        </div>
        {r.comentario && (
          <div style={{ fontSize: 11, marginTop: 4, padding: 6, background: brand.bgPage, borderRadius: 4, borderLeft: `3px solid ${brand.cyan}` }}>
            💬 {r.comentario}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {ini ? `${ini.format("HH:mm")} — ${fin ? fin.format("HH:mm") : "—"}${cruzaDia > 0 ? ` (+${cruzaDia}d)` : ""}` : "Sin fecha"}
          </Text>
          {estadoTag}
        </div>
        {(r.fecha_inicio_real || r.fecha_fin_real) && (
          <div style={{ fontSize: 11, color: brand.textSecondary, marginTop: 4 }}>
            {r.fecha_inicio_real && <>Inicio real {dayjs(r.fecha_inicio_real).format("DD/MM HH:mm")} </>}
            {r.fecha_fin_real && <>· Fin real {dayjs(r.fecha_fin_real).format("DD/MM HH:mm")}</>}
          </div>
        )}
        <div style={{ marginTop: 8 }}>{renderAccion(r, true)}</div>
        <Button
          type="link"
          size="small"
          block
          icon={detalleMobile.has(r.id) ? <UpOutlined /> : <DownOutlined />}
          onClick={() => toggleDetalleMobile(r.id)}
          style={{ marginTop: 4 }}
        >
          {detalleMobile.has(r.id) ? "Ocultar detalle" : "Ver detalle"}
        </Button>
        {detalleMobile.has(r.id) && (
          <div style={{ marginTop: 4, borderTop: `1px solid ${brand.border}`, paddingTop: 8 }}>
            {renderDetalle(r)}
          </div>
        )}
      </Card>
    );
  }

  if (!data) {
    return (
      <div>
        <Title level={3}>Mi panel</Title>
        <Card loading={loading} />
      </div>
    );
  }

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
              {!data.sesionEnCurso.es_horas_extras && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    🍽 Si trabajás de corrido, el almuerzo (12:30–13:30) se descuenta solo — no hace falta pausar.
                  </Text>
                </div>
              )}
            </Col>
            <Col xs={24} sm={12} md="auto">
              <Space orientation={isMobile ? "horizontal" : "vertical"} style={{ width: "100%" }}>
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
              <Col span={12}>
                <Statistic title="Tareas hechas" value={data.rendimientoSemana.realizadas} suffix={`/ ${data.rendimientoSemana.totalProgramadas}`} />
              </Col>
              <Col span={12}>
                <Statistic title="Horas reales" value={data.rendimientoSemana.horas_reales} suffix="h" precision={1} />
                <Text type="secondary" style={{ fontSize: 11 }}>est. {data.rendimientoSemana.horas_estimadas.toFixed(1)}h</Text>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={<><LineChartOutlined /> Mi mes</>}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="Tareas hechas" value={data.rendimientoMes.realizadas} suffix={`/ ${data.rendimientoMes.totalProgramadas}`} />
              </Col>
              <Col span={12}>
                <Statistic title="Horas reales" value={data.rendimientoMes.horas_reales} suffix="h" precision={1} />
                <Text type="secondary" style={{ fontSize: 11 }}>est. {data.rendimientoMes.horas_estimadas.toFixed(1)}h</Text>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Tareas de TODA la semana (hoy resaltado con el tag "Hoy") */}
        <Col xs={24}>
          <Card
            size="small"
            title={
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: isMobile ? "4px 0" : 0 }}>
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
                {isMobile && (
                  <div style={{ overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
                    <Segmented size="small" value={diaFiltro} onChange={(v) => setDiaFiltro(v as string)} options={diaOpts} />
                  </div>
                )}
              </div>
            }
            extra={isMobile ? undefined : (
              <Segmented
                size="small"
                value={diaFiltro}
                onChange={(v) => setDiaFiltro(v as string)}
                options={diaOpts}
              />
            )}
          >
            {data.tareasSemana.length === 0
              ? <Empty description="No tenés tareas programadas esta semana" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : tareasFiltradas.length === 0
                ? <Empty description="Sin tareas para el día seleccionado" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : isMobile
                  ? <div>{tareasFiltradas.map((r) => renderTareaMobile(r))}</div>
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
      </Row>

      {/* Hoja de evaluación de la OT — SOLO LECTURA, solo hojas APROBADAS. */}
      <Modal
        open={evalOpen}
        onCancel={() => { setEvalOpen(false); setEvalData(null); }}
        footer={<Button onClick={() => { setEvalOpen(false); setEvalData(null); }}>Cerrar</Button>}
        width={modalWidth(screens, 1100)}
        title={evalData?.orden_trabajo?.ot ? `Hoja de evaluación — OT ${evalData.orden_trabajo.ot}` : "Hoja de evaluación"}
        destroyOnHidden
      >
        {evalLoading || !evalData ? (
          <div style={{ textAlign: "center", padding: 48 }}><Spin /></div>
        ) : (
          <div>
            <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Evaluado por</Text>
                <div style={{ fontSize: 12 }}>{evalData.evaluado_por ?? "—"}</div>
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Fecha evaluación</Text>
                <div style={{ fontSize: 12 }}>{evalData.fecha_evaluacion ? dayjs(String(evalData.fecha_evaluacion).slice(0, 10)).format("DD/MM/YYYY") : "—"}</div>
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Supervisor</Text>
                <div style={{ fontSize: 12 }}>{evalData.supervisor ?? "—"}</div>
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Estado</Text>
                <Tag color="success" style={{ margin: 0 }}>Aprobada</Tag>
              </Col>
            </Row>
            <EvaluacionFormulario
              modelo={evalData.modelo_evaluacion}
              sistemaMedicion={evalData.sistema_medicion}
              datos={evalData.datos_formulario ?? {}}
              onChange={() => { /* solo lectura */ }}
              readonly
              np={evalData.orden_trabajo?.np ?? null}
              descripcionCilindro={evalData.orden_trabajo?.descripcion ?? null}
              modeloCilindro={evalData.orden_trabajo?.cod_rep_flota ?? null}
            />
            {(evalData.resultado_general || evalData.recomendaciones_general) && (
              <Card size="small" style={{ marginTop: 12 }} title="Resultado y recomendaciones">
                {evalData.resultado_general && (
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Resultado general</Text>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{evalData.resultado_general}</div>
                  </div>
                )}
                {evalData.recomendaciones_general && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, display: "block" }}>Recomendaciones</Text>
                    <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{evalData.recomendaciones_general}</div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* Observaciones del técnico al pausar / finalizar (opcional). */}
      <Modal
        open={!!obsModal}
        width={modalWidth(screens, 480)}
        title={obsModal?.accion === "finalizar" ? "Finalizar tarea" : "Pausar tarea"}
        okText={obsModal?.accion === "finalizar" ? "Finalizar" : "Pausar"}
        cancelText="Cancelar"
        onOk={confirmarObs}
        onCancel={cerrarObs}
        okButtonProps={{ disabled: obsSubiendo || (obsModal?.accion === "pausar" && !obsMotivo) }}
        confirmLoading={obsModal ? accionLoading === obsModal.taskId : false}
      >
        {/* Motivo de la pausa (obligatorio): convierte el "por qué se paró" en
            data agregable para el planner (apoyos, montacarga, falta material…). */}
        {obsModal?.accion === "pausar" && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ fontSize: 13 }}>¿Por qué pausás? <Text type="danger">*</Text></Text>
            <Radio.Group
              value={obsMotivo}
              onChange={(e) => setObsMotivo(e.target.value)}
              style={{ width: "100%", marginTop: 6 }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {MOTIVOS_PAUSA.map((m) => (
                  <Radio key={m.codigo} value={m.codigo} style={{ fontSize: 13 }}>
                    {m.label}
                  </Radio>
                ))}
              </div>
            </Radio.Group>
            {obsMotivo === "ALMUERZO" && (
              <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                🍽 Dato: no hace falta pausar por almuerzo — se descuenta 1h sola, aunque ese día
                el almuerzo se corra de horario. Pausá solo si tu almuerzo dura más o menos de 1 hora.
              </Text>
            )}
          </div>
        )}
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
        {/* Adjuntar fotos / documentos (opcional). Cada archivo se sube al elegirlo. */}
        <div style={{ marginTop: 12 }}>
          <Upload
            accept={ADJUNTO_ACCEPT}
            multiple
            showUploadList={false}
            beforeUpload={(file) => { void subirAdjuntoObs(file as unknown as File); return false; }}
          >
            <Button icon={<PaperClipOutlined />} loading={obsSubiendo}>
              Adjuntar foto / documento
            </Button>
          </Upload>
          {obsAdjuntos.length > 0 && (
            <Space direction="vertical" size={2} style={{ width: "100%", marginTop: 8 }}>
              {obsAdjuntos.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <PaperClipOutlined style={{ color: brand.textSecondary }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre_archivo}</span>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => quitarAdjuntoObs(a.id)} />
                </div>
              ))}
            </Space>
          )}
        </div>
      </Modal>
    </div>
  );
}

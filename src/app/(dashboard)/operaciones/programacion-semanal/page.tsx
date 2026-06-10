"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography, Button, Space, Tag, Card, Modal, Descriptions, Tooltip, message, Empty, DatePicker, Collapse, Segmented, Slider, Alert, Popover, Divider, Select, Popconfirm, Switch, Input, InputNumber, Skeleton,
} from "antd";
import {
  CalendarOutlined, LeftOutlined, RightOutlined, UserOutlined, ToolOutlined, AimOutlined,
  SettingOutlined, RollbackOutlined, UnorderedListOutlined, WarningFilled, ZoomInOutlined, ZoomOutOutlined,
  PrinterOutlined, BgColorsOutlined, FilterOutlined, ClearOutlined,
  LoadingOutlined, CheckCircleFilled, CloseCircleFilled, EyeOutlined, SearchOutlined,
  PushpinOutlined, QuestionCircleOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { calcularFin, normalizarAInicioHabil, horasHabilesEntre } from "@/lib/planification-hours";
import { splitRecursos, joinRecursos } from "@/lib/recursos";
import { useTabSync } from "@/lib/useTabSync";
import { useSession } from "next-auth/react";
import { useEditLock } from "@/lib/useEditLock";
import TareaAdjuntosLista from "@/components/TareaAdjuntosLista";
import AyudaProgramacionSemanal from "@/components/modules/operaciones/AyudaProgramacionSemanal";

dayjs.extend(isoWeek);
dayjs.locale("es");

interface PlanRow {
  id: number;
  ot_id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
  orden: number;
  horas_estimadas: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  horas_reales: string | null;
  tecnico: string | null;
  maquina: string | null;
  comentario: string | null;
  observaciones: string | null; // notas que deja el técnico al pausar/terminar
  estado: string | null;
  version: number;
  qty_personal: number | null;
  semana_plan: string | null;
  horas_extras: boolean | null;
  horas_extras_qty: number | null;
  trabajo_externo: boolean | null;
  publicado: boolean;
  es_correctivo: boolean;
  // Línea base = foto del plan al ENVIAR (publicar) la semana. Se congela la
  // PRIMERA vez que se envía cada tarea y no se pisa al reabrir/re-enviar.
  fecha_inicio_base: string | null;
  fecha_fin_base: string | null;
  horas_estimadas_base: string | null;
  tecnico_base: string | null;
  semana_base: string | null;
  publicado_at: string | null;
  orden_trabajo: {
    id: number;
    ot: string | null;
    np: string | null;
    descripcion: string | null;
    cliente: { razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: {
      codigo: string;
      flota: { codigo: string; nombre: string } | null;
    } | null;
    cod_rep_flota: string | null;
    prioridad_atencion: { codigo: string; nombre: string; nivel: number | null } | null;
  } | null;
}

interface Trabajador { trabajador_id: number; nombre: string; area: string; puesto: string; equipo_codigo: string | null }
interface Equipo { codigo: string; descripcion: string }
interface StatusTareaOpt { codigo: string; nombre: string; color: string | null }

// Helpers para multi-operario/equipo en `tecnico`/`maquina`.
// El separador es "|" (NO coma): los nombres traen coma ("APELLIDO, NOMBRE").
function splitTecnicos(s: string | null | undefined): string[] {
  return splitRecursos(s);
}

// Colores EXACTOS de los bloques del Gantt — DEBEN coincidir con el CSS
// `.psg-task-block` de abajo. Los bloques NO usan los presets de antd tal cual:
// remapean preset→hex (ej. volcano = morado) y pisan por estado (en_proceso,
// cancelado). La leyenda usa este mismo helper para que coincida con los bloques.
const BLOQUE_PRESET_HEX: Record<string, string> = {
  warning: "#FA8C16", processing: "#1677FF", success: "#52C41A", volcano: "#B855E5", error: "#F5222D",
};
const BLOQUE_ESTADO_HEX: Record<string, string> = {
  en_proceso: "#13C2C2", cancelado: "#8c8c8c",
};
function colorBloque(estado: string | null, ecolor: string | null): string {
  if (estado && BLOQUE_ESTADO_HEX[estado]) return BLOQUE_ESTADO_HEX[estado];
  if (ecolor && BLOQUE_PRESET_HEX[ecolor]) return BLOQUE_PRESET_HEX[ecolor];
  return "#8c8c8c"; // fondo base del bloque
}

// Glifo por estado (accesibilidad: no depender solo del color).
function glifoEstado(estado: string | null): string {
  switch (estado) {
    case "realizado": return "✓";
    case "en_proceso": return "▶";
    case "pausado": return "⏸";
    case "programado": return "•";
    case "cancelado": return "✕";
    case "abierto": return "○";
    default: return "";
  }
}

const JORNADA_INICIO = 8;
const JORNADA_FIN = 20;            // grid visible hasta las 20:00 para incluir horas extras
const HORAS_DIA = JORNADA_FIN - JORNADA_INICIO; // 12
const ALMUERZO_INI = 12.5;         // hora decimal — la franja real es 12:30 → 13:30
const ALMUERZO_FIN = 13.5;
const ROW_HEIGHT = 64;
const SNAP_MIN = 15; // snap a 15 minutos
const HOUR_PX_MIN = 28;
const HOUR_PX_DEFAULT = 56;
const HOUR_PX_MAX = 100;

function hourDecimal(d: Dayjs): number {
  return d.hour() + d.minute() / 60;
}

function buildWeekDays(monday: Dayjs): Dayjs[] {
  return Array.from({ length: 5 }, (_, i) => monday.add(i, "day"));
}

function detectarConflictos(filas: PlanRow[]): Set<number> {
  const conflictos = new Set<number>();
  const byResource = new Map<string, PlanRow[]>();
  for (const r of filas) {
    if (!r.fecha_inicio || !r.fecha_fin) continue;
    const key = `${r.tecnico ?? ""}|${r.maquina ?? ""}`;
    if (!byResource.has(key)) byResource.set(key, []);
    byResource.get(key)!.push(r);
  }
  for (const arr of byResource.values()) {
    const sorted = arr.sort((a, b) => new Date(a.fecha_inicio!).getTime() - new Date(b.fecha_inicio!).getTime());
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aIni = new Date(a.fecha_inicio!).getTime();
      const aFin = new Date(a.fecha_fin!).getTime();
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bIni = new Date(b.fecha_inicio!).getTime();
        if (bIni >= aFin) break;
        const bFin = new Date(b.fecha_fin!).getTime();
        if (bIni < aFin && bFin > aIni) {
          conflictos.add(a.id);
          conflictos.add(b.id);
        }
      }
    }
  }
  return conflictos;
}

// Convierte una posición X (px desde inicio del timeline) en una fecha,
// con snap configurable (en minutos)
function pxToDate(monday: Dayjs, px: number, hourPx: number, snapMin = SNAP_MIN): Dayjs {
  const dayPx = HORAS_DIA * hourPx;
  const dayIdx = Math.max(0, Math.min(4, Math.floor(px / dayPx)));
  const remainder = px - dayIdx * dayPx;
  const hourFloat = JORNADA_INICIO + remainder / hourPx;
  const snapsPerHour = 60 / snapMin;
  const snappedHour = Math.round(hourFloat * snapsPerHour) / snapsPerHour;
  const clamped = Math.max(JORNADA_INICIO, Math.min(JORNADA_FIN, snappedHour));
  const day = monday.add(dayIdx, "day");
  const hours = Math.floor(clamped);
  const mins = Math.round((clamped - hours) * 60);
  return day.hour(hours).minute(mins).second(0).millisecond(0);
}

function semanaCodigo(d: Dayjs): string {
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}

// Una tarea ya "empezada" por el técnico (en proceso / pausada / realizada) no se
// reprograma: su horario pasó a ser ejecución real.
function haEmpezado(estado: string | null | undefined): boolean {
  return ["en_proceso", "pausado", "realizado"].includes(estado ?? "");
}

// Día abreviado en español (sin cambiar el locale global de dayjs).
const DIAS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function diaEs(d: Dayjs, conHora = false): string {
  return `${DIAS_ES[d.day()]} ${d.format(conHora ? "DD/MM HH:mm" : "DD/MM")}`;
}

export default function ProgramacionSemanalPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUser = (session?.user?.name ?? session?.user?.email) ?? null;
  const lock = useEditLock("programacion-semanal", 1, currentUser);
  const [editMode, setEditMode] = useState(false);
  const [lunes, setLunes] = useState<Dayjs>(() => dayjs().startOf("isoWeek"));
  const [cargando, setCargando] = useState(true);
  // Operarios es la vista principal (ahí se asigna); Equipos es solo lectura.
  const [view, setView] = useState<"equipo" | "operario">("operario");
  // Enviado = foto del plan al enviar la semana (*_base, solo lectura).
  // Plan ("Semana real") = el plan VIVO (editable: emergencias, movidas, tareas
  // agregadas) + la EJECUCIÓN de cada tarea iniciada como barra bajo el bloque
  // (inicio_real → fin real / ahora si está en proceso, crece en vivo).
  const [vistaTiempo, setVistaTiempo] = useState<"enviado" | "plan">("plan");
  const [filtroEquipos, setFiltroEquipos] = useState<string[]>([]);
  const [filtroOperarios, setFiltroOperarios] = useState<string[]>([]);
  // Por defecto el filtro de arriba también aplica a los pendientes de abajo.
  // Con este switch (visible solo si hay filtro activo) se ignora abajo.
  const [verTodasPendientes, setVerTodasPendientes] = useState(false);
  // Búsqueda libre del pool de pendientes (parte / cilindro / OT / descripción).
  const [poolBusqueda, setPoolBusqueda] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [allRows, setAllRows] = useState<PlanRow[]>([]); // para "sin semana asignada"
  // Estado de guardado visible: contador de requests en vuelo + último error.
  // Permite mostrar al usuario "Guardando…" o "✓ Guardado" o "⚠ Error".
  const [savingCount, setSavingCount] = useState(0);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const beginSave = useCallback(() => { setSavingCount((c) => c + 1); setLastSaveError(null); }, []);
  const endSave = useCallback((error?: string | null) => {
    setSavingCount((c) => Math.max(0, c - 1));
    if (error) setLastSaveError(error);
    else { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); }
  }, []);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [estadosCat, setEstadosCat] = useState<StatusTareaOpt[]>([]);
  const [selectedTask, setSelectedTask] = useState<PlanRow | null>(null);
  // Duración en edición dentro del modal Detalle (se guarda al salir del campo,
  // no en cada tecla). Se sincroniza con la tarea seleccionada.
  const [durModal, setDurModal] = useState<number | null>(null);
  useEffect(() => {
    setDurModal(selectedTask?.horas_estimadas != null ? Number(selectedTask.horas_estimadas) : null);
  }, [selectedTask]);
  // Comentario en edición dentro del modal Detalle (se guarda al salir del campo).
  const [comentarioModal, setComentarioModal] = useState<string>("");
  useEffect(() => {
    setComentarioModal(selectedTask?.comentario ?? "");
  }, [selectedTask]);
  // Duración REAL en edición (regularización; se guarda al salir del campo).
  const [durRealModal, setDurRealModal] = useState<number | null>(null);
  useEffect(() => {
    setDurRealModal(selectedTask?.horas_reales != null ? Number(selectedTask.horas_reales) : null);
  }, [selectedTask]);
  const [hourPx, setHourPx] = useState<number>(HOUR_PX_DEFAULT);
  const [resizing, setResizing] = useState<{ id: number; initialX: number; initialWidth: number; recurso: string } | null>(null);
  const [resizeWidth, setResizeWidth] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [ayudaOpen, setAyudaOpen] = useState(false);
  const [printDayIdx, setPrintDayIdx] = useState<number | null>(null); // null = semana, 0-4 = día específico
  const [panning, setPanning] = useState<{ initialX: number; initialScroll: number } | null>(null);
  // Drag con pointer events (más fluido que HTML5 drag)
  const [drag, setDrag] = useState<{
    taskId: number;
    fromPool: boolean;
    grabOffsetX: number;     // offset dentro del bloque cuando inició
    cursorX: number;         // x global actual
    cursorY: number;         // y global actual
    snappedDate: Dayjs | null;
    targetRow: string | null;
    blockWidth: number;
    // Para multi-select: deltas en minutos del taskId base hacia las otras tareas seleccionadas
    multiOffsets: { id: number; offsetMin: number; recurso: string | null }[];
  } | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();
  const isMobile = !screens.md;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const stripsRef = useRef<Map<string, HTMLElement>>(new Map());

  const dayPx = HORAS_DIA * hourPx;

  const viernes = useMemo(() => lunes.add(4, "day").endOf("day"), [lunes]);
  const days = useMemo(() => buildWeekDays(lunes), [lunes]);
  const semanaActual = useMemo(() => semanaCodigo(lunes), [lunes]);

  // ¿La tarea PERTENECE a la semana mostrada? (no solo se solapa con ella). Una
  // tarea que empezó la semana pasada y cuyo fin se desborda al lunes aparece en
  // el carril por solape de fechas, pero NO es parte del plan de esta semana.
  // Este criterio debe ser el MISMO que usa la publicación, si no el indicador
  // "Publicada/Reabrir" se desincroniza de lo que publicar realmente afecta.
  const perteneceASemana = useCallback((r: PlanRow): boolean =>
    r.semana_plan === semanaActual ||
    (!!r.fecha_inicio &&
      dayjs(r.fecha_inicio).isoWeek() === lunes.isoWeek() &&
      dayjs(r.fecha_inicio).isoWeekYear() === lunes.isoWeekYear()),
  [semanaActual, lunes]);

  const fetchData = useCallback(async () => {
    setCargando(true);
    try {
      const params1 = new URLSearchParams({
        limit: "10000",
        desde: lunes.hour(0).minute(0).second(0).toISOString(),
        hasta: viernes.toISOString(),
      });
      // `resAll` alimenta el pool de pendientes (sin fecha / sin semana). Debe traer
      // TODAS las filas: ordena por ot_id desc, así que con un límite chico las OTs
      // de ot_id bajo caían fuera del corte y sus tareas desaparecían del pool
      // (no se veían en la grilla ni en pendientes). 10000 = tope de la API.
      const [resWeek, resAll] = await Promise.all([
        fetch(`/api/planificacion?${params1}`),
        fetch(`/api/planificacion?limit=10000`),
      ]);
      // Una tarea cancelada no ocupa lugar: la sacamos de la grilla y del pool para
      // que su espacio quede libre y se pueda programar otra tarea encima (y para
      // que no dispare falsos choques en la detección de superposición).
      const sinCanceladas = (arr: PlanRow[]) => arr.filter((r) => r.estado !== "cancelado");
      if (resWeek.ok) setRows(sinCanceladas((await resWeek.json()).data ?? []));
      if (resAll.ok) setAllRows(sinCanceladas((await resAll.json()).data ?? []));
    } finally {
      setCargando(false);
    }
  }, [lunes, viernes]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const notifySync = useTabSync("planificacion", fetchData);

  useEffect(() => {
    (async () => {
      const [resT, resE, resS] = await Promise.all([
        fetch("/api/trabajadores?limit=200&soloOperarios=1"),
        fetch("/api/equipos?limit=200&tipo=MAQ"),
        fetch("/api/catalogos?tabla=statusTarea"),
      ]);
      if (resT.ok) setTrabajadores((await resT.json()).data ?? []);
      if (resE.ok) {
        const d = (await resE.json()).data ?? [];
        setEquipos(d.map((e: { codigo: string; descripcion: string }) => ({ codigo: e.codigo, descripcion: e.descripcion })));
      }
      if (resS.ok) setEstadosCat((await resS.json()).data ?? []);
    })();
  }, []);

  // ── Vista ENVIADO: foto del plan al enviar la semana ──
  // Proyecta los campos *_base sobre los vivos y alimenta el MISMO pipeline del
  // Gantt (carriles, carga, bloques). Sale de allRows (todas las semanas): una
  // tarea luego movida a otra semana debe seguir viéndose en la foto de su
  // semana original. Solo lectura (el pasado enviado no se edita).
  const enviadoMode = vistaTiempo === "enviado";
  const baseRows = useMemo(() => {
    const ini = lunes.startOf("day");
    return allRows
      .filter((r) => r.fecha_inicio_base && r.fecha_fin_base
        && !dayjs(r.fecha_inicio_base).isAfter(viernes)
        && !dayjs(r.fecha_fin_base).isBefore(ini))
      .map((r) => ({
        ...r,
        fecha_inicio: r.fecha_inicio_base,
        fecha_fin: r.fecha_fin_base,
        horas_estimadas: r.horas_estimadas_base ?? r.horas_estimadas,
        tecnico: r.tecnico_base ?? r.tecnico,
        semana_plan: r.semana_base ?? r.semana_plan,
      } as PlanRow));
  }, [allRows, lunes, viernes]);
  const vistaRows = enviadoMode ? baseRows : rows;

  // Operarios con algo ENVIADO esta semana — para marcar "fuera de plan" solo
  // donde hubo envío (si no, toda semana aún en borrador se llenaría de "＋").
  const lanesConEnvio = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) {
      if (r.semana_base === semanaActual && r.fecha_inicio_base) {
        for (const t of splitTecnicos(r.tecnico_base ?? r.tecnico)) s.add(t);
      }
    }
    return s;
  }, [allRows, semanaActual]);

  const conflictos = useMemo(() => detectarConflictos(vistaRows), [vistaRows]);

  // Una tarea pertenece al pool si no tiene fecha y NO está terminada: una
  // "realizado" sin agenda (el técnico la ejecutó desde su panel sin que se
  // calendarizara) ya no hay nada que programar — quedaba en el pool para
  // siempre. Las en_proceso/pausado sí se muestran (el planner ve que hay
  // trabajo en curso sin calendario); no se pueden arrastrar igual (haEmpezado).
  const esDePool = useCallback((r: PlanRow): boolean =>
    !r.fecha_inicio && r.estado !== "realizado", []);

  // ── Stats (siguen a la vista: en "Enviado" cuentan la foto) ──
  const stats = useMemo(() => {
    const conFecha = vistaRows.filter((r) => r.fecha_inicio).length;
    const sinFecha = vistaRows.length - conFecha;
    const sinSemana = allRows.filter((r) => !r.semana_plan && esDePool(r)).length;
    return {
      total: vistaRows.length,
      conFecha,
      sinFecha,
      conflictos: conflictos.size,
      sinSemana,
    };
  }, [vistaRows, allRows, conflictos, esDePool]);

  const sinSemanaLista = useMemo(
    () => allRows.filter((r) => !r.semana_plan && esDePool(r)),
    [allRows, esDePool],
  );

  // Tareas de ESTA semana sin fecha asignada (tienen semana_plan = semanaActual pero fecha_inicio en null)
  const sinFechaListaSemana = useMemo(
    () => allRows.filter((r) => r.semana_plan === semanaActual && esDePool(r)),
    [allRows, semanaActual, esDePool],
  );

  const estadoColor = useCallback((est: string | null): string => {
    const c = estadosCat.find((e) => e.codigo === est);
    return c?.color ?? "default";
  }, [estadosCat]);

  const estadoNombre = useCallback((est: string | null): string => {
    const c = estadosCat.find((e) => e.codigo === est);
    return c?.nombre ?? est ?? "-";
  }, [estadosCat]);

  // Color de prioridad por nivel (1 más urgente). Fallback gris si no hay nivel.
  const prioridadColor = (nivel: number | null | undefined): string => {
    if (nivel == null) return "default";
    if (nivel <= 1) return "red";
    if (nivel === 2) return "orange";
    if (nivel === 3) return "gold";
    return "blue";
  };

  // ── Filtro de recurso (equipos/operarios) reutilizable para filas y pendientes ──
  const hayFiltro = filtroEquipos.length > 0 || filtroOperarios.length > 0;
  const pasaFiltroRecurso = useCallback((r: PlanRow): boolean => {
    if (filtroEquipos.length > 0) {
      const maqs = splitTecnicos(r.maquina);
      if (!maqs.some((m) => filtroEquipos.includes(m))) return false;
    }
    if (filtroOperarios.length > 0) {
      const tecs = splitTecnicos(r.tecnico);
      if (!tecs.some((t) => filtroOperarios.includes(t))) return false;
    }
    return true;
  }, [filtroEquipos, filtroOperarios]);

  const rowsFiltradas = useMemo(
    () => (hayFiltro ? vistaRows.filter(pasaFiltroRecurso) : vistaRows),
    [vistaRows, hayFiltro, pasaFiltroRecurso],
  );

  // Búsqueda libre del pool: matchea parte (componente), cilindro (flota), OT,
  // descripción y código de tarea. Le da al planner una forma rápida de encontrar
  // qué programar sin depender solo del filtro por recurso.
  const pasaBusquedaPool = useCallback((t: PlanRow): boolean => {
    const q = poolBusqueda.trim().toLowerCase();
    if (!q) return true;
    const flota = t.orden_trabajo?.codigo_reparacion?.flota?.nombre
      ?? t.orden_trabajo?.codigo_reparacion?.flota?.codigo
      ?? t.orden_trabajo?.cod_rep_flota
      ?? "";
    return [
      t.componente,
      flota,
      t.descripcion,
      t.operacion_codigo,
      String(t.orden_trabajo?.ot ?? t.ot_id),
      t.orden_trabajo?.descripcion ?? "",
    ].some((v) => (v ?? "").toString().toLowerCase().includes(q));
  }, [poolBusqueda]);

  // Pendientes (pools) mostrados: aplican el filtro por recurso (salvo "Ver todas")
  // y la búsqueda libre del pool.
  const filtrarPendientes = hayFiltro && !verTodasPendientes;
  // Ordena el pool por prioridad (nivel 1 = más urgente) y luego por OT, para que
  // lo más urgente de agendar quede arriba.
  const ordenarPool = useCallback((l: PlanRow[]) => [...l].sort((a, b) => {
    const pa = a.orden_trabajo?.prioridad_atencion?.nivel ?? 99;
    const pb = b.orden_trabajo?.prioridad_atencion?.nivel ?? 99;
    if (pa !== pb) return pa - pb;
    return Number(a.orden_trabajo?.ot ?? 0) - Number(b.orden_trabajo?.ot ?? 0);
  }), []);
  const sinSemanaMostrar = useMemo(() => {
    const l = filtrarPendientes ? sinSemanaLista.filter(pasaFiltroRecurso) : sinSemanaLista;
    return ordenarPool(l.filter(pasaBusquedaPool));
  }, [sinSemanaLista, filtrarPendientes, pasaFiltroRecurso, pasaBusquedaPool, ordenarPool]);
  const sinFechaMostrar = useMemo(() => {
    const l = filtrarPendientes ? sinFechaListaSemana.filter(pasaFiltroRecurso) : sinFechaListaSemana;
    return ordenarPool(l.filter(pasaBusquedaPool));
  }, [sinFechaListaSemana, filtrarPendientes, pasaFiltroRecurso, pasaBusquedaPool, ordenarPool]);

  // ── Agrupación por recurso ──
  const recursos = useMemo(() => {
    if (view === "equipo") {
      const lista = filtroEquipos.length > 0
        ? equipos.filter((e) => filtroEquipos.includes(e.codigo))
        : equipos;
      return lista.map((e) => ({
        key: e.codigo,
        label: e.descripcion ?? e.codigo,
        sub: e.codigo,
      }));
    }
    const lista = filtroOperarios.length > 0
      ? trabajadores.filter((t) => filtroOperarios.includes(t.nombre))
      : trabajadores;
    return lista.map((t) => ({
      key: t.nombre,
      label: t.nombre,
      sub: t.area,
    }));
  }, [view, equipos, trabajadores, filtroEquipos, filtroOperarios]);

  const tareasPorRecurso = useMemo(() => {
    const map = new Map<string, PlanRow[]>();
    for (const r of rowsFiltradas) {
      // Una tarea con varios recursos aparece en cada lane (operarios o equipos).
      const keys = view === "equipo" ? splitTecnicos(r.maquina) : splitTecnicos(r.tecnico);
      for (const k of keys) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      }
    }
    return map;
  }, [rowsFiltradas, view]);

  // Carga (HH planificadas) por recurso para la semana
  const CAPACIDAD_SEMANA = 45; // 9h/día * 5 días
  const cargaPorRecurso = useMemo(() => {
    const map = new Map<string, number>();
    // Ventana de la semana (Lun 00:00 → Dom 23:59). Una tarea que cruza el fin
    // de semana (empieza viernes, sigue el lunes) reparte sus horas: las del
    // viernes cuentan en esta semana y las del lunes en la siguiente.
    const semIni = lunes.startOf("isoWeek").toDate();
    const semFin = lunes.endOf("isoWeek").toDate();
    for (const r of rowsFiltradas) {
      if (!r.fecha_inicio) continue;
      const qty = Math.max(1, Number(r.qty_personal ?? 1));
      // Una tarea TERMINADA carga sus horas REALES (lo que de verdad consumió):
      // el operario que terminó antes muestra su capacidad liberada en la barra.
      const hhTotal = (r.estado === "realizado" && r.horas_reales != null)
        ? Number(r.horas_reales)
        : Number(r.horas_estimadas ?? 0) * qty;
      let hhEnSemana: number;
      if (r.horas_extras) {
        // HE = horas continuas fuera de jornada; se cuentan enteras en su semana
        // de inicio (no se prorratean por jornada hábil).
        const fi = dayjs(r.fecha_inicio);
        hhEnSemana = (fi.isoWeek() === lunes.isoWeek() && fi.isoWeekYear() === lunes.isoWeekYear()) ? hhTotal : 0;
      } else if (r.estado === "realizado" && r.horas_reales != null) {
        // Terminada: cargan las horas REALES enteras en la semana de su inicio
        // (la ventana plan ya no representa lo que ocupó de verdad).
        const fi = dayjs(r.fecha_inicio);
        hhEnSemana = (fi.isoWeek() === lunes.isoWeek() && fi.isoWeekYear() === lunes.isoWeekYear()) ? hhTotal : 0;
      } else {
        const ini = new Date(r.fecha_inicio);
        const fin = r.fecha_fin ? new Date(r.fecha_fin) : new Date(ini.getTime() + hhTotal * 3600000);
        const clampIni = ini < semIni ? semIni : ini;
        const clampFin = fin > semFin ? semFin : fin;
        hhEnSemana = horasHabilesEntre(clampIni, clampFin);
      }
      if (hhEnSemana <= 0) continue;
      const keys = view === "equipo" ? splitTecnicos(r.maquina) : splitTecnicos(r.tecnico);
      if (keys.length === 0) continue;
      const cuota = hhEnSemana / keys.length;
      for (const k of keys) map.set(k, (map.get(k) ?? 0) + cuota);
    }
    return map;
  }, [rowsFiltradas, view, lunes]);

  // "Ahora" calculado SOLO en el cliente (con la hora local del navegador). Si
  // se usaba dayjs() directo, el render del servidor (Railway en UTC) ponía la
  // línea en hora UTC (p.ej. 16:xx en vez de 11:xx en Perú). Se actualiza cada
  // minuto, así la línea también avanza sola.
  const [ahoraTick, setAhoraTick] = useState<Dayjs | null>(null);
  useEffect(() => {
    setAhoraTick(dayjs());
    // 30s: en modo Real los bloques "en proceso" crecen en vivo hasta esta marca.
    const id = setInterval(() => setAhoraTick(dayjs()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Posición X de "ahora" si la semana actual es la mostrada
  const lineaHoy = useMemo(() => {
    if (!ahoraTick) return null;
    const ahora = ahoraTick;
    if (ahora.isoWeek() !== lunes.isoWeek() || ahora.isoWeekYear() !== lunes.isoWeekYear()) return null;
    const dayIdx = ahora.diff(lunes, "day");
    if (dayIdx < 0 || dayIdx > 4) return null;
    const h = ahora.hour() + ahora.minute() / 60;
    if (h < JORNADA_INICIO || h > JORNADA_FIN) return null;
    return dayIdx * dayPx + (h - JORNADA_INICIO) * hourPx;
  }, [ahoraTick, lunes, dayPx, hourPx]);

  // Toggle de edit mode pesimista. Adquiere / libera el lock global de la página.
  const toggleEditMode = useCallback(async () => {
    if (editMode) {
      setEditMode(false);
      await lock.release();
      return;
    }
    const ok = await lock.acquire();
    if (!ok) {
      messageApi.warning(
        lock.lockedBy
          ? `${lock.lockedBy} está editando la programación semanal.`
          : "No se pudo entrar a edición.",
      );
      return;
    }
    setEditMode(true);
  }, [editMode, lock, messageApi]);

  // Si pierdo el lock por TTL/heartbeat fail, salir de edit mode.
  useEffect(() => {
    if (editMode && !lock.isOwner && lock.lockedBy && lock.lockedBy !== currentUser) {
      setEditMode(false);
      messageApi.warning("Perdiste el lock de edición. Otro usuario lo tomó.");
    }
  }, [editMode, lock.isOwner, lock.lockedBy, currentUser, messageApi]);

  // Verifica si una tarea quedaría superpuesta con otra del mismo recurso.
  // Devuelve la primera tarea que solapa + un flag `oculta` si la tarea está
  // siendo filtrada y no se ve en pantalla (filtroEquipos / filtroOperarios).
  // Sin esa info el usuario no entiende por qué le dice que hay choque si "no
  // ve nada" en la semana.
  function tareaSuperpuesta(
    taskId: number,
    ini: number,
    fin: number,
    recursoTarget: string | null | undefined,
  ): { task: PlanRow; oculta: boolean } | null {
    if (!recursoTarget) return null;
    // recursoTarget puede ser multi ("A | B"): lo separamos y chequeamos
    // intersección con los recursos de cada tarea (antes se usaba includes() con
    // el string completo y un multi-personal NO detectaba el choque).
    const recursosTarget = splitTecnicos(recursoTarget);
    const filtradasIds = new Set(rowsFiltradas.map((r) => r.id));
    // Se chequea contra allRows (todas las semanas), no solo la visible: una
    // tarea soltada el viernes puede desbordar a la semana siguiente y chocar
    // allá. Con `rows` el cliente no veía ese choque, no mandaba `empujar`, y el
    // server respondía 409 ("no se puede ubicar") en vez de empujar la cola.
    for (const t of allRows) {
      if (t.id === taskId) continue;
      // Una tarea cancelada libera su horario: no cuenta como choque.
      if (t.estado === "cancelado") continue;
      // Soporta tareas con recurso multi (comma-separated por multi-personal).
      const recursoRaw = view === "equipo" ? t.maquina : t.tecnico;
      const recursos = splitTecnicos(recursoRaw);
      if (!recursosTarget.some((rt) => recursos.includes(rt))) continue;
      if (!t.fecha_inicio || !t.fecha_fin) continue;
      const oIni = new Date(t.fecha_inicio).getTime();
      const oFin = new Date(t.fecha_fin).getTime();
      if (ini < oFin && fin > oIni) {
        return { task: t, oculta: !filtradasIds.has(t.id) };
      }
    }
    return null;
  }

  // ── Persist con update optimista ──
  async function persistMove(id: number, nuevoInicio: Dayjs, nuevoRecurso?: string) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para mover tareas.");
      return;
    }
    const original = rows.find((r) => r.id === id) || allRows.find((r) => r.id === id);
    if (!original) return;
    // Tarea ya iniciada por el técnico: no se reprograma (su horario es real).
    if (haEmpezado(original.estado)) {
      messageApi.info("El técnico ya inició esta tarea: no se puede mover.");
      return;
    }
    // Una emergencia (correctiva) puede caer encima de otras tareas: se permite
    // el choque y después se empuja al resto del día.
    const esEmergencia = !!original.es_correctivo;
    // Si la tarea no tiene horas_estimadas (vino del pool sin fecha), defaulteamos a 1h
    const durRaw = Number(original.horas_estimadas);
    const horasFaltantes = !Number.isFinite(durRaw) || durRaw <= 0;
    const dur = horasFaltantes ? 1 : durRaw;
    const qty = Math.max(1, Number(original.qty_personal ?? 1));

    // HORAS EXTRA: solo se cargan desde Planificación. En Programación Semanal el
    // drag NUNCA crea HE — solo se programa en jornada 8–18. Si la tarea YA era HE
    // (marcada en Planificación), se preserva su flag y su posición de reloj
    // continuo; si no, se normaliza a jornada (un drop ≥18:00 cae al sgte día 8:00).
    const esHE = !!original.horas_extras;
    const inicioHoraDec = nuevoInicio.hour() + nuevoInicio.minute() / 60;
    if (!esHE && inicioHoraDec >= 18) {
      messageApi.info("Las horas extra se cargan desde Planificación. La tarea se ubicó en jornada (8–18).");
    }
    const inicioReal = esHE ? nuevoInicio : dayjs(normalizarAInicioHabil(nuevoInicio.toDate()));
    const fin = calcularFin(inicioReal.toDate(), dur * qty, esHE);

    // Bloquear si choca con otra tarea del mismo recurso.
    const recursoDestino = nuevoRecurso !== undefined
      ? nuevoRecurso
      : (view === "equipo" ? original.maquina : original.tecnico);
    // Choque de OPERARIO: en vez de bloquear, "empujamos" a las siguientes del
    // operario (el server hace la cascada; no toca terminadas / en proceso). El
    // choque de MÁQUINA lo sigue frenando el server (recurso compartido).
    const choque = esEmergencia ? null : tareaSuperpuesta(id, inicioReal.toDate().getTime(), fin.getTime(), recursoDestino);
    const empujando = !!choque && !esEmergencia;

    // No tocamos horas_extras desde acá: si la tarea ya era HE, el server conserva
    // su flag (y no recalcula el fin); si no, queda como tarea normal de jornada.
    const patch: Record<string, unknown> = {
      fecha_inicio: inicioReal.toISOString(),
      fecha_fin: fin.toISOString(),
      semana_plan: semanaCodigo(inicioReal),
    };
    if (horasFaltantes) patch.horas_estimadas = 1;
    if (nuevoRecurso !== undefined) {
      if (view === "equipo") patch.maquina = nuevoRecurso;
      else patch.tecnico = nuevoRecurso;
    }
    if (empujando) patch.empujar = true;
    // Si la tarea venía del pool con el flag `publicado` colgado (sin agenda), al
    // ubicarla pasa a ser borrador: el planner la republica cuando termine.
    const reseteaPublicado = !!original.publicado && !original.fecha_inicio;
    if (reseteaPublicado) patch.publicado = false;

    // Optimista: actualizo inmediatamente la UI
    const updated: Partial<PlanRow> = {
      fecha_inicio: inicioReal.toISOString(),
      fecha_fin: fin.toISOString(),
      semana_plan: semanaCodigo(inicioReal),
    };
    if (horasFaltantes) updated.horas_estimadas = "1";
    if (reseteaPublicado) updated.publicado = false;
    if (nuevoRecurso !== undefined) {
      if (view === "equipo") updated.maquina = nuevoRecurso;
      else updated.tecnico = nuevoRecurso;
    }
    if (horasFaltantes) {
      messageApi.info(`Duración por defecto: 1h. Ajustá con el resize.`);
    }
    setRows((prev) => {
      const exists = prev.find((r) => r.id === id);
      if (exists) return prev.map((r) => r.id === id ? { ...r, ...updated } as PlanRow : r);
      const fromAll = allRows.find((r) => r.id === id);
      return fromAll ? [...prev, { ...fromAll, ...updated } as PlanRow] : prev;
    });
    setAllRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } as PlanRow : r));

    beginSave();
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 423) {
        messageApi.error("Tarea cerrada (realizado), no editable.");
        endSave("Tarea cerrada");
        fetchData();
        return;
      }
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error");
      endSave();
      notifySync();
      // Emergencia o "empujar": el servidor reacomodó el día del operario en el
      // mismo PUT (cascade). Refrescamos para ver las tareas empujadas.
      if (esEmergencia || empujando) fetchData();
      if (empujando) {
        const e = j?.push?.empujadas?.length ?? 0;
        const p = j?.push?.alPool?.length ?? 0;
        messageApi.success(
          `Tarea ubicada.${e ? ` ${e} empujada(s).` : ""}${p ? ` ${p} al pool.` : ""}`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al reprogramar";
      endSave(msg);
      messageApi.error(msg);
      fetchData();
    }
  }

  // ── Resize ──
  async function persistResize(id: number, nuevasHoras: number) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para cambiar duración.");
      return;
    }
    const original = rows.find((r) => r.id === id);
    if (!original) return;
    const qty = Math.max(1, Number(original.qty_personal ?? 1));
    // nuevasHoras representa duración total de la barra. Las horas_estimadas son por persona.
    const horasPorPersona = Math.max(0.25, nuevasHoras / qty);
    const inicio = original.fecha_inicio ? new Date(original.fecha_inicio) : null;
    // Si la tarea es de horas extra, el fin es reloj continuo (no se recorta a
    // la jornada 8–18 ni desborda al día siguiente).
    const finCalc = inicio ? calcularFin(inicio, horasPorPersona * qty, !!original.horas_extras) : null;

    // Si la nueva duración pisa a la(s) siguiente(s) del recurso, empujamos la
    // cola (cascada en el server). Solo bloqueamos si la que choca ya fue
    // iniciada/realizada por el técnico (su horario es ejecución real y no se mueve).
    // Excepción: una EMERGENCIA (correctiva) cae encima a propósito (el server
    // corre cascadeEmergencia al reprogramar), así que no chequeamos choque acá.
    let empujar = false;
    if (inicio && finCalc && !original.es_correctivo) {
      const recurso = view === "equipo" ? original.maquina : original.tecnico;
      const choque = tareaSuperpuesta(id, inicio.getTime(), finCalc.getTime(), recurso);
      if (choque) {
        if (haEmpezado(choque.task.estado)) {
          const t = choque.task;
          const cliente = t.orden_trabajo?.cliente?.nombre_comercial
            ?? t.orden_trabajo?.cliente?.razon_social
            ?? `OT ${t.orden_trabajo?.ot ?? "#?"}`;
          const prefijoOculta = choque.oculta ? "[Tarea no visible en esta semana/filtro] " : "";
          messageApi.error(`${prefijoOculta}No se puede agrandar: la siguiente (${cliente} — ${t.descripcion ?? t.operacion_codigo}) ya fue iniciada/realizada por el técnico.`);
          return;
        }
        empujar = true;
      }
    }

    beginSave();
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horas_estimadas: horasPorPersona,
          ...(finCalc ? { fecha_fin: finCalc.toISOString() } : {}),
          ...(empujar ? { empujar: true } : {}),
        }),
      });
      if (res.status === 423) {
        messageApi.error("Tarea cerrada (realizado), no editable.");
        endSave("Tarea cerrada");
        fetchData();
        return;
      }
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.error ?? "Error");
      }
      const e = j?.push?.empujadas?.length ?? 0;
      const p = j?.push?.alPool?.length ?? 0;
      messageApi.success(`Duración: ${horasPorPersona.toFixed(2)}h${e ? ` · ${e} empujada(s).` : ""}${p ? ` ${p} al pool.` : ""}`);
      endSave();
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al redimensionar";
      endSave(msg);
      messageApi.error(msg);
      fetchData();
    }
  }

  // ── Quitar tarea de la semana (libera fecha + semana, vuelve al pool) ──
  async function persistRemoveFromWeek(id: number) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para sacar tareas.");
      return;
    }
    beginSave();
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_inicio: null, fecha_fin: null, semana_plan: null }),
      });
      if (res.status === 423) { endSave("Tarea cerrada"); messageApi.error("Tarea cerrada (realizado), no editable."); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      messageApi.success("Tarea sacada de la semana");
      endSave();
      setSelectedTask(null);
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al sacar tarea";
      endSave(msg);
      messageApi.error(msg);
    }
  }

  // ── Publicar / reabrir la semana de un operario ──
  // El planner marca su planificación como publicada (deja de ser borrador para
  // el técnico) o la reabre para seguir editándola.
  async function publicarSemana(tecnico: string, publicado: boolean) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para publicar.");
      return;
    }
    // IDs exactos del operario en la semana mostrada. Matchear por IDs es
    // determinista: evita que el match por semana_plan deje tareas afuera.
    // PUBLICAR congela solo lo AGENDADO (con fecha) — mismo criterio que el
    // indicador del carril, que solo ve tareas con fecha; las del pool siguen en
    // borrador hasta tener hora (si no, quedaba el flag `publicado` colgado).
    // REABRIR sí toma todas: también limpia flags colgados sin agenda.
    const ids = allRows
      .filter((r) => splitTecnicos(r.tecnico).includes(tecnico) && perteneceASemana(r)
        && (!publicado || !!r.fecha_inicio))
      .map((r) => r.id);
    if (ids.length === 0) {
      messageApi.info("Ese operario no tiene tareas en esta semana.");
      return;
    }
    beginSave();
    try {
      const res = await fetch("/api/planificacion/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semana: semanaActual, tecnico, publicado, ids }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error");
      endSave();
      messageApi.success(publicado ? `Semana de ${tecnico} enviada (foto del plan congelada)` : `Semana de ${tecnico} reabierta`);
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al publicar";
      endSave(msg);
      messageApi.error(msg);
    }
  }

  // ── Enviar la SEMANA COMPLETA (todos los operarios de una) ──
  // Congela la foto del plan (semana planificada) de todas las tareas AGENDADAS
  // de la semana mostrada que sigan en borrador. Las del pool (sin fecha) quedan
  // en borrador, igual que en el envío por operario. La foto solo se escribe la
  // primera vez por tarea: re-enviar después de reabrir NO la pisa.
  async function enviarSemanaCompleta() {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para enviar la semana.");
      return;
    }
    const ids = allRows
      .filter((r) => perteneceASemana(r) && !!r.fecha_inicio && splitTecnicos(r.tecnico).length > 0 && !r.publicado)
      .map((r) => r.id);
    if (ids.length === 0) {
      messageApi.info("No hay tareas agendadas pendientes de enviar en esta semana.");
      return;
    }
    beginSave();
    try {
      const res = await fetch("/api/planificacion/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semana: semanaActual, publicado: true, ids }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error");
      endSave();
      messageApi.success(`Semana ${semanaActual} enviada: ${ids.length} tarea(s). La foto del plan quedó congelada.`);
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al enviar la semana";
      endSave(msg);
      messageApi.error(msg);
    }
  }

  // ── RE-ENVIAR la semana: rehacer la foto (rebasar) ──
  // Para cuando se envió por error o el plan se corrigió ANTES de que la semana
  // arranque: vuelve a congelar la semana planificada con el plan ACTUAL
  // (rebasar=true pisa la foto anterior). La comparativa plan vs real de esa
  // semana se resetea — por eso la confirmación es fuerte.
  async function reenviarSemanaCompleta() {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para re-enviar.");
      return;
    }
    const ids = allRows
      .filter((r) => perteneceASemana(r) && !!r.fecha_inicio && splitTecnicos(r.tecnico).length > 0)
      .map((r) => r.id);
    if (ids.length === 0) {
      messageApi.info("No hay tareas agendadas en esta semana.");
      return;
    }
    beginSave();
    try {
      const res = await fetch("/api/planificacion/publicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semana: semanaActual, publicado: true, ids, rebasar: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error");
      endSave();
      messageApi.success(`Foto rehecha: la semana planificada ahora es el plan actual (${ids.length} tarea(s)).`);
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al re-enviar";
      endSave(msg);
      messageApi.error(msg);
    }
  }

  // ── Marcar una tarea como EMERGENCIA (correctiva) ──
  // Pone la tarea en estado correctivo y reacomoda las tareas del mismo día y
  // operario que arranquen después: las empuja, y las que no entran van al pool.
  async function marcarEmergencia(task: PlanRow) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para marcar emergencias.");
      return;
    }
    beginSave();
    try {
      const res = await fetch(`/api/planificacion/${task.id}/emergencia`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error");
      endSave();
      const empN = j?.empujadas?.length ?? 0;
      const poolN = j?.alPool?.length ?? 0;
      messageApi.success(
        `🚨 Emergencia marcada.` +
        (empN ? ` ${empN} tarea(s) reprogramada(s).` : "") +
        (poolN ? ` ${poolN} mandada(s) al pool.` : ""),
      );
      setSelectedTask(null);
      notifySync();
      fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al marcar emergencia";
      endSave(msg);
      messageApi.error(msg);
    }
  }

  // ── Edición de campos del modal Detalle (operario/equipo/duración/prioridad) ──
  // PUT optimista a /api/planificacion/:id. Gateado por modo edición.
  async function guardarCampoDetalle(patch: Record<string, unknown>, msg: string) {
    if (!selectedTask) return;
    const id = selectedTask.id;
    // Los flags de control (empujar) no son campos de la tarea: no deben aplicarse
    // al estado optimista local (solo van en el body del PUT).
    const campos = { ...patch };
    delete campos.empujar;
    const apply = (r: PlanRow): PlanRow => (r.id === id ? ({ ...r, ...campos } as PlanRow) : r);
    setRows((prev) => prev.map(apply));
    setAllRows((prev) => prev.map(apply));
    setSelectedTask((s) => (s ? apply(s) : s));
    beginSave();
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 423) { messageApi.error("Tarea cerrada (realizado), no editable."); endSave("cerrada"); fetchData(); return; }
      const j = await res.json().catch(() => null);
      if (!res.ok) { throw new Error(j?.error ?? "Error"); }
      // Si hubo cascada (empujar), avisamos cuántas se reacomodaron / al pool.
      const e = j?.push?.empujadas?.length ?? 0;
      const p = j?.push?.alPool?.length ?? 0;
      const extra = `${e ? ` ${e} empujada(s).` : ""}${p ? ` ${p} al pool.` : ""}`;
      messageApi.success(msg + extra); endSave(); notifySync(); fetchData();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Error al guardar";
      endSave(m); messageApi.error(m); fetchData();
    }
  }
  function detalleEditarOperario(nombres: string[]) {
    const tecnico = joinRecursos(nombres) || null;
    const patch: Record<string, unknown> = { tecnico };
    // Equipo amarrado al operario: si no hay equipo, tomar el del primer operario que tenga.
    if (!selectedTask?.maquina?.trim()) {
      for (const n of nombres) {
        const t = trabajadores.find((x) => x.nombre === n);
        if (t?.equipo_codigo) { patch.maquina = t.equipo_codigo; break; }
      }
    }
    guardarCampoDetalle(patch, "Operario actualizado");
  }
  function detalleEditarEquipo(codes: string[]) {
    guardarCampoDetalle({ maquina: joinRecursos(codes) || null }, "Equipo actualizado");
  }
  function detalleEditarDuracion(horasPorPersona: number | null) {
    if (!selectedTask || horasPorPersona == null || !(horasPorPersona > 0)) return;
    const qty = Math.max(1, Number(selectedTask.qty_personal ?? 1));
    const inicio = selectedTask.fecha_inicio ? new Date(selectedTask.fecha_inicio) : null;
    const finCalc = inicio ? calcularFin(inicio, horasPorPersona * qty, !!selectedTask.horas_extras) : null;
    // Si al agrandar la tarea pisa a la(s) siguiente(s) del recurso, en vez de
    // bloquear empujamos la cola (igual que el drag: persistMove). El server
    // reacomoda las tareas del mismo operario; solo frena si choca con una
    // máquina ocupada por OTRO operario (recurso compartido que no se mueve).
    // Excepción: una EMERGENCIA (correctiva) cae encima a propósito; el server
    // corre cascadeEmergencia al reprogramar, así que no chequeamos choque acá.
    let empujar = false;
    if (inicio && finCalc && !selectedTask.es_correctivo) {
      const recurso = view === "equipo" ? selectedTask.maquina : selectedTask.tecnico;
      const choque = tareaSuperpuesta(selectedTask.id, inicio.getTime(), finCalc.getTime(), recurso);
      if (choque) {
        // Si la siguiente ya fue iniciada/pausada/realizada por el técnico, su
        // horario es ejecución real y la cascada NO la mueve: bloqueamos.
        if (haEmpezado(choque.task.estado)) {
          messageApi.error(`No se puede agrandar: la siguiente tarea (${choque.task.descripcion ?? choque.task.operacion_codigo}) ya fue iniciada/realizada por el técnico.`);
          setDurModal(selectedTask.horas_estimadas != null ? Number(selectedTask.horas_estimadas) : null);
          return;
        }
        empujar = true;
      }
    }
    guardarCampoDetalle(
      {
        horas_estimadas: horasPorPersona,
        ...(finCalc ? { fecha_fin: finCalc.toISOString() } : {}),
        ...(empujar ? { empujar: true } : {}),
      },
      `Duración: ${horasPorPersona.toFixed(2)}h`,
    );
  }
  function detalleEditarComentario(texto: string) {
    if (!selectedTask) return;
    const limpio = texto.trim();
    // No persistir si no cambió (el blur se dispara igual al cerrar el campo).
    if ((selectedTask.comentario ?? "") === limpio) return;
    guardarCampoDetalle({ comentario: limpio || null }, "Comentario guardado");
  }
  function detalleCambiarPrioridad(correctiva: boolean) {
    if (!selectedTask) return;
    if (correctiva) {
      Modal.confirm({
        title: "Marcar como correctiva (emergencia)",
        content: "Se reprograman las tareas del mismo día y operario que arranquen después de esta; las que no entren en el día van al pool.",
        okText: "Marcar 🚨", cancelText: "Cancelar", okButtonProps: { danger: true },
        onOk: () => marcarEmergencia(selectedTask),
      });
    } else {
      guardarCampoDetalle({ es_correctivo: false }, "Prioridad: Normal");
    }
  }

  // ── Multi-move: mover varias tareas a la vez con validación atómica ──
  //
  // Antes había un bug porque cada persistMove se disparaba en paralelo y
  // chequeaba overlap contra el `rows` actual (sin reflejar las otras movidas
  // del mismo grupo). Resultado: dos tareas del grupo podían terminar pisadas.
  //
  // Ahora calculamos las posiciones nuevas de todo el grupo, validamos que
  // (1) no choquen entre sí y (2) no choquen con tareas que quedan fijas.
  // Si alguna falla, abortamos sin tocar el server.
  async function persistMultiMove(
    baseId: number,
    baseInicio: Dayjs,
    baseRecurso: string,
    offsets: { id: number; offsetMin: number; recurso: string | null }[],
  ) {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para mover tareas.");
      return;
    }
    interface Slot { id: number; ini: number; fin: number; recurso: string; he: boolean }
    const idsGrupo = new Set<number>([baseId, ...offsets.map((o) => o.id)]);

    // Encadenado por recurso: en vez de mover el grupo "rígido" (mismo delta, que
    // se rompe al cruzar el almuerzo/jornada y hace chocar las tareas entre sí),
    // ubicamos las tareas de cada recurso en orden; si una se montaría sobre la
    // anterior (porque el almuerzo estira su fin), la corremos justo después. Así
    // "mover juntos" siempre funciona y se ajusta solo. Las HE quedan en su lugar.
    const items = [
      { id: baseId, offsetMin: 0, recurso: baseRecurso },
      ...offsets.map((o) => ({ id: o.id, offsetMin: o.offsetMin, recurso: o.recurso ?? baseRecurso })),
    ];
    const porRecurso = new Map<string, typeof items>();
    for (const it of items) {
      if (!porRecurso.has(it.recurso)) porRecurso.set(it.recurso, []);
      porRecurso.get(it.recurso)!.push(it);
    }
    const slots: Slot[] = [];
    for (const lista of porRecurso.values()) {
      lista.sort((a, b) => a.offsetMin - b.offsetMin);
      let cursorMs: number | null = null;
      for (const it of lista) {
        const t = rows.find((r) => r.id === it.id) ?? allRows.find((r) => r.id === it.id);
        if (!t) continue;
        const durRaw = Number(t.horas_estimadas);
        const dur = Number.isFinite(durRaw) && durRaw > 0 ? durRaw : 1;
        const qty = Math.max(1, Number(t.qty_personal ?? 1));
        const esHE = !!t.horas_extras; // el multi-move nunca crea HE; solo preserva.
        let iniDj = baseInicio.add(it.offsetMin, "minute");
        if (!esHE) {
          // No arrancar antes del fin de la tarea previa del mismo recurso (evita
          // solape interno) y normalizar a jornada (cruza al sgte día si hace falta).
          if (cursorMs != null && iniDj.toDate().getTime() < cursorMs) iniDj = dayjs(cursorMs);
          iniDj = dayjs(normalizarAInicioHabil(iniDj.toDate()));
        }
        const fin = calcularFin(iniDj.toDate(), dur * qty, esHE);
        slots.push({ id: it.id, ini: iniDj.toDate().getTime(), fin: fin.getTime(), recurso: it.recurso, he: esHE });
        cursorMs = fin.getTime();
      }
    }

    // (2) Choque con tareas fuera del grupo (mismo recurso). Contra allRows:
    // el grupo puede desbordar a otra semana y los PUTs van con omitirAntisolape,
    // así que este chequeo es la única defensa también para esos choques.
    for (const s of slots) {
      const recsSlot = splitTecnicos(s.recurso);
      for (const t of allRows) {
        if (idsGrupo.has(t.id)) continue;
        if (!t.fecha_inicio || !t.fecha_fin) continue;
        const recursoRaw = view === "equipo" ? t.maquina : t.tecnico;
        const recursos = splitTecnicos(recursoRaw);
        if (!recsSlot.some((r) => recursos.includes(r))) continue;
        const oIni = new Date(t.fecha_inicio).getTime();
        const oFin = new Date(t.fecha_fin).getTime();
        if (s.ini < oFin && s.fin > oIni) {
          const cliente = t.orden_trabajo?.cliente?.nombre_comercial
            ?? t.orden_trabajo?.cliente?.razon_social
            ?? `OT ${t.orden_trabajo?.ot ?? "#?"}`;
          messageApi.error(`No se puede mover el grupo: choca con ${cliente} — ${t.descripcion ?? t.operacion_codigo}`);
          return;
        }
      }
    }

    // Validado: disparamos las requests en paralelo (sin pasar por la
    // validación local de persistMove porque ya las hicimos acá).
    beginSave();
    const reqs: Promise<unknown>[] = [];
    for (const s of slots) {
      // Solo preservamos HE si la tarea YA era HE (creada en Planificación); el
      // multi-move nunca crea HE.
      reqs.push(
        fetch(`/api/planificacion/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha_inicio: new Date(s.ini).toISOString(),
            fecha_fin: new Date(s.fin).toISOString(),
            semana_plan: semanaCodigo(dayjs(s.ini)),
            ...(view === "equipo" ? { maquina: s.recurso } : { tecnico: s.recurso }),
            ...(s.he ? { horas_extras: true, horas_extras_qty: Math.max(0.5, (s.fin - s.ini) / 3600000) } : {}),
            // El grupo ya se validó en el cliente; evitamos falsos positivos del
            // anti-solape de servidor por las posiciones viejas en PUTs paralelos.
            omitirAntisolape: true,
          }),
        }),
      );
    }
    const results = await Promise.allSettled(reqs);
    const fallos = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as Response).ok)).length;
    if (fallos > 0) {
      endSave(`${fallos} de ${slots.length} fallaron`);
      messageApi.warning(`${slots.length - fallos} de ${slots.length} movidas OK. ${fallos} fallaron.`);
    } else {
      endSave();
      messageApi.success(`${slots.length} tareas movidas.`);
    }
    notifySync();
    fetchData();
  }

  // Mouse listeners para resize en vivo
  useEffect(() => {
    if (!resizing) return;
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - resizing!.initialX;
      setResizeWidth(Math.max(20, resizing!.initialWidth + delta));
    }
    function onUp() {
      // Convertir resizeWidth (px) a horas, snap a 15 min
      const horasRaw = resizeWidth / hourPx;
      const snapped = Math.max(0.25, Math.round(horasRaw * (60 / SNAP_MIN)) / (60 / SNAP_MIN));
      persistResize(resizing!.id, snapped);
      setResizing(null);
      setResizeWidth(0);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, resizeWidth, hourPx]);

  // ── Drag con pointer events (más fluido + ghost en vivo) ──
  function startDrag(e: React.MouseEvent, taskId: number, fromPool: boolean) {
    if (resizing) return;
    // La vista por Equipos es SOLO LECTURA: las tareas se asignan a operarios
    // (la máquina sale del operario). Acá solo se visualiza la carga.
    if (view === "equipo") return;
    // Enviado (foto) y Ejecución son solo lectura: solo se edita la Semana real.
    if (vistaTiempo !== "plan") return;
    if (e.button !== 0) return; // solo click izquierdo
    // Tarea publicada Y AGENDADA = plan congelado: no se mueve hasta reabrir la
    // semana. Una tarea del pool (sin fecha) no es un plan congelado aunque arrastre
    // el flag `publicado` (p.ej. quedó colgado de una importación): se puede asignar
    // —y al asignarla se vuelve borrador (ver persistMove)—. Si no, una tarea
    // publicada sin semana queda atascada: no se puede mover ni reabrir (no aparece
    // en ningún carril semanal donde esté el botón Reabrir).
    const tDrag = rows.find((r) => r.id === taskId) ?? allRows.find((r) => r.id === taskId);
    if (tDrag?.publicado && tDrag?.fecha_inicio) {
      messageApi.info("Tarea enviada. Reabrí la semana del operario para moverla.");
      return;
    }
    // Tarea ya iniciada por el técnico (en proceso / pausada / realizada): su
    // horario ya es ejecución real, no se reprograma.
    if (haEmpezado(tDrag?.estado)) {
      messageApi.info("El técnico ya inició esta tarea: no se puede mover.");
      return;
    }
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    // Si la tarea está en el set de seleccionadas y hay más de 1, prepara multi-drag
    const multiOffsets: { id: number; offsetMin: number; recurso: string | null }[] = [];
    if (selectedIds.has(taskId) && selectedIds.size > 1) {
      const base = rows.find((r) => r.id === taskId) ?? allRows.find((r) => r.id === taskId);
      const baseIni = base?.fecha_inicio ? new Date(base.fecha_inicio).getTime() : null;
      if (baseIni != null) {
        for (const id of selectedIds) {
          if (id === taskId) continue;
          const t = rows.find((r) => r.id === id) ?? allRows.find((r) => r.id === id);
          if (!t || !t.fecha_inicio) continue;
          if (haEmpezado(t.estado)) continue; // no arrastrar tareas ya iniciadas
          const offsetMin = Math.round((new Date(t.fecha_inicio).getTime() - baseIni) / 60000);
          multiOffsets.push({
            id,
            offsetMin,
            // startDrag solo corre en vista Operarios (Equipos es solo lectura),
            // así que el recurso es siempre el técnico.
            recurso: t.tecnico,
          });
        }
      }
    }
    setDrag({
      taskId,
      fromPool,
      grabOffsetX: e.clientX - rect.left,
      cursorX: e.clientX,
      cursorY: e.clientY,
      snappedDate: null,
      targetRow: null,
      blockWidth: rect.width,
      multiOffsets,
    });
  }

  function toggleSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }

  // Calcular fila + hora a partir de cursor
  const getDropTarget = useCallback((cursorX: number, cursorY: number, grabOffsetX: number): { row: string | null; date: Dayjs | null } => {
    let foundRow: string | null = null;
    for (const [recurso, el] of stripsRef.current.entries()) {
      const r = el.getBoundingClientRect();
      if (cursorY >= r.top && cursorY <= r.bottom && cursorX >= r.left && cursorX <= r.right) {
        foundRow = recurso;
        const xInStrip = cursorX - r.left - grabOffsetX + el.scrollLeft;
        const fecha = pxToDate(lunes, xInStrip, hourPx);
        return { row: recurso, date: fecha };
      }
    }
    return { row: foundRow, date: null };
  }, [lunes, hourPx]);

  // Antes el drag marcaba en rojo (conflicto) cuando se soltaba sobre otra tarea
  // del mismo operario. Ahora ese caso NO bloquea: al soltar se empuja a las
  // siguientes (ver persistMove → empujar). Los choques de MÁQUINA (recurso
  // compartido) los valida el servidor al guardar. Por eso ya no marcamos
  // conflicto en vivo durante el drag.
  const dragConflict = false;

  // Listeners globales para mover/soltar + atajos teclado + auto-scroll
  useEffect(() => {
    if (!drag) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const scrollInterval: ReturnType<typeof setInterval> | null = null;

    function onMove(ev: MouseEvent) {
      const target = getDropTarget(ev.clientX, ev.clientY, drag!.grabOffsetX);
      setDrag((d) => d ? { ...d, cursorX: ev.clientX, cursorY: ev.clientY, snappedDate: target.date, targetRow: target.row } : d);

      // Auto-scroll: si el cursor está cerca del borde derecho/izquierdo del wrap, scroll
      const wrap = timelineRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const margin = 60;
        if (ev.clientX > rect.right - margin) {
          wrap.scrollLeft += 12;
        } else if (ev.clientX < rect.left + margin + 200) { // 200 = ancho de columna recurso
          wrap.scrollLeft -= 12;
        }
      }
    }
    function onUp() {
      if (drag!.snappedDate && drag!.targetRow) {
        // Multi-move: pre-calculamos las posiciones de TODO el grupo y
        // validamos overlap entre las propias tareas movidas + con las que
        // quedan fijas. Si una choca, abortamos el batch entero (mantiene
        // el estado consistente: o se mueven todas o ninguna).
        if (drag!.multiOffsets.length > 0) {
          persistMultiMove(drag!.taskId, drag!.snappedDate, drag!.targetRow, drag!.multiOffsets);
        } else {
          persistMove(drag!.taskId, drag!.snappedDate, drag!.targetRow);
        }
      }
      setDrag(null);
    }
    function onKey(ev: KeyboardEvent) {
      if (!drag) return;
      if (ev.key === "Escape") {
        setDrag(null);
        ev.preventDefault();
        return;
      }
      if (!drag.snappedDate) return;
      let delta = 0;
      let dayDelta = 0;
      if (ev.key === "ArrowLeft") delta = -15;
      else if (ev.key === "ArrowRight") delta = 15;
      else if (ev.key === "ArrowUp") dayDelta = -1;
      else if (ev.key === "ArrowDown") dayDelta = 1;
      else return;
      ev.preventDefault();
      let next = drag.snappedDate.add(delta, "minute");
      if (dayDelta) next = next.add(dayDelta, "day");
      setDrag((d) => d ? { ...d, snappedDate: next } : d);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey);
      if (scrollInterval) clearInterval(scrollInterval);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, getDropTarget]);

  function registerStrip(recurso: string, el: HTMLElement | null) {
    if (el) stripsRef.current.set(recurso, el);
    else stripsRef.current.delete(recurso);
  }

  // Ctrl+Wheel para zoom (necesita listener nativo no-pasivo)
  useEffect(() => {
    const wrap = timelineRef.current;
    if (!wrap) return;
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setHourPx((px) => {
          const delta = e.deltaY > 0 ? -4 : 4;
          return Math.max(HOUR_PX_MIN, Math.min(HOUR_PX_MAX, px + delta));
        });
      }
    }
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  // Pan con click sostenido sobre área vacía del Gantt
  useEffect(() => {
    if (!panning) return;
    document.body.style.cursor = "grabbing";
    function onMove(ev: MouseEvent) {
      const wrap = timelineRef.current;
      if (!wrap) return;
      wrap.scrollLeft = panning!.initialScroll - (ev.clientX - panning!.initialX);
    }
    function onUp() { setPanning(null); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
  }, [panning]);

  function startPan(e: React.MouseEvent) {
    if (resizing || drag) return;
    const t = e.target as HTMLElement;
    // No paneo si tocó algún bloque, handle, header, o cell de recurso
    if (
      t.closest(".psg-task-block") ||
      t.closest(".psg-resize-handle") ||
      t.closest(".psg-pool-card") ||
      t.closest(".psg-resource-cell")
    ) return;
    if (e.button !== 0) return;
    if (!timelineRef.current) return;
    setPanning({
      initialX: e.clientX,
      initialScroll: timelineRef.current.scrollLeft,
    });
  }

  function renderTaskBlock(r: PlanRow, recurso: string) {
    if (!r.fecha_inicio) return null;
    const planIni = dayjs(r.fecha_inicio);
    // Tarea agendada SIN duración (horas_estimadas 0/null → el server deja
    // fecha_fin en null): antes no se renderizaba — quedaba invisible (con fecha
    // no está en el pool, sin fin no tenía bloque). Se dibuja con 1h visual para
    // que el planner la vea y le ajuste la duración.
    const sinDuracion = !r.fecha_fin;
    const planFin = sinDuracion ? planIni.add(1, "hour") : dayjs(r.fecha_fin);
    // Desvíos vs el plan ENVIADO — solo en vista "Semana real":
    //   ↷ la tarea se movió (fecha u operario distinto a la foto)
    //   ＋ no estaba en el plan enviado (se agregó después; solo se marca si el
    //     operario tiene algo enviado esta semana)
    const baseIni = r.fecha_inicio_base ? dayjs(r.fecha_inicio_base) : null;
    const desviada = vistaTiempo === "plan" && !!baseIni
      && (Math.abs(baseIni.diff(planIni, "minute")) >= 1 || (r.tecnico_base ?? r.tecnico ?? "") !== (r.tecnico ?? ""));
    const fueraDePlan = vistaTiempo === "plan" && !baseIni && lanesConEnvio.has(recurso);
    const empezada = haEmpezado(r.estado);
    // En SEMANA REAL una tarea ya iniciada arranca su bloque en el inicio REAL,
    // pero el ACORTE a la duración real ocurre recién al TERMINAR:
    //   - realizado → inicio_real → fin_real (bloque del tamaño que realmente duró).
    //   - en_proceso / pausado → el bloque RESERVA la duración planificada desde
    //     el inicio real. Si mostrara solo lo transcurrido (3h plan, va 1h →
    //     bloque de 1h), el espacio "libre" invitaría a sobre-programar al
    //     operario con trabajo que no le entra. Si se pasa del plan, crece en
    //     vivo hasta "ahora" (el atraso se ve).
    // Es seguro: las iniciadas no se arrastran ni se redimensionan.
    let ini = planIni;
    let fin = planFin;
    if (vistaTiempo === "plan" && empezada && r.fecha_inicio_real) {
      ini = dayjs(r.fecha_inicio_real);
      const durPlan = Number(r.horas_estimadas ?? 0) * Math.max(1, Number(r.qty_personal ?? 1));
      if (r.estado === "realizado") {
        // Terminada: recién acá se acorta a lo que realmente duró.
        fin = r.fecha_fin_real
          ? dayjs(r.fecha_fin_real)
          : dayjs(calcularFin(ini.toDate(), Math.max(Number(r.horas_reales ?? 0), 0.25), !!r.horas_extras));
      } else {
        const finEsperado = durPlan > 0
          ? dayjs(calcularFin(ini.toDate(), durPlan, !!r.horas_extras))
          : ini.add(1, "hour");
        const ahora = ahoraTick ?? dayjs();
        fin = r.estado === "en_proceso" && ahora.isAfter(finEsperado) ? ahora : finEsperado;
      }
      if (!fin.isAfter(ini)) fin = ini.add(15, "minute"); // guard tamaño mínimo
    }
    // Bordes de la semana visible (lunes 8:00 → viernes 18:00)
    const semanaIni = lunes.hour(JORNADA_INICIO).minute(0).second(0).millisecond(0);
    const semanaFin = lunes.add(4, "day").hour(JORNADA_FIN).minute(0).second(0).millisecond(0);
    // Si no hay overlap con esta semana, no renderizar
    if (fin.isBefore(semanaIni) || ini.isAfter(semanaFin)) return null;

    const continuaDeAntes = ini.isBefore(semanaIni);
    const continuaDespues = fin.isAfter(semanaFin);

    // Clipear ini/fin a la semana visible para calcular px
    const visibleIni = continuaDeAntes ? semanaIni : ini;
    const visibleFin = continuaDespues ? semanaFin : fin;

    const startPx = visibleIni.diff(lunes, "day") * dayPx + (hourDecimal(visibleIni) - JORNADA_INICIO) * hourPx;
    const endPx = visibleFin.diff(lunes, "day") * dayPx + (hourDecimal(visibleFin) - JORNADA_INICIO) * hourPx;
    const baseWidth = Math.max(40, endPx - startPx);
    const widthPx = resizing?.id === r.id ? Math.max(20, resizeWidth) : baseWidth;
    const color = estadoColor(r.estado);
    const hasConflict = conflictos.has(r.id);

    // ── Barra de ejecución en SEMANA PLANIFICADA (solo visualización) ──
    // Sobre la foto del plan se dibuja DÓNDE ocurrió la ejecución real: la
    // comparación "plan enviado vs realidad" se ve en el mismo carril. (En
    // Semana real no hace falta: ahí el propio bloque ya muestra lo real.)
    let execBar: { left: number; width: number } | null = null;
    if (enviadoMode && empezada && r.fecha_inicio_real) {
      const eIni = dayjs(r.fecha_inicio_real);
      let eFin: Dayjs;
      if (r.estado === "en_proceso") {
        eFin = ahoraTick ?? dayjs(); // crece en vivo
      } else if (r.estado === "realizado" && r.fecha_fin_real) {
        eFin = dayjs(r.fecha_fin_real);
      } else {
        // pausado (o realizado sin fin_real): proyectar por horas reales hábiles.
        const hr = Number(r.horas_reales ?? 0);
        eFin = hr > 0 ? dayjs(calcularFin(eIni.toDate(), hr, !!r.horas_extras)) : eIni.add(30, "minute");
      }
      if (!eFin.isAfter(eIni)) eFin = eIni.add(15, "minute");
      const eIniC = eIni.isBefore(semanaIni) ? semanaIni : eIni;
      const eFinC = eFin.isAfter(semanaFin) ? semanaFin : eFin;
      if (eFinC.isAfter(eIniC)) {
        const exStart = eIniC.diff(lunes, "day") * dayPx + (hourDecimal(eIniC) - JORNADA_INICIO) * hourPx;
        const exEnd = eFinC.diff(lunes, "day") * dayPx + (hourDecimal(eFinC) - JORNADA_INICIO) * hourPx;
        execBar = { left: exStart, width: Math.max(6, exEnd - exStart) };
      }
    }
    return (
      <Fragment key={r.id}>
      <Tooltip
        title={
          <div>
            <div><strong>OT {r.orden_trabajo?.ot ?? r.ot_id}</strong></div>
            <div>{r.componente} — {r.operacion_codigo} {r.descripcion}</div>
            {r.orden_trabajo?.descripcion && <div>Descripción: {r.orden_trabajo.descripcion}</div>}
            <div>Flota: {flotaDe(r)}</div>
            <div>📋 Plan: {planIni.format("DD/MM HH:mm")} → {planFin.format("DD/MM HH:mm")} · {Number(r.horas_estimadas ?? 0).toFixed(1)}h{r.qty_personal && r.qty_personal > 1 ? ` × ${r.qty_personal} pers.` : ""}</div>
            {empezada && r.fecha_inicio_real && (
              <div>⏱ Real: {dayjs(r.fecha_inicio_real).format("DD/MM HH:mm")} → {r.fecha_fin_real ? dayjs(r.fecha_fin_real).format("DD/MM HH:mm") : (r.estado === "en_proceso" ? "en curso" : "—")}{r.horas_reales != null ? ` · ${Number(r.horas_reales).toFixed(1)}h` : ""}</div>
            )}
            <div>Estado: {estadoNombre(r.estado)}</div>
            {r.observaciones && (
              <div style={{ color: "#13C2C2" }}>🗒 Nota del técnico: {r.observaciones}</div>
            )}
            {enviadoMode && r.publicado_at && (
              <div>📌 Foto del plan enviado el {dayjs(r.publicado_at).format("DD/MM HH:mm")}</div>
            )}
            {desviada && baseIni && (
              <div style={{ color: brand.warning }}>
                ↷ Distinto al enviado: {baseIni.format("DD/MM HH:mm")} → {r.fecha_fin_base ? dayjs(r.fecha_fin_base).format("DD/MM HH:mm") : "—"}
                {(r.tecnico_base ?? "") !== (r.tecnico ?? "") ? ` · era de ${r.tecnico_base}` : ""}
              </div>
            )}
            {fueraDePlan && <div style={{ color: brand.warning }}>＋ Fuera del plan enviado (agregada después de enviar)</div>}
            {sinDuracion && <div style={{ color: brand.warning }}>⚠ Sin duración — se muestra 1h; ajustala con el resize o en el detalle</div>}
            {hasConflict && <div style={{ color: brand.error }}>⚠ Conflicto</div>}
          </div>
        }
      >
        <div
          onMouseDown={(e) => {
            // No iniciar drag si el target es el resize handle
            const t = e.target as HTMLElement;
            if (t.classList.contains("psg-resize-handle")) return;
            // Shift+Click NO inicia drag, solo toggle selección
            if (e.shiftKey) return;
            // Enviado (foto) y Ejecución = solo lectura; solo se arrastra en Semana real.
            if (vistaTiempo !== "plan") return;
            // Solo bloqueamos el drag si la tarea EMPIEZA en una semana anterior
            // (su inicio no está visible, no sabríamos reubicarla). Las que se
            // desbordan hacia adelante (continuaDespues) SÍ se pueden mover —
            // así una tarea quedó "muy larga / tarde" se puede reacomodar.
            if (continuaDeAntes) return;
            startDrag(e, r.id, false);
          }}
          onClick={(e) => {
            if (resizing || drag) return;
            if (e.shiftKey) {
              e.preventDefault();
              toggleSelection(r.id);
              return;
            }
            setSelectedTask(r);
          }}
          className={`psg-task-block ${selectedIds.has(r.id) ? "psg-task-selected" : ""} ${continuaDeAntes ? "psg-task-cont-left" : ""} ${continuaDespues ? "psg-task-cont-right" : ""}`}
          style={{
            left: startPx,
            width: widthPx,
            top: 8,
            height: ROW_HEIGHT - 16,
            opacity: drag?.taskId === r.id || (drag && selectedIds.has(r.id)) ? 0.25 : 1,
            cursor: continuaDeAntes ? "pointer" : undefined,
          }}
          data-color={color}
          data-estado={r.estado ?? ""}
          data-emg={r.es_correctivo ? "1" : "0"}
          data-pub={r.publicado ? "1" : "0"}
          data-conflict={hasConflict ? "1" : "0"}
          data-externo={r.trabajo_externo ? "1" : "0"}
        >
          {/* Indicador de continuación desde semana anterior */}
          {continuaDeAntes && (
            <div className="psg-task-cont-marker psg-task-cont-marker-left" title={`Empezó el ${diaEs(ini, true)}`}>
              <LeftOutlined style={{ fontSize: 10 }} />
            </div>
          )}
          {/* Indicador de continuación a semana siguiente */}
          {continuaDespues && (
            <div className="psg-task-cont-marker psg-task-cont-marker-right" title={`Termina el ${diaEs(fin, true)}`}>
              <RightOutlined style={{ fontSize: 10 }} />
            </div>
          )}
          {/* Franja de almuerzo dentro del bloque (si lo cruza) */}
          {renderLunchOverlayInBlock(visibleIni, visibleFin, startPx)}
          <div className="psg-task-title" style={{ paddingLeft: continuaDeAntes ? 14 : 0, paddingRight: continuaDespues ? 14 : 0 }}>
            {r.es_correctivo && "🚨 "}{fueraDePlan && <span style={{ marginRight: 3, fontWeight: 800 }} title="Fuera del plan enviado">＋</span>}{desviada && <span style={{ marginRight: 3, fontWeight: 800 }} title="Distinto al plan enviado">↷</span>}{glifoEstado(r.estado) && <span style={{ opacity: 0.95, marginRight: 3 }}>{glifoEstado(r.estado)}</span>}{r.orden_trabajo?.ot ? `OT-${r.orden_trabajo.ot}` : "S/OT"}
            {hasConflict && <WarningFilled style={{ marginLeft: 4 }} />}
          </div>
          <div className="psg-task-sub" style={{ paddingLeft: continuaDeAntes ? 14 : 0, paddingRight: continuaDespues ? 14 : 0 }}>{r.componente} — {r.descripcion}</div>
          {r.comentario && (widthPx >= 90 ? (
            <div className="psg-task-cmt" style={{ paddingLeft: continuaDeAntes ? 14 : 0, paddingRight: continuaDespues ? 14 : 0 }}>💬 {r.comentario}</div>
          ) : (
            // Bloque angosto: el comentario no entra legible → badge (texto en el tooltip).
            <span className="psg-task-cmt-badge" title={r.comentario}>💬</span>
          ))}
          {/* Nota del técnico (pausar/terminar): marcador visible; el texto va
              en el tooltip y en el modal Detalle. */}
          {r.observaciones && (
            <span className="psg-task-cmt-badge" style={{ right: r.comentario ? 16 : 3 }} title={`Nota del técnico: ${r.observaciones}`}>🗒</span>
          )}
          {/* Resize handle: solo en Semana real + vista Operarios (Enviado /
              Ejecución / Equipos son solo lectura), si la tarea NO continúa a la
              próxima semana y NO está enviada (enviada = plan congelado). */}
          {vistaTiempo === "plan" && !continuaDespues && view !== "equipo" && !r.publicado && !haEmpezado(r.estado) && (
            <div
              className="psg-resize-handle"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setResizing({ id: r.id, initialX: e.clientX, initialWidth: baseWidth, recurso });
                setResizeWidth(baseWidth);
              }}
              title="Arrastrá para cambiar la duración"
            />
          )}
        </div>
      </Tooltip>
      {/* Barra de ejecución real sobre la foto (no intercepta el mouse). */}
      {execBar && (
        <div
          className="psg-exec-bar"
          data-estado={r.estado ?? ""}
          style={{ left: execBar.left, width: execBar.width }}
        />
      )}
      </Fragment>
    );
  }

  // Calcula posiciones de almuerzo que el bloque cruza, y los renderiza como franjas internas
  function renderLunchOverlayInBlock(ini: Dayjs, fin: Dayjs, blockStartPx: number) {
    const overlays: { left: number; width: number }[] = [];
    for (let d = 0; d < 5; d++) {
      const dayStart = lunes.add(d, "day").hour(0).minute(0);
      const lunchStart = dayStart.hour(12).minute(30);
      const lunchEnd = dayStart.hour(13).minute(30);
      if (fin.isAfter(lunchStart) && ini.isBefore(lunchEnd)) {
        const lsPx = d * dayPx + (12.5 - JORNADA_INICIO) * hourPx;
        const lePx = d * dayPx + (13.5 - JORNADA_INICIO) * hourPx;
        overlays.push({ left: lsPx - blockStartPx, width: lePx - lsPx });
      }
    }
    return overlays.map((o, i) => (
      <div
        key={i}
        className="psg-block-lunch"
        style={{ left: o.left, width: o.width }}
        title="Hora de almuerzo (12:30–13:30) — no cuenta"
      />
    ));
  }

  // Flota de la tarea (desde el cod_rep, con respaldo al texto cod_rep_flota).
  function flotaDe(t: PlanRow): string {
    return t.orden_trabajo?.codigo_reparacion?.flota?.nombre
      ?? t.orden_trabajo?.cod_rep_flota
      ?? "—";
  }

  // Tarjeta de tarea en los pools (pendientes). Estructura pedida:
  // OT - FLOTA / DESCRIPCIÓN OT / PARTE / TAREA / OPERARIO · duración
  function renderPoolCard(t: PlanRow, semanaCard: boolean) {
    const horas = Number(t.horas_estimadas ?? 0);
    const sinHoras = !Number.isFinite(horas) || horas <= 0;
    const recurso = view === "equipo" ? t.maquina : t.tecnico;
    return (
      <div
        key={t.id}
        onMouseDown={(e) => startDrag(e, t.id, true)}
        onClick={() => { if (!drag) setSelectedTask(t); }}
        className={`psg-pool-card${semanaCard ? " psg-pool-card-semana" : ""}`}
        data-color={estadoColor(t.estado)}
        data-estado={t.estado ?? ""}
        data-emg={t.es_correctivo ? "1" : "0"}
        data-externo={t.trabajo_externo ? "1" : "0"}
        style={{ opacity: drag?.taskId === t.id ? 0.25 : 1 }}
      >
        <div style={{ fontWeight: 600, fontSize: 12 }}>
          {t.es_correctivo && "🚨 "}{t.orden_trabajo?.ot ? `OT-${t.orden_trabajo.ot}` : "S/OT"} · {flotaDe(t)}
        </div>
        <div style={{ fontSize: 11, opacity: 0.95, fontWeight: 500 }}>
          {t.orden_trabajo?.descripcion ?? "—"}
        </div>
        <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>Parte: {t.componente}</div>
        <div style={{ fontSize: 10, opacity: 0.85 }}>
          Tarea: {t.operacion_codigo}{t.descripcion ? ` — ${t.descripcion}` : ""}
        </div>
        <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          <span>{recurso || "Sin asignar"}</span>
          <span>·</span>
          {sinHoras
            ? <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: "16px" }}>sin duración</Tag>
            : <span>{horas.toFixed(1)}h</span>}
        </div>
      </div>
    );
  }

  // ── Fallback MOBILE: el Gantt no es usable en celular. Vista read-only por
  //    recurso → tareas de la semana (hora + estado), tap abre la OT. ──
  if (isMobile) {
    return (
      <div style={{ padding: 8 }}>
        <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "8px 12px" } }}>
          <Space wrap size={6}>
            <Button shape="circle" size="small" icon={<LeftOutlined />} onClick={() => setLunes((m) => m.subtract(1, "week"))} />
            <strong style={{ fontSize: 13 }}>Semana {lunes.isoWeek()} · {lunes.isoWeekYear()}</strong>
            <Button shape="circle" size="small" icon={<RightOutlined />} onClick={() => setLunes((m) => m.add(1, "week"))} />
            <Button size="small" icon={<AimOutlined />} onClick={() => setLunes(dayjs().startOf("isoWeek"))}>Hoy</Button>
            <Segmented
              size="small" value={view}
              onChange={(v) => setView(v as "equipo" | "operario")}
              options={[{ value: "operario", icon: <UserOutlined /> }, { value: "equipo", icon: <ToolOutlined /> }]}
            />
            <Segmented
              size="small" value={vistaTiempo}
              onChange={(v) => setVistaTiempo(v as "enviado" | "plan")}
              options={[
                { value: "enviado", label: "Planificada" },
                { value: "plan", label: "Semana real" },
              ]}
            />
          </Space>
        </Card>
        {cargando && rows.length === 0 ? (
          <Skeleton active />
        ) : recursos.length === 0 ? (
          <Empty description="Sin recursos." />
        ) : (
          recursos.map((res) => {
            const tasks = (tareasPorRecurso.get(res.key) ?? []).slice().sort((a, b) => (a.fecha_inicio ?? "").localeCompare(b.fecha_inicio ?? ""));
            return (
              <Card key={res.key} size="small" title={res.label} style={{ marginBottom: 8 }} styles={{ body: { padding: 8 } }}>
                {tasks.length === 0 ? (
                  <span style={{ fontSize: 12, color: brand.textSecondary }}>Sin tareas esta semana.</span>
                ) : tasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/ordenes-trabajo/${t.ot_id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: `1px solid ${brand.border}`, cursor: "pointer" }}
                  >
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 4, background: colorBloque(t.estado, estadoColor(t.estado)), color: brand.white, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", opacity: t.estado === "cancelado" ? 0.5 : 1 }}>
                      {t.es_correctivo ? "🚨" : glifoEstado(t.estado) || "•"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        OT-{t.orden_trabajo?.ot ?? t.ot_id} · {t.componente} — {t.descripcion}
                      </div>
                      <div style={{ fontSize: 11, color: brand.textSecondary }}>
                        {t.fecha_inicio ? diaEs(dayjs(t.fecha_inicio), true) : "sin hora"} · {estadoNombre(t.estado)}
                        {vistaTiempo === "plan" && haEmpezado(t.estado) && t.horas_reales != null && (
                          <> · ⏱ {Number(t.horas_reales).toFixed(1)}h real{t.horas_estimadas != null ? ` / ${Number(t.horas_estimadas).toFixed(1)}h plan` : ""}</>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%" }}>
      {contextHolder}

      {!lock.isOwner && lock.lockedBy && (
        <Alert
          type="warning"
          showIcon
          title={`${lock.lockedBy} está editando la programación semanal`}
          description="Solo podés ver hasta que termine. Si se quedó colgado el lock se libera solo a los 3 minutos."
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Header con gradient */}
      <Card
        styles={{ body: { padding: "16px 20px" } }}
        style={{
          marginBottom: 12,
          background: `linear-gradient(135deg, ${brand.navy}, ${brand.cyan})`,
          color: brand.white,
          border: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <Typography.Title level={3} style={{ color: brand.white, margin: 0 }}>
              <CalendarOutlined style={{ marginRight: 8 }} />
              Programación Semanal
            </Typography.Title>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {view === "equipo"
                ? "Carga por equipo (solo lectura) — la asignación se hace en vista Operarios"
                : "Gantt de tareas por operario — L–V 8:00–20:00 (almuerzo 12:30–13:30)"}
            </div>
          </div>
          <Space wrap>
            {(() => {
              // Badge de estado de guardado. Tres estados:
              //   - savingCount > 0 → "Guardando…" (loading)
              //   - lastSaveError → "Error" (rojo)
              //   - savedFlash → "Guardado" (verde, pulse breve)
              //   - idle → "Sincronizado" (verde sutil)
              if (savingCount > 0) {
                return <Tag icon={<LoadingOutlined />} color="processing" style={{ fontWeight: 500 }}>Guardando…</Tag>;
              }
              if (lastSaveError) {
                return <Tag icon={<CloseCircleFilled />} color="error" style={{ fontWeight: 500 }}>Error: {lastSaveError}</Tag>;
              }
              if (savedFlash) {
                return <Tag icon={<CheckCircleFilled />} color="success" style={{ fontWeight: 500 }}>Guardado ✓</Tag>;
              }
              return <Tag icon={<CheckCircleFilled />} color="default" style={{ fontWeight: 400, color: brand.textSecondary }}>Sincronizado</Tag>;
            })()}
            {view === "equipo" || vistaTiempo !== "plan" ? (
              <Tag icon={<EyeOutlined />} color="default" style={{ fontWeight: 500 }}>Solo visualización</Tag>
            ) : (
              <Button
                type={editMode ? "default" : "primary"}
                danger={editMode}
                onClick={toggleEditMode}
                disabled={!editMode && !lock.canEdit}
                title={!lock.canEdit && lock.lockedBy ? `Editando: ${lock.lockedBy}` : undefined}
              >
                {editMode ? "Salir de edición" : "Modo edición"}
              </Button>
            )}
            {/* Estado de envío + "Enviar semana" (todos los operarios de una).
                El envío congela la foto del plan = semana planificada. */}
            {view === "operario" && vistaTiempo === "plan" && (() => {
              const agendadas = allRows.filter((r) => perteneceASemana(r) && !!r.fecha_inicio && splitTecnicos(r.tecnico).length > 0);
              const pendientes = agendadas.filter((r) => !r.publicado);
              if (agendadas.length === 0) return null;
              const estadoEnvio = pendientes.length === 0 ? "enviada" : pendientes.length < agendadas.length ? "parcial" : "borrador";
              return (
                <>
                  <Tag
                    icon={<PushpinOutlined />}
                    color={estadoEnvio === "enviada" ? "success" : estadoEnvio === "parcial" ? "warning" : "default"}
                    style={{ fontWeight: 500 }}
                  >
                    {estadoEnvio === "enviada" ? "Semana enviada" : estadoEnvio === "parcial" ? "Envío parcial" : "Sin enviar"}
                  </Tag>
                  {pendientes.length > 0 && (
                    <Popconfirm
                      title={`Enviar semana ${semanaActual}`}
                      description={(
                        <div style={{ maxWidth: 320 }}>
                          Se congela la <strong>semana planificada</strong> (foto del plan) de{" "}
                          <strong>{pendientes.length}</strong> tarea(s) agendada(s) de{" "}
                          <strong>{new Set(pendientes.flatMap((r) => splitTecnicos(r.tecnico))).size}</strong> operario(s).
                          Las del pool (sin fecha) quedan en borrador. Después de enviar, los cambios de la semana cuentan como semana real.
                          {estadoEnvio === "parcial" && (
                            <div style={{ marginTop: 6 }}>
                              Las tareas que ya tienen foto NO se re-fotografían: esto solo congela las pendientes
                              (sirve como <strong>publicar todo</strong> después de editar a varios operarios).
                            </div>
                          )}
                        </div>
                      )}
                      okText="Enviar"
                      cancelText="Cancelar"
                      onConfirm={enviarSemanaCompleta}
                      disabled={!editMode}
                    >
                      <Button
                        type="primary"
                        icon={<PushpinOutlined />}
                        disabled={!editMode}
                        title={!editMode ? "Activá Modo Edición para enviar la semana" : undefined}
                      >
                        Enviar semana ({pendientes.length})
                      </Button>
                    </Popconfirm>
                  )}
                  {/* Re-enviar = rehacer la FOTO con el plan actual (rebasar). Para
                      cuando se envió por error. Pisa la semana planificada anterior. */}
                  {agendadas.length > pendientes.length && (
                    <Popconfirm
                      title="Re-enviar: rehacer la foto del plan"
                      description={(
                        <div style={{ maxWidth: 330 }}>
                          La <strong>semana planificada</strong> pasa a ser EXACTAMENTE el plan actual
                          ({agendadas.length} tarea(s)). La foto anterior se pierde y la comparativa
                          plan vs real de esta semana se resetea. Usalo solo si se envió por error.
                        </div>
                      )}
                      okText="Rehacer foto"
                      okButtonProps={{ danger: true }}
                      cancelText="Cancelar"
                      onConfirm={reenviarSemanaCompleta}
                      disabled={!editMode}
                    >
                      <Button
                        disabled={!editMode}
                        title={!editMode ? "Activá Modo Edición para re-enviar" : "Por si se envió por error: vuelve a congelar la semana planificada con el plan actual"}
                      >
                        Re-enviar
                      </Button>
                    </Popconfirm>
                  )}
                </>
              );
            })()}
            <Button shape="circle" icon={<LeftOutlined />} onClick={() => setLunes((m) => m.subtract(1, "week"))} />
            <DatePicker
              value={lunes}
              picker="week"
              format={(v) => `Week ${v.isoWeek()}, ${v.isoWeekYear()}`}
              onChange={(d) => d && setLunes(d.startOf("isoWeek"))}
              style={{ minWidth: 160 }}
              suffixIcon={<CalendarOutlined />}
              allowClear={false}
            />
            <Button shape="circle" icon={<RightOutlined />} onClick={() => setLunes((m) => m.add(1, "week"))} />
            <Button icon={<AimOutlined />} onClick={() => setLunes(dayjs().startOf("isoWeek"))}>Hoy</Button>
            <Segmented
              value={view}
              onChange={(v) => {
                const nuevo = v as "equipo" | "operario";
                setView(nuevo);
                // Limpiar el filtro opuesto al cambiar de vista (no tiene sentido mantenerlo aplicado).
                if (nuevo === "equipo") {
                  setFiltroOperarios([]);
                  // Equipos es solo lectura: si veníamos editando, salimos y
                  // soltamos el lock (no hay nada para editar acá).
                  if (editMode) { setEditMode(false); void lock.release(); }
                } else {
                  setFiltroEquipos([]);
                }
              }}
              options={[
                { value: "operario", icon: <UserOutlined />, label: "Operarios" },
                { value: "equipo", icon: <ToolOutlined />, label: "Equipos" },
              ]}
            />
            <Tooltip title={
              vistaTiempo === "enviado"
                ? "Semana planificada: la foto del plan congelada al Enviar la semana. Solo lectura."
                : "Semana real: el plan vivo con los cambios de la semana (editable). La ejecución de cada tarea iniciada se ve como barra bajo el bloque."
            }>
              <Segmented
                value={vistaTiempo}
                onChange={(v) => {
                  const nuevo = v as "enviado" | "plan";
                  setVistaTiempo(nuevo);
                  // La semana planificada es solo lectura: si veníamos editando,
                  // salimos y soltamos el lock.
                  if (nuevo !== "plan" && editMode) { setEditMode(false); void lock.release(); }
                }}
                options={[
                  { value: "enviado", icon: <PushpinOutlined />, label: "Semana planificada" },
                  { value: "plan", icon: <CalendarOutlined />, label: "Semana real" },
                ]}
              />
            </Tooltip>
            <Button icon={<UnorderedListOutlined />} onClick={() => router.push("/operaciones/planificacion")}>Planificación</Button>
            <Tooltip title="¿Cómo funciona este tablero?">
              <Button shape="circle" icon={<QuestionCircleOutlined />} onClick={() => setAyudaOpen(true)} />
            </Tooltip>
            <Button icon={<RollbackOutlined />} onClick={() => router.back()}>Volver</Button>
          </Space>
        </div>
      </Card>

      {/* Stats cards */}
      <div className="psg-stats">
        <StatCard label="Tareas programadas" value={stats.total} color={brand.navy} />
        <StatCard label="Con fecha asignada" value={stats.conFecha} color={brand.success} />
        <StatCard label="Sin fecha" value={stats.sinFecha} color={brand.warning} />
        {stats.conflictos > 0 ? (
          <Popover
            trigger="click"
            placement="bottom"
            title={<span><WarningFilled style={{ color: brand.error, marginRight: 6 }} />Conflictos de horario</span>}
            content={
              <div style={{ maxWidth: 340, maxHeight: 300, overflowY: "auto" }}>
                {rows.filter((r) => conflictos.has(r.id)).map((r) => (
                  <div key={r.id} onClick={() => setSelectedTask(r)}
                    style={{ cursor: "pointer", padding: "5px 4px", borderBottom: `1px solid ${brand.border}`, fontSize: 12 }}>
                    <strong>OT-{r.orden_trabajo?.ot ?? r.ot_id}</strong> · {r.componente} — {r.descripcion}
                    <div style={{ fontSize: 11, color: brand.textSecondary }}>{r.tecnico ?? r.maquina ?? "—"}</div>
                  </div>
                ))}
              </div>
            }
          >
            <div style={{ cursor: "pointer" }}><StatCard label="Conflictos" value={stats.conflictos} color={brand.error} /></div>
          </Popover>
        ) : (
          <StatCard label="Conflictos" value={stats.conflictos} color={brand.error} />
        )}
        <StatCard label="Sin semana asignada" value={stats.sinSemana} color={brand.textSecondary} />
      </div>

      {/* Toolbar */}
      <Card size="small" styles={{ body: { padding: "8px 16px" } }} style={{ marginBottom: 8 }}>
        {/* Fila de filtros */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <FilterOutlined style={{ color: brand.textSecondary }} />
          <span style={{ fontSize: 12, color: brand.textSecondary, fontWeight: 500 }}>Filtros:</span>
          <Tooltip title={view === "operario" ? "El filtro de máquinas está deshabilitado mientras la vista es por operario." : ""}>
            <Select
              mode="multiple"
              allowClear
              placeholder="Máquinas (todas)"
              value={filtroEquipos}
              onChange={setFiltroEquipos}
              options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion ?? ""}`.trim() }))}
              optionFilterProp="label"
              maxTagCount="responsive"
              size="small"
              disabled={view === "operario"}
              style={{ minWidth: 220, maxWidth: 380 }}
              suffixIcon={<ToolOutlined />}
            />
          </Tooltip>
          <Tooltip title={view === "equipo" ? "El filtro de operarios está deshabilitado mientras la vista es por equipo." : ""}>
            <Select
              mode="multiple"
              allowClear
              placeholder="Operarios (todos)"
              value={filtroOperarios}
              onChange={setFiltroOperarios}
              options={trabajadores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.area}` }))}
              optionFilterProp="label"
              maxTagCount="responsive"
              size="small"
              disabled={view === "equipo"}
              style={{ minWidth: 220, maxWidth: 380 }}
              suffixIcon={<UserOutlined />}
            />
          </Tooltip>
          {(filtroEquipos.length > 0 || filtroOperarios.length > 0) && (
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={() => { setFiltroEquipos([]); setFiltroOperarios([]); }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Space>
            {selectedIds.size > 0 && (
              <Tag color={brand.cyan} style={{ fontWeight: 600 }}>
                {selectedIds.size} seleccionada{selectedIds.size > 1 ? "s" : ""}
                <a onClick={clearSelection} style={{ marginLeft: 8, color: brand.white, textDecoration: "underline" }}>limpiar</a>
              </Tag>
            )}
            <span style={{ fontSize: 11, color: brand.textSecondary }}>
              <strong>Atajos:</strong> Shift+Click selecciona · Ctrl+Wheel zoom · Drag para mover · Borde derecho para resize · ESC cancela
            </span>
          </Space>
          <Space size="middle">
            <Popover
              trigger="click"
              placement="bottomRight"
              title={<span><BgColorsOutlined style={{ marginRight: 6 }} />Leyenda de colores</span>}
              content={
                <div style={{ minWidth: 260, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>Estado de la tarea</div>
                  {estadosCat.length === 0 ? (
                    <div style={{ color: brand.textSecondary, fontSize: 11, marginBottom: 8 }}>
                      Sin estados cargados. Definí colores en Catálogos → statusTarea.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                      {estadosCat.map((e) => (
                        <div key={e.codigo} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            display: "inline-block", minWidth: 90, textAlign: "center",
                            padding: "1px 8px", borderRadius: 4,
                            background: colorBloque(e.codigo, e.color), color: brand.white,
                            fontSize: 11, fontWeight: 600,
                            opacity: e.codigo === "cancelado" ? 0.5 : 1,
                          }}>
                            {e.nombre}
                          </span>
                          <span style={{ color: brand.textSecondary, fontSize: 11 }}>{e.codigo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Divider style={{ margin: "8px 0" }} />
                  <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>Carga por recurso (%)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 18, height: 12, background: "#52C41A", borderRadius: 2 }} />
                      <span>≤ 70% — Holgura</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 18, height: 12, background: "#1677FF", borderRadius: 2 }} />
                      <span>71% – 90% — Carga normal</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 18, height: 12, background: "#FA8C16", borderRadius: 2 }} />
                      <span>91% – 100% — Cerca del tope</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 18, height: 12, background: "#F5222D", borderRadius: 2 }} />
                      <span>&gt; 100% — Sobrecarga</span>
                    </div>
                  </div>
                  <Divider style={{ margin: "8px 0" }} />
                  <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>Otros</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-block",
                        width: 22, height: 14,
                        borderRadius: 3,
                        background: "#8c8c8c",
                        backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 4px, transparent 4px 8px)",
                        boxShadow: "inset 0 0 0 2px #FAAD14",
                      }} />
                      <span>🤝 Trabajo derivado a tercero (servicio externo)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <WarningFilled style={{ color: brand.error, fontSize: 13 }} />
                      <span>Conflicto de horarios entre tareas</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ display: "inline-block", width: 18, height: 12, border: `2px dashed ${brand.cyan}`, borderRadius: 2 }} />
                      <span>Tarea seleccionada (Shift+Click)</span>
                    </div>
                  </div>
                </div>
              }
            >
              <Button size="small" icon={<BgColorsOutlined />}>Leyenda</Button>
            </Popover>
            <Button size="small" icon={<PrinterOutlined />} onClick={() => setPrintModalOpen(true)}>Imprimir</Button>
            <span style={{ fontSize: 12, color: brand.textSecondary }}>
              <ZoomOutOutlined /> Zoom
            </span>
            <Slider
              min={HOUR_PX_MIN}
              max={HOUR_PX_MAX}
              step={4}
              value={hourPx}
              onChange={(v) => setHourPx(v as number)}
              style={{ width: 140 }}
              tooltip={{ formatter: (v) => `${Math.round((v! / HOUR_PX_DEFAULT) * 100)}%` }}
            />
            <ZoomInOutlined style={{ color: brand.textSecondary }} />
            <Button size="small" onClick={() => setHourPx(HOUR_PX_DEFAULT)}>100%</Button>
          </Space>
        </div>
      </Card>

      {/* Leyenda de estados SIEMPRE visible (coincide con el color de los bloques) */}
      {estadosCat.length > 0 && (
        <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: "5px 12px" } }}>
          <Space wrap size={12}>
            <span style={{ fontSize: 11, fontWeight: 600, color: brand.textSecondary }}>Leyenda:</span>
            {estadosCat.map((e) => (
              <span key={e.codigo} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <span style={{ display: "inline-block", width: 16, height: 12, borderRadius: 2, background: colorBloque(e.codigo, e.color), opacity: e.codigo === "cancelado" ? 0.5 : 1 }} />
                {e.nombre}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ display: "inline-block", width: 16, height: 12, borderRadius: 2, background: "#8c8c8c", backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 6px)", boxShadow: `inset 0 0 0 1px ${brand.warning}` }} />
              🤝 Tercero
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <WarningFilled style={{ color: brand.error, fontSize: 12 }} /> Conflicto
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              ⏱ Iniciada: el bloque arranca en su inicio real y reserva la duración planificada; al terminar se ajusta a lo que duró
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ display: "inline-block", width: 16, height: 6, borderRadius: 3, background: "#13C2C2", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }} />
              En Semana planificada: barrita = ejecución real sobre la foto
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              🗒 Nota del técnico (texto en el tooltip / detalle)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ fontWeight: 800 }}>↷</span> Distinto al enviado
              <span style={{ fontWeight: 800, marginLeft: 6 }}>＋</span> Fuera del plan enviado
            </span>
          </Space>
        </Card>
      )}

      {/* Banner de modo edición (otros usuarios no pueden editar mientras tanto) */}
      {editMode && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message="Estás en modo edición — los demás solo pueden visualizar hasta que salgas."
          action={<Button size="small" danger onClick={toggleEditMode}>Salir de edición</Button>}
        />
      )}

      {/* Gantt */}
      <Card styles={{ body: { padding: 0 } }} style={{ overflow: "hidden" }}>
        {cargando && rows.length === 0 && allRows.length === 0 ? (
          <Skeleton active title={false} paragraph={{ rows: 8 }} style={{ padding: 24 }} />
        ) : (
        <div
          className="psg-gantt-wrap"
          ref={timelineRef}
          style={{ position: "relative", cursor: panning ? "grabbing" : "grab" }}
          onMouseDown={startPan}
        >
          {/* Header */}
          <div className="psg-row psg-header-row">
            <div className="psg-resource-cell">Recurso</div>
            <div className="psg-timeline-header">
              {days.map((d, i) => {
                const esHoy = d.isSame(dayjs(), "day");
                return (
                <div key={i} className={`psg-day-header${esHoy ? " psg-day-today" : ""}`} style={{ width: dayPx, minWidth: dayPx }}>
                  <div className="psg-day-label">{diaEs(d)}{esHoy ? " · HOY" : ""}</div>
                  <div className="psg-hour-row" style={{ position: "relative" }}>
                    {Array.from({ length: HORAS_DIA }, (_, h) => {
                      const hour = JORNADA_INICIO + h;
                      return (
                        <div
                          key={h}
                          className="psg-hour-cell"
                          style={{ width: hourPx, minWidth: hourPx }}
                        >
                          {hourPx >= 40 ? `${String(hour).padStart(2, "0")}:00` : String(hour).padStart(2, "0")}
                        </div>
                      );
                    })}
                    {/* Banda de almuerzo (12:30 - 13:30) — posicionada con precisión de media hora */}
                    <div
                      className="psg-hour-lunch-band"
                      style={{
                        left: (ALMUERZO_INI - JORNADA_INICIO) * hourPx,
                        width: (ALMUERZO_FIN - ALMUERZO_INI) * hourPx,
                      }}
                    />
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Filas de recursos + línea de "ahora". El wrapper relativo (zIndex 0:
              queda DEBAJO del header sticky al scrollear) hace que la línea mida
              la altura REAL de las filas con top/bottom 0 — antes se calculaba
              recursos × 64px y se quedaba corta cuando las filas crecían (el pie
              de carga + Enviar/Reabrir las estira más que ROW_HEIGHT). */}
          <div style={{ position: "relative", zIndex: 0, width: "max-content", minWidth: "100%" }}>
          {lineaHoy != null && (
            <div className="psg-now-line" style={{ left: 220 + lineaHoy }} title={`Ahora: ${diaEs(ahoraTick ?? dayjs(), true)}`}>
              <div className="psg-now-dot" />
            </div>
          )}
          {recursos.length === 0 ? (
            <div style={{ padding: 40 }}>
              <Empty description="Sin recursos disponibles." />
            </div>
          ) : (
            recursos.map((res) => {
              const tasks = tareasPorRecurso.get(res.key) ?? [];
              return (
                <div key={res.key} className="psg-row">
                  <div className="psg-resource-cell">
                    <div className="psg-res-name">
                      <SettingOutlined style={{ color: brand.cyan, marginRight: 6, flexShrink: 0, marginTop: 2 }} />
                      <span className="psg-res-label">{res.label}</span>
                    </div>
                    {(() => {
                      const carga = cargaPorRecurso.get(res.key) ?? 0;
                      const pct = (carga / CAPACIDAD_SEMANA) * 100;
                      const pctClamp = Math.min(100, pct);
                      const barColor = pct > 100 ? "#F5222D" : pct > 90 ? "#FA8C16" : pct > 70 ? "#1677FF" : "#52C41A";
                      return (
                        <div className="psg-load-row" title={`${carga.toFixed(1)}h planificadas de ${CAPACIDAD_SEMANA}h disponibles`}>
                          <div className="psg-load-bar">
                            <div className="psg-load-fill" style={{ width: `${pctClamp}%`, background: barColor }} />
                          </div>
                          <span className="psg-load-text" style={{ color: barColor }}>
                            {carga.toFixed(1)}/{CAPACIDAD_SEMANA}h
                          </span>
                        </div>
                      );
                    })()}
                    {/* Publicar / reabrir la semana de este operario (planner). */}
                    {view === "operario" && tasks.length > 0 && (() => {
                      // Solo cuentan las tareas que PERTENECEN a esta semana, no las
                      // que se desbordan desde otra (mismo criterio que publicarSemana).
                      // Si no, una tarea spillover sin publicar dejaba `pub` en false
                      // para siempre y "Reabrir" nunca aparecía.
                      const tasksSemana = tasks.filter(perteneceASemana);
                      if (tasksSemana.length === 0) return null;
                      // Estado mixto: parte publicado / parte borrador (p.ej. se
                      // publicó la semana y luego se agregaron tareas, o una quedó
                      // publicada suelta). Antes el toggle era todo-o-nada y solo
                      // ofrecía "Reabrir" si TODAS estaban publicadas; en mezcla
                      // mostraba "Publicar" y dejaba trabada la tarea publicada (no
                      // se podía reabrir ni sacar). Ahora: si hay alguna publicada
                      // siempre se puede "Reabrir", y en mezcla se ofrecen ambas.
                      const todasPub = tasksSemana.every((t) => t.publicado);
                      const algunaPub = tasksSemana.some((t) => t.publicado);
                      const mixta = algunaPub && !todasPub;
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <Tag color={todasPub ? "success" : mixta ? "warning" : "default"} style={{ fontSize: 9, margin: 0, lineHeight: "14px" }}>
                            {todasPub ? "Enviada" : mixta ? "Parcial" : "Borrador"}
                          </Tag>
                          {editMode && (
                            <>
                              {!todasPub && (
                                <a style={{ fontSize: 10 }} onClick={() => publicarSemana(res.key, true)}>
                                  Enviar
                                </a>
                              )}
                              {algunaPub && (
                                <a style={{ fontSize: 10 }} onClick={() => publicarSemana(res.key, false)}>
                                  Reabrir
                                </a>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div
                    ref={(el) => registerStrip(res.key, el)}
                    className={`psg-row-strip ${drag?.targetRow === res.key ? (dragConflict ? "psg-row-target-conflict" : "psg-row-target") : ""}`}
                    style={{ width: dayPx * 5, height: ROW_HEIGHT }}
                  >
                    {/* Drop preview: rectángulo en la posición exacta donde caerá el bloque */}
                    {drag && drag.targetRow === res.key && drag.snappedDate && (() => {
                      const t = rows.find((r) => r.id === drag.taskId) ?? allRows.find((r) => r.id === drag.taskId);
                      if (!t) return null;
                      const dur = Number(t.horas_estimadas ?? 1);
                      const qty = Math.max(1, Number(t.qty_personal ?? 1));
                      // El preview debe mostrar dónde realmente caerá: HE = reloj
                      // continuo; normal = normalizado a la jornada (sin almuerzo).
                      const previewHE = (drag.snappedDate.hour() + drag.snappedDate.minute() / 60) >= 18;
                      const previewIni = previewHE ? drag.snappedDate : dayjs(normalizarAInicioHabil(drag.snappedDate.toDate()));
                      const previewFin = dayjs(calcularFin(previewIni.toDate(), dur * qty, previewHE));
                      const dIdx = previewIni.diff(lunes, "day");
                      if (dIdx < 0 || dIdx > 4) return null;
                      const startPx = dIdx * dayPx + (hourDecimal(previewIni) - JORNADA_INICIO) * hourPx;
                      const endPx = previewFin.diff(lunes, "day") * dayPx + (hourDecimal(previewFin) - JORNADA_INICIO) * hourPx;
                      const width = Math.max(40, endPx - startPx);
                      return (
                        <>
                          <div
                            className={`psg-drop-preview ${dragConflict ? "psg-drop-preview-conflict" : ""}`}
                            style={{ left: startPx, width, top: 6, height: ROW_HEIGHT - 12 }}
                          >
                            <span className="psg-drop-preview-label">
                              {previewIni.format("HH:mm")} → {previewFin.format("HH:mm")}
                            </span>
                          </div>
                          <div
                            className={`psg-drop-line ${dragConflict ? "psg-drop-line-conflict" : ""}`}
                            style={{ left: startPx }}
                          />
                        </>
                      );
                    })()}
                    {/* Días + slots */}
                    {days.map((_, dIdx) => (
                      <div key={dIdx} className="psg-day-bg" style={{ left: dIdx * dayPx, width: dayPx }}>
                        {Array.from({ length: HORAS_DIA }, (_, h) => (
                          <div key={h} className="psg-slot" style={{ width: hourPx, minWidth: hourPx }} />
                        ))}
                        {/* Banda de almuerzo (12:30 - 13:30) */}
                        <div
                          className="psg-slot-lunch-band"
                          style={{
                            left: (ALMUERZO_INI - JORNADA_INICIO) * hourPx,
                            width: (ALMUERZO_FIN - ALMUERZO_INI) * hourPx,
                          }}
                        />
                      </div>
                    ))}
                    {/* Bloques */}
                    {tasks.map((t) => renderTaskBlock(t, res.key))}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
        )}
      </Card>

      {/* Pools de pendientes: ocultos en la vista Enviado (es una foto congelada,
          no hay nada que programar sobre ella). */}
      {!enviadoMode && (<>
      {/* Buscador del pool de pendientes (parte / cilindro / OT / descripción). */}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Input
          allowClear
          value={poolBusqueda}
          onChange={(e) => setPoolBusqueda(e.target.value)}
          placeholder="Buscar pendientes por parte, cilindro, OT o descripción…"
          prefix={<SearchOutlined style={{ color: brand.textSecondary }} />}
          style={{ maxWidth: 420 }}
          size="small"
        />
        {poolBusqueda.trim() && (
          <span style={{ fontSize: 12, color: brand.textSecondary }}>
            {sinFechaMostrar.length + sinSemanaMostrar.length} pendiente(s) coinciden
          </span>
        )}
      </div>

      {/* Switch: por defecto el filtro de arriba aplica a los pendientes; con
          esto se ignora solo abajo (p.ej. ver todo el backlog para asignarlo). */}
      {hayFiltro && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Switch size="small" checked={verTodasPendientes} onChange={setVerTodasPendientes} />
          <span style={{ fontSize: 12, color: brand.textSecondary }}>
            Ver todas las pendientes de abajo (ignorar el filtro de {view === "equipo" ? "equipo" : "operario"})
          </span>
        </div>
      )}

      {/* Panel: tareas de ESTA semana sin fecha estimada */}
      <Collapse
        defaultActiveKey={sinFechaMostrar.length > 0 ? ["semsf"] : []}
        style={{ marginTop: 12 }}
        items={[{
          key: "semsf",
          label: (
            <span>
              <CalendarOutlined /> <strong>Tareas de la semana {semanaActual} sin fecha asignada</strong>
              <Tag color={sinFechaMostrar.length > 0 ? "processing" : "default"} style={{ marginLeft: 8 }}>
                {sinFechaMostrar.length}
              </Tag>
            </span>
          ),
          children: sinFechaMostrar.length === 0 ? (
            <Empty description={filtrarPendientes ? "Sin tareas que coincidan con el filtro." : "Todas las tareas de esta semana ya tienen fecha asignada."} />
          ) : (
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 8 }}>
              Estas tareas tienen semana asignada pero no fecha. Arrastrálas sobre una fila del Gantt para fijarles inicio.
              Las que no tengan duración se colocarán como <strong>1h por defecto</strong> (después podés redimensionarlas con el borde derecho del bloque).
            </div>
          ),
        }]}
      />
      {sinFechaMostrar.length > 0 && (
        <div className="psg-pool">
          {sinFechaMostrar.map((t) => renderPoolCard(t, true))}
        </div>
      )}

      {/* Panel inferior: tareas sin semana asignada */}
      <Collapse
        defaultActiveKey={["sin"]}
        style={{ marginTop: 12 }}
        items={[{
          key: "sin",
          label: (
            <span>
              <UnorderedListOutlined /> <strong>Tareas sin semana asignada</strong>
              <Tag color="warning" style={{ marginLeft: 8 }}>{sinSemanaMostrar.length}</Tag>
            </span>
          ),
          children: sinSemanaMostrar.length === 0 ? (
            <Empty description={filtrarPendientes ? "Sin tareas que coincidan con el filtro." : "No hay tareas pendientes de programar."} />
          ) : (
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 8 }}>
              Arrastrá una tarjeta y soltala sobre una fila del Gantt para asignarla a un recurso y horario.
            </div>
          ),
        }]}
      />
      {sinSemanaMostrar.length > 0 && (
        <div className="psg-pool">
          {sinSemanaMostrar.map((t) => renderPoolCard(t, false))}
        </div>
      )}
      </>)}

      {/* Ghost del drag (sigue al cursor) */}
      {drag && (
        <>
          <div
            className="psg-drag-ghost"
            style={{
              position: "fixed",
              left: drag.cursorX - drag.grabOffsetX,
              top: drag.cursorY - 20,
              width: drag.blockWidth,
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            <div className="psg-drag-ghost-block" data-color={(() => {
              const t = rows.find((r) => r.id === drag.taskId) ?? allRows.find((r) => r.id === drag.taskId);
              return estadoColor(t?.estado ?? null);
            })()}>
              {(() => {
                const t = rows.find((r) => r.id === drag.taskId) ?? allRows.find((r) => r.id === drag.taskId);
                return (
                  <>
                    <div className="psg-task-title">OT-{t?.orden_trabajo?.ot ?? t?.ot_id}</div>
                    <div className="psg-task-sub">{t?.componente} — {t?.descripcion}</div>
                    {t?.comentario && <div className="psg-task-cmt">💬 {t.comentario}</div>}
                  </>
                );
              })()}
            </div>
          </div>
          {/* Tooltip con la hora destino */}
          {drag.snappedDate && drag.targetRow && (
            <div
              className={`psg-drag-tooltip ${dragConflict ? "psg-drag-tooltip-conflict" : ""}`}
              style={{
                position: "fixed",
                left: drag.cursorX + 14,
                top: drag.cursorY + 14,
                pointerEvents: "none",
                zIndex: 1001,
              }}
            >
              <div><strong>{diaEs(drag.snappedDate)}</strong></div>
              <div>{drag.snappedDate.format("HH:mm")}</div>
              <div style={{ fontSize: 10, opacity: 0.85 }}>→ {drag.targetRow}</div>
              {dragConflict && <div style={{ fontSize: 10, marginTop: 4, fontWeight: 700 }}>⚠ Conflicto</div>}
            </div>
          )}
        </>
      )}

      {/* Modal de impresión */}
      <Modal
        title="Imprimir programación"
        open={printModalOpen}
        onCancel={() => { setPrintModalOpen(false); setPrintDayIdx(null); }}
        onOk={() => {
          setPrintModalOpen(false);
          document.body.classList.add("psg-printing");
          if (printDayIdx != null) {
            document.body.dataset.printDay = String(printDayIdx);
            // Hace scroll a ese día para que sea lo primero visible
            const wrap = timelineRef.current;
            if (wrap) wrap.scrollLeft = printDayIdx * dayPx;
          } else {
            delete document.body.dataset.printDay;
          }
          setTimeout(() => {
            window.print();
            document.body.classList.remove("psg-printing");
            delete document.body.dataset.printDay;
            setPrintDayIdx(null);
          }, 200);
        }}
        okText="Imprimir"
        cancelText="Cancelar"
        width={modalWidth(screens, 520)}
      >
        <div style={{ marginBottom: 12 }}>¿Qué querés imprimir?</div>
        <Segmented
          block
          value={printDayIdx == null ? "semana" : `dia${printDayIdx}`}
          onChange={(v) => {
            if (v === "semana") setPrintDayIdx(null);
            else setPrintDayIdx(Number(String(v).replace("dia", "")));
          }}
          options={[
            { value: "semana", label: "Semana completa" },
            ...days.map((d, i) => ({ value: `dia${i}`, label: diaEs(d) })),
          ]}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          title="Recomendación"
          description={<>En el diálogo del navegador elegí <strong>horizontal (landscape)</strong> y <strong>A4</strong>. Si imprimís un día, en la opción &quot;más ajustes&quot; del navegador podés ajustar el zoom para que ese día ocupe la página entera.</>}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: brand.textSecondary }}>
          Total filas: <strong>{recursos.length}</strong> · Tareas: <strong>{rows.length}</strong>
        </div>
      </Modal>

      {/* Modal detalle */}
      <Modal
        title="Detalle de tarea"
        open={!!selectedTask}
        onCancel={() => setSelectedTask(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedTask(null)}>Cerrar</Button>,
          selectedTask?.fecha_inicio ? (
            <Popconfirm
              key="remove"
              title="Sacar tarea de la semana"
              description="La tarea vuelve al pool sin fecha asignada. Se puede reprogramar después."
              okText="Sacar"
              cancelText="Cancelar"
              okButtonProps={{ danger: true }}
              onConfirm={() => selectedTask && persistRemoveFromWeek(selectedTask.id)}
            >
              <Button danger disabled={!editMode || !!selectedTask?.publicado || haEmpezado(selectedTask?.estado)}>Sacar de la semana</Button>
            </Popconfirm>
          ) : null,
          <Button key="plan" type="primary" onClick={() => router.push("/operaciones/planificacion")}>
            Editar en Planificación
          </Button>,
        ]}
        width={modalWidth(screens, 680)}
      >
        {selectedTask && (() => {
          // operario/equipo/prioridad: solo para tareas NO iniciadas.
          const editable = editMode && !selectedTask.publicado && !haEmpezado(selectedTask.estado);
          // duración: editable aunque la tarea esté en curso; solo se bloquea si
          // está realizada o la semana publicada (igual que lo permite el backend).
          const editableDur = editMode && !selectedTask.publicado && selectedTask.estado !== "realizado";
          // REGULARIZACIÓN de la ejecución real (técnico que marcó tarde, olvidó
          // el cronómetro o trabajó sin sistema — "empecé 16:30, actualizar en
          // la programación"): el planner corrige inicio/fin/horas reales acá,
          // sin tickets. Solo tareas con ejecución; el fin y la duración solo
          // cuando ya está realizada (en curso las maneja el técnico).
          const regularizable = editMode && haEmpezado(selectedTask.estado) && !!selectedTask.fecha_inicio_real;
          const regularizableFin = regularizable && selectedTask.estado === "realizado";
          const operarios = splitRecursos(selectedTask.tecnico);
          const equiposSel = splitRecursos(selectedTask.maquina);
          return (
          <>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="OT">{selectedTask.orden_trabajo?.ot ?? `#${selectedTask.ot_id}`}</Descriptions.Item>
            <Descriptions.Item label="Cliente">{selectedTask.orden_trabajo?.cliente?.nombre_comercial ?? selectedTask.orden_trabajo?.cliente?.razon_social ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Flota">
              {selectedTask.orden_trabajo?.codigo_reparacion?.flota
                ? `${selectedTask.orden_trabajo.codigo_reparacion.flota.codigo} — ${selectedTask.orden_trabajo.codigo_reparacion.flota.nombre}`
                : selectedTask.orden_trabajo?.cod_rep_flota ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Descripción OT">{selectedTask.orden_trabajo?.descripcion ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="N/P">{selectedTask.orden_trabajo?.np ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Prioridad OT">
              {selectedTask.orden_trabajo?.prioridad_atencion
                ? <Tag color={prioridadColor(selectedTask.orden_trabajo.prioridad_atencion.nivel)}>{selectedTask.orden_trabajo.prioridad_atencion.nombre}</Tag>
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Tarea">{selectedTask.operacion_codigo} — {selectedTask.descripcion}</Descriptions.Item>
            <Descriptions.Item label="Parte">{selectedTask.componente}</Descriptions.Item>
            <Descriptions.Item label="Operario">
              {editable ? (
                <Select mode="multiple" size="small" style={{ width: "100%" }} placeholder="Sin asignar"
                  value={operarios}
                  onChange={(vals) => detalleEditarOperario(vals as string[])}
                  options={trabajadores.map((t) => ({ value: t.nombre, label: t.nombre }))}
                  optionFilterProp="label" maxTagCount="responsive" />
              ) : (selectedTask.tecnico ?? "-")}
            </Descriptions.Item>
            <Descriptions.Item label="Equipo">
              {editable ? (
                <Select mode="multiple" size="small" style={{ width: "100%" }} placeholder="Sin asignar"
                  value={equiposSel}
                  onChange={(vals) => detalleEditarEquipo(vals as string[])}
                  options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion ?? ""}` }))}
                  optionFilterProp="label" maxTagCount="responsive" />
              ) : (selectedTask.maquina ?? "-")}
            </Descriptions.Item>
            <Descriptions.Item label="Prioridad">
              {editable ? (
                <Select size="small" style={{ width: 180 }}
                  value={selectedTask.es_correctivo ? "correctiva" : "normal"}
                  onChange={(v) => detalleCambiarPrioridad(v === "correctiva")}
                  options={[{ value: "normal", label: "Normal" }, { value: "correctiva", label: "🚨 Correctiva (emergencia)" }]} />
              ) : (selectedTask.es_correctivo ? <Tag color="error">🚨 Correctiva</Tag> : "Normal")}
            </Descriptions.Item>
            <Descriptions.Item label="Inicio">{selectedTask.fecha_inicio ? dayjs(selectedTask.fecha_inicio).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
            <Descriptions.Item label="Fin">{selectedTask.fecha_fin ? dayjs(selectedTask.fecha_fin).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
            <Descriptions.Item label="Duración">
              {editableDur ? (
                <Space>
                  <InputNumber size="small" min={0.25} step={0.5} style={{ width: 90 }}
                    value={durModal}
                    onChange={(v) => setDurModal(v == null ? null : Number(v))}
                    onBlur={() => { if (durModal != null && Number(durModal) !== Number(selectedTask.horas_estimadas ?? 0)) detalleEditarDuracion(durModal); }}
                    onPressEnter={() => { if (durModal != null) detalleEditarDuracion(durModal); }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>h/persona · Qty {selectedTask.qty_personal ?? 1}</Typography.Text>
                </Space>
              ) : `${Number(selectedTask.horas_estimadas ?? 0).toFixed(1)}h · Qty ${selectedTask.qty_personal ?? 1}`}
            </Descriptions.Item>
            <Descriptions.Item label="Inicio real">
              {regularizable ? (
                <DatePicker
                  size="small"
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YY HH:mm"
                  allowClear={false}
                  value={selectedTask.fecha_inicio_real ? dayjs(selectedTask.fecha_inicio_real) : null}
                  onChange={(d) => d && guardarCampoDetalle({ fecha_inicio_real: d.toISOString() }, "Inicio real corregido")}
                />
              ) : (selectedTask.fecha_inicio_real ? dayjs(selectedTask.fecha_inicio_real).format("DD/MM/YY HH:mm") : "—")}
            </Descriptions.Item>
            <Descriptions.Item label="Fin real">
              {regularizableFin ? (
                <DatePicker
                  size="small"
                  showTime={{ format: "HH:mm" }}
                  format="DD/MM/YY HH:mm"
                  allowClear={false}
                  value={selectedTask.fecha_fin_real ? dayjs(selectedTask.fecha_fin_real) : null}
                  onChange={(d) => d && guardarCampoDetalle({ fecha_fin_real: d.toISOString() }, "Fin real corregido")}
                />
              ) : (selectedTask.fecha_fin_real ? dayjs(selectedTask.fecha_fin_real).format("DD/MM/YY HH:mm") : "—")}
            </Descriptions.Item>
            <Descriptions.Item label="Duración real">
              {regularizableFin ? (
                <Space>
                  <InputNumber
                    size="small" min={0} step={0.25} style={{ width: 90 }}
                    value={durRealModal}
                    onChange={(v) => setDurRealModal(v == null ? null : Number(v))}
                    onBlur={() => { if (durRealModal != null && Number(durRealModal) !== Number(selectedTask.horas_reales ?? 0)) guardarCampoDetalle({ horas_reales: durRealModal }, "Duración real regularizada"); }}
                    onPressEnter={() => { if (durRealModal != null) guardarCampoDetalle({ horas_reales: durRealModal }, "Duración real regularizada"); }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>h trabajadas</Typography.Text>
                </Space>
              ) : (selectedTask.horas_reales != null ? `${Number(selectedTask.horas_reales).toFixed(2)}h` : "—")}
            </Descriptions.Item>
            <Descriptions.Item label="Estado"><Tag color={estadoColor(selectedTask.estado)}>{estadoNombre(selectedTask.estado)}</Tag></Descriptions.Item>
            {selectedTask.observaciones && (
              <Descriptions.Item label="Nota del técnico">
                <span style={{ whiteSpace: "pre-wrap" }}>🗒 {selectedTask.observaciones}</span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Comentario">
              {editMode ? (
                <Input.TextArea
                  size="small"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder="Agregá un comentario para esta tarea…"
                  value={comentarioModal}
                  onChange={(e) => setComentarioModal(e.target.value)}
                  onBlur={() => detalleEditarComentario(comentarioModal)}
                />
              ) : (
                <span style={{ whiteSpace: "pre-wrap" }}>{selectedTask.comentario || "—"}</span>
              )}
            </Descriptions.Item>
            {conflictos.has(selectedTask.id) && (
              <Descriptions.Item label="">
                <Tag color="error">⚠ Conflicto con otra tarea del mismo recurso</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
          {!editable && (
            <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 6 }}>
              {!editMode ? "Activá Modo Edición para modificar operario, equipo, prioridad y duración."
                : selectedTask.publicado ? "Semana enviada — reabrila para editar."
                : selectedTask.estado === "realizado" ? "La tarea está realizada; no se edita desde acá."
                : haEmpezado(selectedTask.estado) ? "Tarea en curso: solo se puede ajustar la duración."
                : null}
            </Typography.Text>
          )}
          <div style={{ marginTop: 8 }}>
            <TareaAdjuntosLista taskId={selectedTask.id} />
          </div>
          </>
          );
        })()}
      </Modal>

      {/* Ayuda in-app (botón "?" del header) */}
      <AyudaProgramacionSemanal open={ayudaOpen} onClose={() => setAyudaOpen(false)} />

      <style jsx global>{`
        /* ── Estilos de impresión ── */
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body.psg-printing .ant-layout-sider,
          body.psg-printing .ant-layout-header,
          body.psg-printing .psg-no-print { display: none !important; }
          body.psg-printing .ant-layout-content { padding: 0 !important; margin: 0 !important; }
          body.psg-printing .psg-stats { display: none !important; }
          body.psg-printing .psg-gantt-wrap { max-height: none !important; overflow: visible !important; }
          body.psg-printing .psg-task-block { box-shadow: none !important; }
          body.psg-printing .psg-resource-cell { background: #fff !important; }
          /* Modo "un solo día": oculta los otros */
          body.psg-printing[data-print-day="0"] .psg-day-header:not(:nth-child(1)) { display: none; }
          body.psg-printing[data-print-day="1"] .psg-day-header:not(:nth-child(2)) { display: none; }
          body.psg-printing[data-print-day="2"] .psg-day-header:not(:nth-child(3)) { display: none; }
          body.psg-printing[data-print-day="3"] .psg-day-header:not(:nth-child(4)) { display: none; }
          body.psg-printing[data-print-day="4"] .psg-day-header:not(:nth-child(5)) { display: none; }
        }
        .psg-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }
        @media (max-width: 1100px) {
          .psg-stats { grid-template-columns: repeat(2, 1fr); }
        }
        .psg-stat-card {
          background: #fff;
          border: 1px solid ${brand.border};
          border-radius: 6px;
          padding: 12px 16px;
        }
        .psg-stat-label { font-size: 12px; color: ${brand.textSecondary}; }
        .psg-stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; }

        .psg-gantt-wrap { overflow: auto; max-height: 600px; }
        .psg-row {
          display: flex;
          min-height: ${ROW_HEIGHT}px;
          border-top: 1px solid ${brand.border};
          width: max-content;
          min-width: 100%;
        }
        .psg-row:first-child { border-top: none; }
        .psg-header-row { background: #FAFAFA; min-height: 60px; position: sticky; top: 0; z-index: 3; }
        .psg-resource-cell {
          width: 220px; min-width: 220px;
          flex-shrink: 0;
          padding: 8px 12px;
          border-right: 1px solid ${brand.border};
          background: #fff;
          display: flex; flex-direction: column; justify-content: center;
          font-size: 13px;
          position: sticky; left: 0; z-index: 2;
          gap: 4px;
        }
        .psg-res-name { display: flex; align-items: flex-start; line-height: 1.25; }
        .psg-res-label {
          font-weight: 500;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-word;
        }
        .psg-header-row .psg-resource-cell { background: #FAFAFA; font-weight: 600; }
        .psg-timeline-header { display: flex; flex-shrink: 0; }
        .psg-day-header {
          flex-shrink: 0;
          border-right: 1px solid ${brand.border};
        }
        .psg-day-header:last-child { border-right: none; }
        .psg-day-today { background: ${brand.cyan}0d; }
        .psg-day-today .psg-day-label { color: ${brand.cyan}; background: ${brand.cyan}1a; border-bottom: 2px solid ${brand.cyan}; }
        .psg-day-label {
          padding: 8px;
          text-align: center;
          font-weight: 600;
          font-size: 12px;
          background: #FAFAFA;
          border-bottom: 1px solid ${brand.border};
          text-transform: capitalize;
        }
        .psg-hour-row { display: flex; }
        .psg-hour-cell {
          flex-shrink: 0;
          padding: 4px 0;
          text-align: center;
          font-size: 10px;
          color: ${brand.textSecondary};
          border-right: 1px solid #F0F0F0;
        }
        .psg-hour-cell:last-child { border-right: none; }
        .psg-hour-lunch-band {
          position: absolute;
          top: 0; bottom: 0;
          background: #FFFBE6;
          pointer-events: none;
          z-index: 0;
          border-left: 1px dashed #d48806;
          border-right: 1px dashed #d48806;
        }

        .psg-row-strip {
          position: relative;
          background: #fff;
          flex-shrink: 0;
        }
        .psg-day-bg {
          position: absolute; top: 0; bottom: 0;
          display: flex;
          border-right: 1px solid ${brand.border};
        }
        .psg-slot {
          flex-shrink: 0;
          border-right: 1px solid #F5F5F5;
        }
        .psg-slot-lunch-band {
          position: absolute;
          top: 0; bottom: 0;
          background: repeating-linear-gradient(45deg, #FFF7CC 0 4px, #FFFBE6 4px 8px);
          pointer-events: none;
          z-index: 0;
        }

        .psg-task-block {
          position: absolute;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: move;
          color: #fff;
          font-size: 11px;
          overflow: hidden;
          background: #8c8c8c;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
          z-index: 1;
        }
        .psg-task-block:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.25); z-index: 2; }
        .psg-task-block:active { cursor: grabbing; }
        .psg-task-block[data-color="warning"] { background: #FA8C16; }
        .psg-task-block[data-color="processing"] { background: #1677FF; }
        .psg-task-block[data-color="success"] { background: #52C41A; }
        .psg-task-block[data-color="volcano"] { background: #B855E5; }
        .psg-task-block[data-color="error"] { background: #F5222D; }
        /* Cancelada (color "default"): apagada, no se confunde con activas. */
        .psg-task-block[data-estado="cancelado"] { background: #8c8c8c; opacity: 0.5; }
        /* En proceso distinto de Realizado (ambos eran "processing"/azul). */
        .psg-task-block[data-estado="en_proceso"] { background: #13C2C2; }
        /* Correctiva = EMERGENCIA: rojo fuerte con halo, sin importar el estado de
           ejecución (en_proceso/pausado/etc. siguen resaltando como emergencia). */
        .psg-task-block[data-emg="1"] { background: #F5222D; opacity: 1; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #F5222D, 0 1px 4px rgba(245,34,45,.55); z-index: 3; }
        /* Publicada = plan congelado: candado y borde claro. */
        .psg-task-block[data-pub="1"] { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.65); }
        .psg-task-block[data-pub="1"]::after {
          content: "🔒"; position: absolute; top: 2px; right: 4px;
          font-size: 9px; opacity: 0.9; pointer-events: none; z-index: 2;
        }
        .psg-task-block[data-conflict="1"] { outline: 2px solid #ff4d4f; }
        /* Modo Real: la tarea aún no empezó → es solo plan. Atenuada + borde punteado
           para distinguirla de la ejecución real. */

        /* Trabajo derivado a tercero: stripes diagonales + borde dorado para distinguir. */
        .psg-task-block[data-externo="1"] {
          background-image: repeating-linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.18) 0 6px,
            transparent 6px 12px
          );
          box-shadow: inset 0 0 0 2px #FAAD14, 0 1px 2px rgba(0,0,0,0.15);
        }
        .psg-task-block[data-externo="1"]::before {
          content: "🤝";
          position: absolute;
          top: 2px;
          right: 4px;
          font-size: 10px;
          line-height: 1;
          pointer-events: none;
          opacity: 0.95;
          text-shadow: 0 0 2px rgba(0,0,0,0.4);
        }
        .psg-pool-card[data-externo="1"] {
          background-image: repeating-linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.18) 0 6px,
            transparent 6px 12px
          );
          box-shadow: inset 0 0 0 2px #FAAD14, 0 1px 2px rgba(0,0,0,0.15);
        }
        .psg-task-selected {
          box-shadow: 0 0 0 3px ${brand.cyan}, 0 1px 4px rgba(0,0,0,0.2) !important;
        }
        .psg-resize-handle {
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 6px;
          cursor: ew-resize;
          background: rgba(255,255,255,0.0);
          z-index: 3;
        }
        .psg-resize-handle:hover { background: rgba(255,255,255,0.4); }
        .psg-task-block:hover .psg-resize-handle { background: rgba(255,255,255,0.25); }

        .psg-block-lunch {
          position: absolute;
          top: 0; bottom: 0;
          background: repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 4px, rgba(255,255,255,0.05) 4px 8px);
          border-left: 1px dashed rgba(255,255,255,0.45);
          border-right: 1px dashed rgba(255,255,255,0.45);
          pointer-events: none;
          z-index: 1;
        }

        /* Tareas multi-semana: borde plano + flecha en el lado que continúa */
        .psg-task-cont-left { border-top-left-radius: 0; border-bottom-left-radius: 0; }
        .psg-task-cont-right { border-top-right-radius: 0; border-bottom-right-radius: 0; }
        .psg-task-cont-marker {
          position: absolute;
          top: 0; bottom: 0;
          width: 14px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.18);
          color: #fff;
          font-weight: 700;
          z-index: 2;
          pointer-events: none;
        }
        .psg-task-cont-marker-left { left: 0; }
        .psg-task-cont-marker-right { right: 0; }

        .psg-row-target {
          background: rgba(22,119,255,0.06) !important;
          outline: 2px dashed ${brand.cyan};
          outline-offset: -2px;
        }
        .psg-row-target-conflict {
          background: rgba(245,34,45,0.08) !important;
          outline: 2px dashed #F5222D;
          outline-offset: -2px;
        }
        .psg-drop-preview {
          position: absolute;
          background: rgba(22,119,255,0.18);
          border: 2px dashed #1677FF;
          border-radius: 4px;
          z-index: 0;
          pointer-events: none;
          display: flex; align-items: center; justify-content: center;
        }
        .psg-drop-preview-conflict {
          background: rgba(245,34,45,0.18);
          border-color: #F5222D;
        }
        .psg-drop-preview-label {
          background: #1677FF;
          color: #fff;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 600;
          white-space: nowrap;
        }
        .psg-drop-preview-conflict .psg-drop-preview-label {
          background: #F5222D;
        }
        .psg-drop-line {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          background: #1677FF;
          z-index: 1;
          pointer-events: none;
          box-shadow: 0 0 8px rgba(22,119,255,0.6);
        }
        .psg-drop-line-conflict { background: #F5222D; box-shadow: 0 0 8px rgba(245,34,45,0.6); }

        .psg-load-row {
          display: flex; align-items: center; gap: 6px;
        }
        .psg-load-bar {
          position: relative;
          flex: 1;
          height: 6px;
          background: #F0F0F0;
          border-radius: 3px;
          overflow: hidden;
        }
        .psg-load-fill {
          position: absolute; left: 0; top: 0; bottom: 0;
          background: #52C41A;
          transition: width 0.2s ease, background 0.2s ease;
          border-radius: 3px;
        }
        .psg-load-text {
          font-size: 10px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .psg-now-line {
          /* Vive dentro del wrapper relativo de las filas: top/bottom 0 la
             estiran a la altura REAL del contenido (todas las filas). */
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #F5222D;
          z-index: 4;
          pointer-events: none;
        }
        .psg-now-line::after {
          content: "AHORA";
          position: absolute;
          top: -16px;
          left: 4px;
          background: #F5222D;
          color: #fff;
          font-size: 9px;
          padding: 1px 5px;
          border-radius: 3px;
          font-weight: 700;
        }
        .psg-now-dot {
          position: absolute;
          top: 0;
          left: -4px;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #F5222D;
          box-shadow: 0 0 0 3px rgba(245,34,45,0.2);
        }

        .psg-drag-ghost-block {
          padding: 4px 8px;
          border-radius: 4px;
          color: #fff;
          font-size: 11px;
          background: #8c8c8c;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          opacity: 0.92;
          height: ${ROW_HEIGHT - 16}px;
          overflow: hidden;
        }
        .psg-drag-ghost-block[data-color="warning"] { background: #FA8C16; }
        .psg-drag-ghost-block[data-color="processing"] { background: #1677FF; }
        .psg-drag-ghost-block[data-color="success"] { background: #52C41A; }
        .psg-drag-ghost-block[data-color="volcano"] { background: #B855E5; }
        .psg-drag-ghost-block[data-color="error"] { background: #F5222D; }

        .psg-drag-tooltip {
          background: rgba(28,43,91,0.95);
          color: #fff;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 11px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          line-height: 1.3;
          min-width: 90px;
        }
        .psg-drag-tooltip-conflict {
          background: rgba(245,34,45,0.95);
        }
        .psg-task-title {
          font-weight: 600; line-height: 1.2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .psg-task-sub {
          font-size: 10px; opacity: 0.95; line-height: 1.15;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .psg-task-cmt {
          font-size: 9px; opacity: 0.9; font-style: italic; line-height: 1.15;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        /* Bloque angosto con comentario: badge en la esquina (texto en el tooltip). */
        .psg-task-cmt-badge {
          position: absolute; bottom: 1px; right: 3px;
          font-size: 9px; opacity: 0.85; pointer-events: none; line-height: 1;
        }
        /* Barra de ejecución real sobre la foto (vista Semana planificada). */
        .psg-exec-bar {
          position: absolute;
          bottom: 2px;
          height: 7px;
          border-radius: 3px;
          pointer-events: none;
          z-index: 2;
          background: #13C2C2;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85);
        }
        .psg-exec-bar[data-estado="realizado"] { background: #52C41A; }
        .psg-exec-bar[data-estado="pausado"] { background: #FA8C16; }

        .psg-pool {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 8px;
          padding: 12px;
          background: #FAFAFA;
          border: 1px solid ${brand.border};
          border-radius: 6px;
        }
        .psg-pool-card {
          padding: 8px 10px;
          border-radius: 4px;
          color: #fff;
          background: #8c8c8c;
          cursor: grab;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .psg-pool-card:active { cursor: grabbing; }
        .psg-pool-card[data-color="warning"] { background: #FA8C16; }
        .psg-pool-card[data-color="processing"] { background: #1677FF; }
        .psg-pool-card[data-color="success"] { background: #52C41A; }
        .psg-pool-card[data-color="volcano"] { background: #B855E5; }
        .psg-pool-card[data-color="error"] { background: #F5222D; }
        .psg-pool-card[data-estado="cancelado"] { background: #8c8c8c; opacity: 0.55; }
        .psg-pool-card[data-estado="en_proceso"] { background: #13C2C2; }
        .psg-pool-card[data-emg="1"] { background: #F5222D; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #F5222D, 0 1px 4px rgba(245,34,45,.55); }
        .psg-pool-card-semana { box-shadow: inset 4px 0 0 ${brand.cyan}, 0 1px 2px rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="psg-stat-card">
      <div className="psg-stat-label">{label}</div>
      <div className="psg-stat-value" style={{ color }}>{value}</div>
    </div>
  );
}

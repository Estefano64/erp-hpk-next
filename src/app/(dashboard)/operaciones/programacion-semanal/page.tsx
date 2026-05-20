"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography, Button, Space, Tag, Card, Modal, Descriptions, Tooltip, message, Empty, DatePicker, Collapse, Segmented, Slider, Alert, Popover, Divider, Select,
} from "antd";
import {
  CalendarOutlined, LeftOutlined, RightOutlined, UserOutlined, ToolOutlined, AimOutlined,
  SettingOutlined, RollbackOutlined, UnorderedListOutlined, WarningFilled, ZoomInOutlined, ZoomOutOutlined,
  PrinterOutlined, BgColorsOutlined, FilterOutlined, ClearOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/theme";
import { calcularFinEstimado } from "@/lib/planification-hours";
import { useTabSync } from "@/lib/useTabSync";

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
  tecnico: string | null;
  maquina: string | null;
  estado: string | null;
  version: number;
  qty_personal: number | null;
  semana_plan: string | null;
  trabajo_externo: boolean | null;
  orden_trabajo: {
    id: number;
    ot: string | null;
    cliente: { razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string } | null;
  } | null;
}

interface Trabajador { trabajador_id: number; nombre: string; area: string; puesto: string }
interface Equipo { codigo: string; descripcion: string }
interface StatusTareaOpt { codigo: string; nombre: string; color: string | null }

// Helpers para multi-operario en `tecnico` (string separado por coma).
function splitTecnicos(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

const JORNADA_INICIO = 8;
const JORNADA_FIN = 18;
const HORAS_DIA = JORNADA_FIN - JORNADA_INICIO; // 10
const ALMUERZO_INI = 12;
const ALMUERZO_FIN = 14; // visualmente bloque de 12-14 con almuerzo 12:30-13:30
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

export default function ProgramacionSemanalPage() {
  const router = useRouter();
  const [lunes, setLunes] = useState<Dayjs>(() => dayjs().startOf("isoWeek"));
  const [view, setView] = useState<"equipo" | "operario">("equipo");
  const [filtroEquipos, setFiltroEquipos] = useState<string[]>([]);
  const [filtroOperarios, setFiltroOperarios] = useState<string[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [allRows, setAllRows] = useState<PlanRow[]>([]); // para "sin semana asignada"
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [estadosCat, setEstadosCat] = useState<StatusTareaOpt[]>([]);
  const [selectedTask, setSelectedTask] = useState<PlanRow | null>(null);
  const [hourPx, setHourPx] = useState<number>(HOUR_PX_DEFAULT);
  const [resizing, setResizing] = useState<{ id: number; initialX: number; initialWidth: number; recurso: string } | null>(null);
  const [resizeWidth, setResizeWidth] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);
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
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const stripsRef = useRef<Map<string, HTMLElement>>(new Map());

  const dayPx = HORAS_DIA * hourPx;

  const viernes = useMemo(() => lunes.add(4, "day").endOf("day"), [lunes]);
  const days = useMemo(() => buildWeekDays(lunes), [lunes]);
  const semanaActual = useMemo(() => semanaCodigo(lunes), [lunes]);

  const fetchData = useCallback(async () => {
    const params1 = new URLSearchParams({
      limit: "500",
      desde: lunes.hour(0).minute(0).second(0).toISOString(),
      hasta: viernes.toISOString(),
    });
    const [resWeek, resAll] = await Promise.all([
      fetch(`/api/planificacion?${params1}`),
      fetch(`/api/planificacion?limit=500`),
    ]);
    if (resWeek.ok) setRows((await resWeek.json()).data ?? []);
    if (resAll.ok) setAllRows((await resAll.json()).data ?? []);
  }, [lunes, viernes]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const notifySync = useTabSync("planificacion", fetchData);

  useEffect(() => {
    (async () => {
      const [resT, resE, resS] = await Promise.all([
        fetch("/api/trabajadores?limit=200"),
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

  const conflictos = useMemo(() => detectarConflictos(rows), [rows]);

  // ── Stats ──
  const stats = useMemo(() => {
    const conFecha = rows.filter((r) => r.fecha_inicio).length;
    const sinFecha = rows.length - conFecha;
    const sinSemana = allRows.filter((r) => !r.semana_plan && !r.fecha_inicio).length;
    return {
      total: rows.length,
      conFecha,
      sinFecha,
      conflictos: conflictos.size,
      sinSemana,
    };
  }, [rows, allRows, conflictos]);

  const sinSemanaLista = useMemo(
    () => allRows.filter((r) => !r.semana_plan && !r.fecha_inicio),
    [allRows],
  );

  // Tareas de ESTA semana sin fecha asignada (tienen semana_plan = semanaActual pero fecha_inicio en null)
  const sinFechaListaSemana = useMemo(
    () => allRows.filter((r) => r.semana_plan === semanaActual && !r.fecha_inicio),
    [allRows, semanaActual],
  );

  const estadoColor = useCallback((est: string | null): string => {
    const c = estadosCat.find((e) => e.codigo === est);
    return c?.color ?? "default";
  }, [estadosCat]);

  const estadoNombre = useCallback((est: string | null): string => {
    const c = estadosCat.find((e) => e.codigo === est);
    return c?.nombre ?? est ?? "-";
  }, [estadosCat]);

  // ── Filas filtradas: aplican filtros de equipos y operarios sobre las tareas ──
  const rowsFiltradas = useMemo(() => {
    if (filtroEquipos.length === 0 && filtroOperarios.length === 0) return rows;
    return rows.filter((r) => {
      if (filtroEquipos.length > 0) {
        const maqs = splitTecnicos(r.maquina);
        if (!maqs.some((m) => filtroEquipos.includes(m))) return false;
      }
      if (filtroOperarios.length > 0) {
        const tecs = splitTecnicos(r.tecnico);
        if (!tecs.some((t) => filtroOperarios.includes(t))) return false;
      }
      return true;
    });
  }, [rows, filtroEquipos, filtroOperarios]);

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
    for (const r of rowsFiltradas) {
      const dur = Number(r.horas_estimadas ?? 0);
      const qty = Math.max(1, Number(r.qty_personal ?? 1));
      const hhTotal = dur * qty;
      const keys = view === "equipo" ? splitTecnicos(r.maquina) : splitTecnicos(r.tecnico);
      if (keys.length === 0) continue;
      // Carga prorateada entre todos los recursos asignados (operarios o máquinas)
      const cuota = hhTotal / keys.length;
      for (const k of keys) map.set(k, (map.get(k) ?? 0) + cuota);
    }
    return map;
  }, [rowsFiltradas, view]);

  // Posición X de "ahora" si la semana actual es la mostrada
  const lineaHoy = useMemo(() => {
    const ahora = dayjs();
    if (ahora.isoWeek() !== lunes.isoWeek() || ahora.isoWeekYear() !== lunes.isoWeekYear()) return null;
    const dayIdx = ahora.diff(lunes, "day");
    if (dayIdx < 0 || dayIdx > 4) return null;
    const h = ahora.hour() + ahora.minute() / 60;
    if (h < JORNADA_INICIO || h > JORNADA_FIN) return null;
    return dayIdx * dayPx + (h - JORNADA_INICIO) * hourPx;
  }, [lunes, dayPx, hourPx]);

  // ── Persist con update optimista ──
  async function persistMove(id: number, nuevoInicio: Dayjs, nuevoRecurso?: string) {
    const original = rows.find((r) => r.id === id) || allRows.find((r) => r.id === id);
    if (!original) return;
    // Si la tarea no tiene horas_estimadas (vino del pool sin fecha), defaulteamos a 1h
    const durRaw = Number(original.horas_estimadas);
    const horasFaltantes = !Number.isFinite(durRaw) || durRaw <= 0;
    const dur = horasFaltantes ? 1 : durRaw;
    const qty = Math.max(1, Number(original.qty_personal ?? 1));
    const fin = calcularFinEstimado(nuevoInicio.toDate(), dur * qty);
    const patch: Record<string, unknown> = {
      fecha_inicio: nuevoInicio.toISOString(),
      fecha_fin: fin.toISOString(),
      semana_plan: semanaCodigo(nuevoInicio),
    };
    if (horasFaltantes) patch.horas_estimadas = 1;
    if (nuevoRecurso !== undefined) {
      if (view === "equipo") patch.maquina = nuevoRecurso;
      else patch.tecnico = nuevoRecurso;
    }

    // Optimista: actualizo inmediatamente la UI
    const updated: Partial<PlanRow> = {
      fecha_inicio: nuevoInicio.toISOString(),
      fecha_fin: fin.toISOString(),
      semana_plan: semanaCodigo(nuevoInicio),
    };
    if (horasFaltantes) updated.horas_estimadas = "1";
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

    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, version: original.version }),
      });
      if (res.status === 409) {
        messageApi.warning("Otro usuario actualizó esta tarea. Sincronizando…");
        fetchData();
        return;
      }
      if (res.status === 423) {
        messageApi.error("Tarea cerrada (realizado), no editable.");
        fetchData();
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Error");
      notifySync();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al reprogramar");
      fetchData();
    }
  }

  // ── Resize ──
  async function persistResize(id: number, nuevasHoras: number) {
    const original = rows.find((r) => r.id === id);
    if (!original) return;
    const qty = Math.max(1, Number(original.qty_personal ?? 1));
    // nuevasHoras representa duración total de la barra. Las horas_estimadas son por persona.
    const horasPorPersona = Math.max(0.25, nuevasHoras / qty);
    const inicio = original.fecha_inicio ? new Date(original.fecha_inicio) : null;
    const finRecalc = inicio ? calcularFinEstimado(inicio, horasPorPersona * qty).toISOString() : null;
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horas_estimadas: horasPorPersona,
          ...(finRecalc ? { fecha_fin: finRecalc } : {}),
          version: original.version,
        }),
      });
      if (res.status === 409) {
        messageApi.warning("Otro usuario actualizó esta tarea. Sincronizando…");
        fetchData();
        return;
      }
      if (res.status === 423) {
        messageApi.error("Tarea cerrada (realizado), no editable.");
        fetchData();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      messageApi.success(`Duración: ${horasPorPersona.toFixed(2)}h`);
      notifySync();
      fetchData();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al redimensionar");
    }
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
    if (e.button !== 0) return; // solo click izquierdo
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    // Si la tarea está en el set de seleccionadas y hay más de 1, prepara multi-drag
    let multiOffsets: { id: number; offsetMin: number; recurso: string | null }[] = [];
    if (selectedIds.has(taskId) && selectedIds.size > 1) {
      const base = rows.find((r) => r.id === taskId) ?? allRows.find((r) => r.id === taskId);
      const baseIni = base?.fecha_inicio ? new Date(base.fecha_inicio).getTime() : null;
      if (baseIni != null) {
        for (const id of selectedIds) {
          if (id === taskId) continue;
          const t = rows.find((r) => r.id === id) ?? allRows.find((r) => r.id === id);
          if (!t || !t.fecha_inicio) continue;
          const offsetMin = Math.round((new Date(t.fecha_inicio).getTime() - baseIni) / 60000);
          multiOffsets.push({
            id,
            offsetMin,
            recurso: view === "equipo" ? t.maquina : t.tecnico,
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

  // Detector de conflicto durante drag (en vivo)
  const dragConflict = useMemo(() => {
    if (!drag || !drag.snappedDate || !drag.targetRow) return false;
    const original = rows.find((r) => r.id === drag.taskId) ?? allRows.find((r) => r.id === drag.taskId);
    if (!original) return false;
    const dur = Number(original.horas_estimadas ?? 1);
    const qty = Math.max(1, Number(original.qty_personal ?? 1));
    const ini = drag.snappedDate.toDate().getTime();
    const fin = calcularFinEstimado(drag.snappedDate.toDate(), dur * qty).getTime();
    for (const t of rows) {
      if (t.id === drag.taskId) continue;
      const taskRecurso = view === "equipo" ? t.maquina : t.tecnico;
      if (taskRecurso !== drag.targetRow) continue;
      if (!t.fecha_inicio || !t.fecha_fin) continue;
      const oIni = new Date(t.fecha_inicio).getTime();
      const oFin = new Date(t.fecha_fin).getTime();
      if (ini < oFin && fin > oIni) return true;
    }
    return false;
  }, [drag, rows, allRows, view]);

  // Listeners globales para mover/soltar + atajos teclado + auto-scroll
  useEffect(() => {
    if (!drag) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    let scrollInterval: ReturnType<typeof setInterval> | null = null;

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
        persistMove(drag!.taskId, drag!.snappedDate, drag!.targetRow);
        // Multi-move: replicar el desplazamiento sobre las demás seleccionadas
        for (const m of drag!.multiOffsets) {
          const newIni = drag!.snappedDate.add(m.offsetMin, "minute");
          persistMove(m.id, newIni, m.recurso ?? undefined);
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
    if (!r.fecha_inicio || !r.fecha_fin) return null;
    const ini = dayjs(r.fecha_inicio);
    const fin = dayjs(r.fecha_fin);
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
    return (
      <Tooltip
        key={r.id}
        title={
          <div>
            <div><strong>OT {r.orden_trabajo?.ot ?? r.ot_id}</strong></div>
            <div>{r.operacion_codigo} — {r.descripcion}</div>
            <div>{ini.format("DD/MM HH:mm")} → {fin.format("DD/MM HH:mm")}</div>
            <div>Estado: {estadoNombre(r.estado)}</div>
            {hasConflict && <div style={{ color: "#ff4d4f" }}>⚠ Conflicto</div>}
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
            // No drag si la tarea continúa de otra semana (no sabemos a qué punto la mueve)
            if (continuaDeAntes || continuaDespues) return;
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
            cursor: (continuaDeAntes || continuaDespues) ? "pointer" : undefined,
          }}
          data-color={color}
          data-conflict={hasConflict ? "1" : "0"}
          data-externo={r.trabajo_externo ? "1" : "0"}
        >
          {/* Indicador de continuación desde semana anterior */}
          {continuaDeAntes && (
            <div className="psg-task-cont-marker psg-task-cont-marker-left" title={`Empezó el ${ini.format("ddd DD/MM HH:mm")}`}>
              <LeftOutlined style={{ fontSize: 10 }} />
            </div>
          )}
          {/* Indicador de continuación a semana siguiente */}
          {continuaDespues && (
            <div className="psg-task-cont-marker psg-task-cont-marker-right" title={`Termina el ${fin.format("ddd DD/MM HH:mm")}`}>
              <RightOutlined style={{ fontSize: 10 }} />
            </div>
          )}
          {/* Franja de almuerzo dentro del bloque (si lo cruza) */}
          {renderLunchOverlayInBlock(visibleIni, visibleFin, startPx)}
          <div className="psg-task-title" style={{ paddingLeft: continuaDeAntes ? 14 : 0, paddingRight: continuaDespues ? 14 : 0 }}>
            OT-{r.orden_trabajo?.ot ?? r.ot_id} {r.operacion_codigo}
            {hasConflict && <WarningFilled style={{ marginLeft: 4 }} />}
          </div>
          <div className="psg-task-sub" style={{ paddingLeft: continuaDeAntes ? 14 : 0, paddingRight: continuaDespues ? 14 : 0 }}>{r.descripcion}</div>
          {/* Resize handle: solo si la tarea NO continúa hacia la próxima semana */}
          {!continuaDespues && (
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

  return (
    <div style={{ minHeight: "100%" }}>
      {contextHolder}

      {/* Header con gradient */}
      <Card
        styles={{ body: { padding: "16px 20px" } }}
        style={{
          marginBottom: 12,
          background: `linear-gradient(135deg, ${brand.navy}, ${brand.cyan})`,
          color: "#fff",
          border: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <Typography.Title level={3} style={{ color: "#fff", margin: 0 }}>
              <CalendarOutlined style={{ marginRight: 8 }} />
              Programación Semanal
            </Typography.Title>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Gantt de tareas por {view === "equipo" ? "equipo" : "operario"} — L–V 8:00–18:00 (almuerzo 12:30–13:30)
            </div>
          </div>
          <Space wrap>
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
                if (nuevo === "equipo") setFiltroOperarios([]);
                else setFiltroEquipos([]);
              }}
              options={[
                { value: "equipo", icon: <ToolOutlined />, label: "Equipos" },
                { value: "operario", icon: <UserOutlined />, label: "Operarios" },
              ]}
            />
            <Button icon={<UnorderedListOutlined />} onClick={() => router.push("/operaciones/planificacion")}>Planificación</Button>
            <Button icon={<RollbackOutlined />} onClick={() => router.back()}>Volver</Button>
          </Space>
        </div>
      </Card>

      {/* Stats cards */}
      <div className="psg-stats">
        <StatCard label="Tareas programadas" value={stats.total} color={brand.navy} />
        <StatCard label="Con fecha asignada" value={stats.conFecha} color={brand.success} />
        <StatCard label="Sin fecha" value={stats.sinFecha} color={brand.warning} />
        <StatCard label="Conflictos" value={stats.conflictos} color={brand.error} />
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
              options={equipos.map((e) => ({ value: e.codigo, label: e.descripcion ?? e.codigo }))}
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
                <a onClick={clearSelection} style={{ marginLeft: 8, color: "#fff", textDecoration: "underline" }}>limpiar</a>
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
                          <Tag color={e.color ?? "default"} style={{ margin: 0, minWidth: 90, textAlign: "center" }}>
                            {e.nombre}
                          </Tag>
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
                      <WarningFilled style={{ color: "#ff4d4f", fontSize: 13 }} />
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

      {/* Gantt */}
      <Card styles={{ body: { padding: 0 } }} style={{ overflow: "hidden" }}>
        <div
          className="psg-gantt-wrap"
          ref={timelineRef}
          style={{ position: "relative", cursor: panning ? "grabbing" : "grab" }}
          onMouseDown={startPan}
        >
          {lineaHoy != null && (
            <div className="psg-now-line" style={{ left: 220 + lineaHoy }} title={`Ahora: ${dayjs().format("ddd DD/MM HH:mm")}`}>
              <div className="psg-now-dot" />
            </div>
          )}
          {/* Header */}
          <div className="psg-row psg-header-row">
            <div className="psg-resource-cell">Recurso</div>
            <div className="psg-timeline-header">
              {days.map((d, i) => (
                <div key={i} className="psg-day-header" style={{ width: dayPx, minWidth: dayPx }}>
                  <div className="psg-day-label">{d.format("ddd DD/MM")}</div>
                  <div className="psg-hour-row">
                    {Array.from({ length: HORAS_DIA }, (_, h) => {
                      const hour = JORNADA_INICIO + h;
                      const isLunch = hour >= ALMUERZO_INI && hour < ALMUERZO_FIN;
                      return (
                        <div
                          key={h}
                          className={`psg-hour-cell ${isLunch ? "psg-hour-lunch" : ""}`}
                          style={{ width: hourPx, minWidth: hourPx }}
                        >
                          {hourPx >= 40 ? `${String(hour).padStart(2, "0")}:00` : String(hour).padStart(2, "0")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filas de recursos */}
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
                      const previewIni = drag.snappedDate;
                      const previewFin = dayjs(calcularFinEstimado(previewIni.toDate(), dur * qty));
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
                        {Array.from({ length: HORAS_DIA }, (_, h) => {
                          const hour = JORNADA_INICIO + h;
                          const isLunch = hour >= ALMUERZO_INI && hour < ALMUERZO_FIN;
                          return (
                            <div key={h} className={`psg-slot ${isLunch ? "psg-slot-lunch" : ""}`} style={{ width: hourPx, minWidth: hourPx }} />
                          );
                        })}
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
      </Card>

      {/* Panel: tareas de ESTA semana sin fecha estimada */}
      <Collapse
        defaultActiveKey={sinFechaListaSemana.length > 0 ? ["semsf"] : []}
        style={{ marginTop: 12 }}
        items={[{
          key: "semsf",
          label: (
            <span>
              <CalendarOutlined /> <strong>Tareas de la semana {semanaActual} sin fecha asignada</strong>
              <Tag color={sinFechaListaSemana.length > 0 ? "processing" : "default"} style={{ marginLeft: 8 }}>
                {sinFechaListaSemana.length}
              </Tag>
            </span>
          ),
          children: sinFechaListaSemana.length === 0 ? (
            <Empty description="Todas las tareas de esta semana ya tienen fecha asignada." />
          ) : (
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 8 }}>
              Estas tareas tienen semana asignada pero no fecha. Arrastrálas sobre una fila del Gantt para fijarles inicio.
              Las que no tengan duración se colocarán como <strong>1h por defecto</strong> (después podés redimensionarlas con el borde derecho del bloque).
            </div>
          ),
        }]}
      />
      {sinFechaListaSemana.length > 0 && (
        <div className="psg-pool">
          {sinFechaListaSemana.map((t) => {
            const horas = Number(t.horas_estimadas ?? 0);
            const sinHoras = !Number.isFinite(horas) || horas <= 0;
            return (
              <div
                key={t.id}
                onMouseDown={(e) => startDrag(e, t.id, true)}
                onClick={() => { if (!drag) setSelectedTask(t); }}
                className="psg-pool-card psg-pool-card-semana"
                data-color={estadoColor(t.estado)}
                data-externo={t.trabajo_externo ? "1" : "0"}
                style={{ opacity: drag?.taskId === t.id ? 0.25 : 1 }}
              >
                <div style={{ fontWeight: 600, fontSize: 12 }}>
                  OT-{t.orden_trabajo?.ot ?? t.ot_id} · {t.operacion_codigo}
                </div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>{t.descripcion}</div>
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <span>Parte: {t.componente}</span>
                  <span>·</span>
                  {sinHoras
                    ? <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: "16px" }}>sin duración</Tag>
                    : <span>{horas.toFixed(1)}h</span>
                  }
                  {(t.tecnico || t.maquina) && (
                    <>
                      <span>·</span>
                      <span style={{ opacity: 0.85 }}>
                        {view === "equipo"
                          ? (t.maquina ?? "—")
                          : (t.tecnico ?? "—")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
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
              <Tag color="warning" style={{ marginLeft: 8 }}>{sinSemanaLista.length}</Tag>
            </span>
          ),
          children: sinSemanaLista.length === 0 ? (
            <Empty description="No hay tareas pendientes de programar." />
          ) : (
            <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 8 }}>
              Arrastrá una tarjeta y soltala sobre una fila del Gantt para asignarla a un recurso y horario.
            </div>
          ),
        }]}
      />
      {sinSemanaLista.length > 0 && (
        <div className="psg-pool">
          {sinSemanaLista.map((t) => (
            <div
              key={t.id}
              onMouseDown={(e) => startDrag(e, t.id, true)}
              onClick={() => { if (!drag) setSelectedTask(t); }}
              className="psg-pool-card"
              data-color={estadoColor(t.estado)}
              data-externo={t.trabajo_externo ? "1" : "0"}
              style={{ opacity: drag?.taskId === t.id ? 0.25 : 1 }}
            >
              <div style={{ fontWeight: 600, fontSize: 12 }}>
                OT-{t.orden_trabajo?.ot ?? t.ot_id} · {t.operacion_codigo}
              </div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{t.descripcion}</div>
              <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                Parte: {t.componente} · {Number(t.horas_estimadas ?? 0).toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      )}

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
                    <div className="psg-task-title">OT-{t?.orden_trabajo?.ot ?? t?.ot_id} {t?.operacion_codigo}</div>
                    <div className="psg-task-sub">{t?.descripcion}</div>
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
              <div><strong>{drag.snappedDate.format("ddd DD/MM")}</strong></div>
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
            ...days.map((d, i) => ({ value: `dia${i}`, label: d.format("ddd DD/MM") })),
          ]}
        />
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          title="Recomendación"
          description={<>En el diálogo del navegador elegí <strong>horizontal (landscape)</strong> y <strong>A4</strong>. Si imprimís un día, en la opción "más ajustes" del navegador podés ajustar el zoom para que ese día ocupe la página entera.</>}
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
          <Button key="plan" type="primary" onClick={() => router.push("/operaciones/planificacion")}>
            Editar en Planificación
          </Button>,
        ]}
        width={680}
      >
        {selectedTask && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="OT">{selectedTask.orden_trabajo?.ot ?? `#${selectedTask.ot_id}`}</Descriptions.Item>
            <Descriptions.Item label="Cliente">{selectedTask.orden_trabajo?.cliente?.nombre_comercial ?? selectedTask.orden_trabajo?.cliente?.razon_social ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Tarea">{selectedTask.operacion_codigo} — {selectedTask.descripcion}</Descriptions.Item>
            <Descriptions.Item label="Parte">{selectedTask.componente}</Descriptions.Item>
            <Descriptions.Item label="Operario">{selectedTask.tecnico ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Equipo">{selectedTask.maquina ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Inicio">{selectedTask.fecha_inicio ? dayjs(selectedTask.fecha_inicio).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
            <Descriptions.Item label="Fin">{selectedTask.fecha_fin ? dayjs(selectedTask.fecha_fin).format("DD/MM/YY HH:mm") : "—"}</Descriptions.Item>
            <Descriptions.Item label="Duración">{Number(selectedTask.horas_estimadas ?? 0).toFixed(1)}h · Qty {selectedTask.qty_personal ?? 1}</Descriptions.Item>
            <Descriptions.Item label="Estado"><Tag color={estadoColor(selectedTask.estado)}>{estadoNombre(selectedTask.estado)}</Tag></Descriptions.Item>
            {conflictos.has(selectedTask.id) && (
              <Descriptions.Item label="">
                <Tag color="error">⚠ Conflicto con otra tarea del mismo recurso</Tag>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

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
        .psg-hour-lunch { background: #FFFBE6; color: #d48806; }

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
        .psg-slot-lunch { background: repeating-linear-gradient(45deg, #FFF7CC 0 4px, #FFFBE6 4px 8px); }

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
        .psg-task-block[data-color="error"] { background: #F5222D; opacity: 0.7; }
        .psg-task-block[data-conflict="1"] { outline: 2px solid #ff4d4f; }

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
          position: absolute;
          top: 60px;
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
          font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .psg-task-sub {
          font-size: 10px; opacity: 0.95;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

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

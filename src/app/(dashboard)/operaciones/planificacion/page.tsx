"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography, Card, Table, Tag, Input, Select, Space, Button, DatePicker, InputNumber, Checkbox, message, Row, Col, Alert, Switch, Popconfirm, Tooltip,
} from "antd";
import { SearchOutlined, ReloadOutlined, CalendarOutlined, InfoCircleOutlined, SaveOutlined, UndoOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  numeracionColumn,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
  paginacionEstandar,
} from "@/lib/tables";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { brand } from "@/lib/theme";
import { calcularFinEstimado, calcularHH } from "@/lib/planification-hours";
import { useTabSync } from "@/lib/useTabSync";
import { useSession } from "next-auth/react";
import { useEditLock } from "@/lib/useEditLock";

import { formatDateOnlyShort } from "@/lib/dates";
dayjs.extend(isoWeek);
// Necesario para que dayjs(text, format, strict) acepte nuestros formatos cortos
// como "D/M HH:mm", "D-M", etc. Sin esto, los parseos strict fallan silenciosamente.
dayjs.extend(customParseFormat);

// Lista de formatos aceptados al escribir. Cubre todas las combinaciones de
// D/DD (día con o sin cero) x M/MM (mes con o sin cero) x con/sin año x con/sin hora,
// con separador `/` o `-`. El primero (DD/MM/YY HH:mm) es el formato canónico de display.
const FECHA_FORMATOS: string[] = [
  // Con año + minutos
  "DD/MM/YY HH:mm", "D/M/YY HH:mm", "DD/M/YY HH:mm", "D/MM/YY HH:mm",
  "DD-MM-YY HH:mm", "D-M-YY HH:mm", "DD-M-YY HH:mm", "D-MM-YY HH:mm",
  // Con año + hora sola
  "DD/MM/YY HH", "D/M/YY HH", "DD/M/YY HH", "D/MM/YY HH",
  "DD-MM-YY HH", "D-M-YY HH", "DD-M-YY HH", "D-MM-YY HH",
  // Con año solo
  "DD/MM/YY", "D/M/YY", "DD/M/YY", "D/MM/YY",
  "DD-MM-YY", "D-M-YY", "DD-M-YY", "D-MM-YY",
  // Sin año + minutos
  "DD/MM HH:mm", "D/M HH:mm", "DD/M HH:mm", "D/MM HH:mm",
  "DD-MM HH:mm", "D-M HH:mm", "DD-M HH:mm", "D-MM HH:mm",
  // Sin año + hora sola
  "DD/MM HH", "D/M HH", "DD/M HH", "D/MM HH",
  "DD-MM HH", "D-M HH", "DD-M HH", "D-MM HH",
  // Sin año solo
  "DD/MM", "D/M", "DD/M", "D/MM",
  "DD-MM", "D-M", "DD-M", "D-MM",
];

/**
 * Normaliza atajos comunes al escribir fechas para que matcheen los formatos:
 *  - "13/05 1315"  → "13/05 13:15"   (4 dígitos sin colon → HH:mm)
 *  - "13/05 815"   → "13/05 08:15"   (3 dígitos sin colon → 0H:mm)
 *  - "13/05 13:5"  → "13/05 13:05"   (minuto 1-dígito → padded)
 *  - "13/05 13:"   → "13/05 13:00"   (colon sin minutos → :00)
 *  - "13/05 8:15"  → "13/05 08:15"   (hora 1-dígito antes de colon → padded)
 */
function normalizarTextoFecha(raw: string): string {
  if (!raw) return raw;
  let t = raw.trim();
  // 4 dígitos al final: "1815" → "18:15"
  t = t.replace(/\s(\d{2})(\d{2})$/, (_, h, m) => ` ${h}:${m}`);
  // 3 dígitos al final: "815" → "08:15" (con leading zero)
  t = t.replace(/\s(\d{1})(\d{2})$/, (_, h, m) => ` 0${h}:${m}`);
  // Colon con minutos parciales o vacíos: "13:" → "13:00", "13:5" → "13:05"
  t = t.replace(/(\d{1,2}):(\d{0,1})$/, (_, h, m) => `${h}:${m ? m.padStart(2, "0") : "00"}`);
  // Hora 1-dígito antes de colon: "8:15" → "08:15"
  t = t.replace(/\s(\d{1}):(\d{2})$/, (_, h, m) => ` 0${h}:${m}`);
  return t;
}

// Valor por defecto para el time-picker dentro del DatePicker: 00:00 (no la hora actual).
// Si no se pasa, AntD usa la hora ACTUAL al abrir el panel y eso ensucia el campo.
const DEFAULT_PICKER_TIME = dayjs("00:00", "HH:mm");

// Helpers para el campo tecnico (multi-operario en una tarea con qty_personal > 1).
// Storage: string separado por coma+espacio (ej. "Juan Pérez, María López"). Compatibilidad:
// tareas con 1 solo operario quedan como antes; las que tengan varios usan la misma columna.
function splitTecnicos(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
function joinTecnicos(arr: string[]): string | null {
  const clean = arr.map((x) => x.trim()).filter(Boolean);
  return clean.length === 0 ? null : clean.join(", ");
}

/**
 * Parsea texto a Dayjs probando los formatos cortos.
 * Rellena el año al actual si el formato no lo incluye.
 */
function parseFechaSmart(raw: string): Dayjs | null {
  const t = normalizarTextoFecha(raw);
  if (!t) return null;
  for (const f of FECHA_FORMATOS) {
    const d = dayjs(t, f, true);
    if (!d.isValid()) continue;
    // Si el formato no llevaba año, dayjs ya usó el año actual.
    return d.second(0).millisecond(0);
  }
  return null;
}

interface PlanRow {
  id: number;
  ot_id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
  comentario: string | null;
  tipo_reparacion: string | null;
  orden: number;
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
  semana_plan: string | null;
  qty_personal: number | null;
  horas_extras: boolean | null;
  horas_extras_qty: string | null;
  trabajo_externo: boolean | null;
  orden_trabajo: {
    id: number;
    ot: string | null;
    descripcion: string | null;
    fecha_recepcion: string | null;
    fecha_requerimiento_cliente: string | null;
    taller_status: { codigo: string; nombre: string } | null;
    prioridad_atencion: { codigo: string; nombre: string } | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string; flota: { codigo: string; nombre: string } | null } | null;
  } | null;
}

interface TrabajadorOpt {
  trabajador_id: number;
  nombre: string;
  area: string;
  puesto: string;
  equipo_codigo: string | null;
  equipo: { codigo: string; descripcion: string } | null;
}
interface EquipoOpt { codigo: string; descripcion: string }

interface StatusTareaOpt { codigo: string; nombre: string; color: string | null; orden: number | null }

// Genera códigos de semana ISO (YYYY-Wnn) para el filtro: 8 semanas pasadas y 8 futuras
function buildSemanasOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const hoy = dayjs();
  for (let i = -4; i < 12; i++) {
    const d = hoy.add(i, "week");
    const y = d.isoWeekYear();
    const w = d.isoWeek();
    const code = `${y}W${String(w).padStart(2, "0")}`;
    const label = `${code} (${d.startOf("isoWeek").format("DD/MM")} – ${d.endOf("isoWeek").format("DD/MM")})`;
    opts.push({ value: code, label });
  }
  return opts;
}

export default function PlanificacionPage() {
  const { data: session } = useSession();
  const currentUser = (session?.user?.name ?? session?.user?.email) ?? null;
  // Page-level lock: resource_id fijo en 1 porque la planificación es un único
  // recurso compartido (no por OT). 0 funciona también pero algunos clientes
  // tratan 0 como "vacío" en parseo de query strings.
  const lock = useEditLock("planificacion", 1, currentUser);
  const [editMode, setEditMode] = useState(false);

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterSemana, setFilterSemana] = useState<string | undefined>();
  const [filterEstado, setFilterEstado] = useState<string | undefined>();
  const [filterTecnico, setFilterTecnico] = useState<string | undefined>();
  const [filterMaquina, setFilterMaquina] = useState<string | undefined>();

  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  const [equipos, setEquipos] = useState<EquipoOpt[]>([]);
  const [estados, setEstados] = useState<StatusTareaOpt[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [autoSave, setAutoSave] = useState(true);
  // Cambios pendientes acumulados en modo batch: id → patch combinado (los originales para revert)
  const [pendingChanges, setPendingChanges] = useState<Record<number, Record<string, unknown>>>({});
  const originalSnapshots = useRef<Record<number, PlanRow>>({});
  const [savingBatch, setSavingBatch] = useState(false);
  // Bulk edit
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [bulkTecnico, setBulkTecnico] = useState<string | undefined>();
  const [bulkMaquina, setBulkMaquina] = useState<string | undefined>();
  const [bulkSemana, setBulkSemana] = useState<string | undefined>();
  const [messageApi, contextHolder] = message.useMessage();
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const { ocultas, setOcultas } = useColumnasOcultas("planificacion-cols-v1");
  const { rango: rangoInicio, setRango: setRangoInicio } = useRangoFechas();
  const { rango: rangoFin, setRango: setRangoFin } = useRangoFechas();

  // Capacidad teórica por semana (referencia para color)
  const CAPACIDAD_SEMANA = 45;

  const semanaOpts = useMemo(() => buildSemanasOptions(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (search) params.set("search", search);
    if (filterSemana) params.set("semana", filterSemana);
    if (filterEstado) params.set("estado", filterEstado);
    if (filterTecnico) params.set("tecnico", filterTecnico);
    if (filterMaquina) params.set("maquina", filterMaquina);
    const res = await fetch(`/api/planificacion?${params}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.total ?? 0);
    }
    setLoading(false);
  }, [search, filterSemana, filterEstado, filterTecnico, filterMaquina]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const notifySync = useTabSync("planificacion", fetchData);

  useEffect(() => {
    (async () => {
      const [resT, resE, resS] = await Promise.all([
        fetch("/api/trabajadores?limit=200&soloOperarios=1"),
        fetch("/api/equipos?limit=200&tipo=MAQ"),
        fetch("/api/catalogos?tabla=statusTarea"),
      ]);
      if (resT.ok) {
        const j = await resT.json();
        setTrabajadores(j.data ?? []);
      }
      if (resE.ok) {
        const j = await resE.json();
        setEquipos((j.data ?? []).map((e: { codigo: string; descripcion: string }) => ({ codigo: e.codigo, descripcion: e.descripcion })));
      }
      if (resS.ok) {
        const j = await resS.json();
        setEstados(j.data ?? []);
      }
    })();
  }, []);

  const persistPatch = useCallback(async (id: number, patch: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 423) {
        messageApi.error("Tarea cerrada (realizado), no editable.");
        fetchData();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...json.data } : r));
      } else {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
      }
      notifySync();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
      // Refrescar desde la BD para que el optimistic update no quede desincronizado.
      try {
        const ref = await fetch(`/api/planificacion/${id}`);
        if (ref.ok) {
          const j = await ref.json();
          if (j?.data) setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...j.data } : r));
        }
      } catch { /* ignore */ }
    } finally {
      setSavingId(null);
    }
  }, [messageApi, notifySync, fetchData]);

  const updateField = useCallback((id: number, patch: Record<string, unknown>) => {
    if (!editMode) {
      messageApi.warning("Activá Modo Edición para hacer cambios.");
      return;
    }
    // Optimistic local update siempre
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target && !originalSnapshots.current[id]) {
        originalSnapshots.current[id] = target;
      }
      return prev.map((r) => r.id === id ? { ...r, ...patch } : r);
    });
    if (autoSave) {
      // Debounced persist
      if (debounceTimers.current[id]) clearTimeout(debounceTimers.current[id]);
      debounceTimers.current[id] = setTimeout(() => {
        persistPatch(id, patch);
      }, 500);
    } else {
      // Batch: acumular el patch
      setPendingChanges((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), ...patch },
      }));
    }
  }, [persistPatch, autoSave, editMode, messageApi]);

  // Toggle de edit mode. Adquiere/libera el lock pesimista.
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
          ? `${lock.lockedBy} está editando la planificación.`
          : "No se pudo entrar a edición.",
      );
      return;
    }
    setEditMode(true);
  }, [editMode, lock, messageApi]);

  // Si pierdo el lock (heartbeat 409, alguien más entró tras stale), salir de edit mode.
  useEffect(() => {
    if (editMode && !lock.isOwner && lock.lockedBy && lock.lockedBy !== currentUser) {
      setEditMode(false);
      messageApi.warning("Perdiste el lock de edición. Otro usuario lo tomó.");
    }
  }, [editMode, lock.isOwner, lock.lockedBy, currentUser, messageApi]);

  const guardarTodo = useCallback(async () => {
    const ids = Object.keys(pendingChanges).map(Number);
    if (ids.length === 0) return;
    setSavingBatch(true);
    let okCount = 0;
    let errorCount = 0;
    for (const id of ids) {
      const patch = pendingChanges[id];
      try {
        const res = await fetch(`/api/planificacion/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.status === 423) { errorCount++; continue; }
        if (!res.ok) { errorCount++; continue; }
        okCount++;
      } catch {
        errorCount++;
      }
    }
    setSavingBatch(false);
    setPendingChanges({});
    originalSnapshots.current = {};
    if (okCount > 0) messageApi.success(`Guardadas ${okCount} de ${ids.length} tareas.`);
    if (errorCount > 0) messageApi.error(`${errorCount} con error al guardar.`);
    notifySync();
    fetchData();
  }, [pendingChanges, messageApi, notifySync, fetchData]);

  const descartarTodo = useCallback(() => {
    // Revertir cambios locales a los snapshots originales
    setRows((prev) => prev.map((r) => {
      const orig = originalSnapshots.current[r.id];
      return orig ? orig : r;
    }));
    setPendingChanges({});
    originalSnapshots.current = {};
    messageApi.info("Cambios descartados.");
  }, [messageApi]);

  const cambiosPendientesCount = Object.keys(pendingChanges).length;

  // Bulk: aplica el patch a todas las filas seleccionadas
  const aplicarBulk = useCallback(() => {
    const patch: Record<string, unknown> = {};
    if (bulkTecnico !== undefined) {
      patch.tecnico = bulkTecnico ?? null;
      // Si el operario nuevo es "Tercero", marcamos también trabajo_externo (y limpiamos máquina).
      if (bulkTecnico === "Tercero") {
        patch.trabajo_externo = true;
        if (bulkMaquina === undefined) patch.maquina = null;
      } else if (bulkTecnico) {
        patch.trabajo_externo = false;
      }
    }
    if (bulkMaquina !== undefined) patch.maquina = bulkMaquina ?? null;
    if (bulkSemana !== undefined) patch.semana_plan = bulkSemana ?? null;
    if (Object.keys(patch).length === 0) {
      messageApi.warning("Elegí al menos un campo para aplicar.");
      return;
    }
    if (selectedKeys.length === 0) return;
    // No bulk-editar tareas realizadas (servidor las rechaza, mejor avisar antes)
    const realizadas = selectedKeys.filter((id) => rows.find((r) => r.id === id)?.estado === "realizado");
    const editables = selectedKeys.filter((id) => !realizadas.includes(id));
    for (const id of editables) {
      updateField(id, { ...patch });
    }
    if (realizadas.length > 0) {
      messageApi.warning(`${realizadas.length} tarea(s) "realizado" se omitieron.`);
    }
    messageApi.success(`Cambio aplicado a ${editables.length} tarea(s)${autoSave ? "" : " (queda pendiente de guardar)"}.`);
    setBulkTecnico(undefined);
    setBulkMaquina(undefined);
    setBulkSemana(undefined);
    setSelectedKeys([]);
  }, [bulkTecnico, bulkMaquina, bulkSemana, selectedKeys, rows, updateField, messageApi, autoSave]);

  // Auto-calcular fecha_fin cuando cambian inicio / duración / qty.
  // Si HE está marcado, el Fin Estimado lo maneja el usuario manualmente (no se sobrescribe).
  function recalcularFin(r: PlanRow, patch: Partial<PlanRow>): Partial<PlanRow> {
    const out: Partial<PlanRow> = { ...patch };
    const merged = { ...r, ...patch };
    // Con HE: no auto-calcular, respetar lo que pone el usuario
    if (merged.horas_extras) return out;
    const inicio = merged.fecha_inicio ? new Date(merged.fecha_inicio) : null;
    const duracion = Number(merged.horas_estimadas ?? 0);
    const qty = Math.max(1, Number(merged.qty_personal ?? 1));
    const horasTotalTarea = duracion * qty;
    if (inicio && horasTotalTarea > 0) {
      out.fecha_fin = calcularFinEstimado(inicio, horasTotalTarea).toISOString();
    } else {
      // Sin fecha de inicio (o duración 0): el Fin estimado no tiene sentido, lo limpiamos.
      out.fecha_fin = null;
    }
    return out;
  }

  // Índice de carga: semana → recurso → HH
  const cargaIndex = useMemo(() => {
    const op = new Map<string, Map<string, number>>();
    const eq = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const semana = r.semana_plan;
      if (!semana) continue;
      const hh = Number(r.horas_estimadas ?? 0) * Math.max(1, Number(r.qty_personal ?? 1));
      const tecnicos = splitTecnicos(r.tecnico);
      if (tecnicos.length > 0) {
        if (!op.has(semana)) op.set(semana, new Map());
        const m = op.get(semana)!;
        // Si hay varios operarios asignados a la tarea, se prorratea la carga entre ellos.
        const cuota = hh / tecnicos.length;
        for (const t of tecnicos) m.set(t, (m.get(t) ?? 0) + cuota);
      }
      const maquinas = splitTecnicos(r.maquina);
      if (maquinas.length > 0) {
        if (!eq.has(semana)) eq.set(semana, new Map());
        const m = eq.get(semana)!;
        // Prorrateo entre varias máquinas si la tarea las comparte.
        const cuota = hh / maquinas.length;
        for (const k of maquinas) m.set(k, (m.get(k) ?? 0) + cuota);
      }
    }
    return { op, eq };
  }, [rows]);

  // Color tag según % de carga
  function cargaColor(hh: number): string {
    const pct = (hh / CAPACIDAD_SEMANA) * 100;
    if (pct > 100) return "red";
    if (pct > 90) return "orange";
    if (pct > 70) return "blue";
    return "green";
  }

  // Construye opciones con badge de carga si hay una semana de referencia.
  // Incluye "Tercero" como opción especial al inicio (trabajos derivados a un proveedor externo).
  function buildOpcionesOperario(semanaRef: string | null | undefined) {
    const cargaMap = semanaRef ? cargaIndex.op.get(semanaRef) : null;
    const opcionTercero = {
      value: "Tercero",
      // search: string que el filterOption usa para matchear lo que tipea el
      // usuario (porque label es JSX y no se puede usar como string).
      search: "tercero proveedor externo",
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Tag color="purple" style={{ fontSize: 10, margin: 0, lineHeight: "16px" }}>TERCERO</Tag>
          <span style={{ color: brand.textSecondary, fontSize: 11 }}>Trabajo derivado a proveedor externo</span>
        </span>
      ),
    };
    const operarios = trabajadores.map((t) => {
      const hh = cargaMap?.get(t.nombre) ?? 0;
      const showCarga = !!cargaMap;
      return {
        value: t.nombre,
        search: `${t.nombre} ${t.area ?? ""} ${t.puesto ?? ""}`.toLowerCase(),
        label: showCarga ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.nombre} <span style={{ color: brand.textSecondary }}>— {t.area}</span>
            </span>
            <Tag color={cargaColor(hh)} style={{ fontSize: 10, margin: 0, lineHeight: "16px" }}>
              {hh.toFixed(0)}/{CAPACIDAD_SEMANA}h
            </Tag>
          </span>
        ) : `${t.nombre} — ${t.area}`,
      };
    });
    return [opcionTercero, ...operarios];
  }

  function buildOpcionesEquipo(semanaRef: string | null | undefined) {
    const cargaMap = semanaRef ? cargaIndex.eq.get(semanaRef) : null;
    return equipos.map((e) => {
      const hh = cargaMap?.get(e.codigo) ?? 0;
      const showCarga = !!cargaMap;
      // Pedido del usuario: primero el nombre (descripcion), después el código.
      return {
        value: e.codigo,
        // search: string para que filterOption matchee por código O descripción.
        // Necesario porque label es JSX cuando hay carga (no se puede searchar).
        search: `${e.codigo} ${e.descripcion ?? ""}`.toLowerCase(),
        label: showCarga ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.descripcion} <span style={{ color: brand.textSecondary }}>— {e.codigo}</span>
            </span>
            <Tag color={cargaColor(hh)} style={{ fontSize: 10, margin: 0, lineHeight: "16px" }}>
              {hh.toFixed(0)}/{CAPACIDAD_SEMANA}h
            </Tag>
          </span>
        ) : `${e.descripcion} — ${e.codigo}`,
      };
    });
  }

  const trabajadorOptions = useMemo(
    () => trabajadores.map((t) => ({
      value: t.nombre,
      label: `${t.nombre} — ${t.area}`,
    })),
    [trabajadores],
  );

  // Valores únicos para filtros de cabecera (estilo Excel)
  const otValores = [...new Set(rows.map((r) => r.orden_trabajo?.ot).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const clienteValores = [...new Set(rows.map((r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const flotaValores = [...new Set(rows.map((r) => r.orden_trabajo?.codigo_reparacion?.flota?.codigo).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const otDescValores = [...new Set(rows.map((r) => r.orden_trabajo?.descripcion).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const fechaRecepValores = [...new Set(rows.map((r) => r.orden_trabajo?.fecha_recepcion).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: formatDateOnlyShort(v), value: v }));
  const prioridadValores = [...new Set(rows.map((r) => r.orden_trabajo?.prioridad_atencion?.nombre).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const tallerValores = [...new Set(rows.map((r) => r.orden_trabajo?.taller_status?.nombre).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const componenteValores = [...new Set(rows.map((r) => r.componente).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const ordenValores = [...new Set(rows.map((r) => r.orden).filter((v): v is number => v != null))]
    .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) }));
  const descValores = [...new Set(rows.map((r) => r.descripcion).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const semanaValores = [...new Set(rows.map((r) => r.semana_plan).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const tecnicoValores = [...new Set(rows.flatMap((r) => splitTecnicos(r.tecnico)))].sort()
    .map((v) => ({ text: v, value: v }));
  const maquinaValores = [...new Set(rows.flatMap((r) => splitTecnicos(r.maquina)))].sort()
    .map((v) => ({ text: v, value: v }));
  const inicioValores = [...new Set(rows.map((r) => r.fecha_inicio).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: dayjs(v).format("DD/MM/YY HH:mm"), value: v }));
  const finValores = [...new Set(rows.map((r) => r.fecha_fin).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: dayjs(v).format("DD/MM/YY HH:mm"), value: v }));
  const inicioRealValores = [...new Set(rows.map((r) => r.fecha_inicio_real).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: dayjs(v).format("DD/MM HH:mm"), value: v }));
  const finRealValores = [...new Set(rows.map((r) => r.fecha_fin_real).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: dayjs(v).format("DD/MM HH:mm"), value: v }));
  const durEstValores = [...new Set(rows.map((r) => r.horas_estimadas).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: Number(v).toFixed(2), value: v }));
  const qtyValores = [...new Set(rows.map((r) => r.qty_personal ?? 1))]
    .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) }));
  const qtyHeValores = [...new Set(rows.map((r) => r.horas_extras_qty).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));
  const estadoValores = [...new Set(rows.map((r) => r.estado).filter(Boolean) as string[])].sort()
    .map((v) => ({ text: v, value: v }));

  const columns: ColumnsType<PlanRow> = [
    numeracionColumn<PlanRow>(),
    {
      title: "OT", key: "ot", width: 130, ellipsis: true,
      filters: otValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.ot === value,
      render: (_, r) => r.orden_trabajo?.ot
        ? (
          <Tag style={{
            background: brand.navy,
            color: brand.white,
            border: "none",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {r.orden_trabajo.ot}
          </Tag>
        )
        : <Tag>#{r.ot_id}</Tag>,
    },
    {
      title: "Cliente", key: "cliente", width: 140, ellipsis: true,
      filters: clienteValores, filterSearch: true,
      onFilter: (value, r) => (r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social) === value,
      render: (_, r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "-",
    },
    {
      title: "Flota", key: "flota", width: 100,
      filters: flotaValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.codigo_reparacion?.flota?.codigo === value,
      render: (_, r) => r.orden_trabajo?.codigo_reparacion?.flota?.codigo ?? "-",
    },
    {
      title: "Descripción", key: "otDesc", width: 200, ellipsis: true,
      filters: otDescValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.descripcion === value,
      render: (_, r) => r.orden_trabajo?.descripcion ?? "-",
    },
    {
      title: "F. Rec.", key: "recep", width: 95,
      sorter: (a, b) => (a.orden_trabajo?.fecha_recepcion ?? "").localeCompare(b.orden_trabajo?.fecha_recepcion ?? ""),
      filters: fechaRecepValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.fecha_recepcion === value,
      render: (_, r) => r.orden_trabajo?.fecha_recepcion ? formatDateOnlyShort(r.orden_trabajo.fecha_recepcion) : "-",
    },
    {
      title: "Prioridad", key: "prior", width: 110, align: "center",
      filters: prioridadValores,
      onFilter: (value, r) => r.orden_trabajo?.prioridad_atencion?.nombre === value,
      render: (_, r) => {
        const p = r.orden_trabajo?.prioridad_atencion;
        if (!p) return "-";
        const color = p.codigo === "1" ? "red" : p.codigo === "2" ? "orange" : p.codigo === "3" ? "cyan" : p.codigo === "E" ? "volcano" : "default";
        return <Tag color={color}>{p.nombre}</Tag>;
      },
    },
    {
      title: "Taller Status", key: "taller", width: 140, ellipsis: true,
      filters: tallerValores, filterSearch: true,
      onFilter: (value, r) => r.orden_trabajo?.taller_status?.nombre === value,
      render: (_, r) => r.orden_trabajo?.taller_status ? <Tag>{r.orden_trabajo.taller_status.nombre}</Tag> : "-",
    },
    {
      key: "orden", title: "N°", dataIndex: "orden", width: 50, align: "center",
      sorter: (a, b) => (a.orden ?? 0) - (b.orden ?? 0),
      filters: ordenValores, filterSearch: true,
      onFilter: (value, r) => String(r.orden ?? "") === value,
    },
    {
      key: "componente",
      title: "Parte", dataIndex: "componente", width: 140, ellipsis: true,
      filters: componenteValores, filterSearch: true,
      onFilter: (value, r) => r.componente === value,
      render: (v: string) => (
        <Tooltip title={v}>
          <Tag style={{
            background: brand.cyan,
            color: brand.white,
            border: "none",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: 0,
          }}>
            {v}
          </Tag>
        </Tooltip>
      ),
    },
    { key: "descripcion", title: "Tarea", dataIndex: "descripcion", width: 250, ellipsis: true,
      filters: descValores, filterSearch: true,
      onFilter: (value, r) => r.descripcion === value,
      render: (v: string) => {
        // Mostramos solo la descripción (sin el código abreviado tipo "DES - Desarmado")
        const desc = (v ?? "").trim();
        return <span style={{ fontSize: 12 }}>{desc}</span>;
      },
    },
    {
      key: "comentario", title: "Comentario", dataIndex: "comentario", width: 220, ellipsis: true,
      render: (v: string | null, r: PlanRow) => (
        <Typography.Paragraph
          style={{ margin: 0, fontSize: 12 }}
          editable={{
            tooltip: "Editar comentario (le llega al técnico)",
            text: v ?? "",
            onChange: (val) => {
              const nv = val.trim();
              if (nv !== (v ?? "")) persistPatch(r.id, { comentario: nv || null });
            },
          }}
        >
          {v || <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>}
        </Typography.Paragraph>
      ),
    },
    {
      title: "Semana", key: "semana", width: 160,
      filters: semanaValores, filterSearch: true,
      onFilter: (value, r) => r.semana_plan === value,
      render: (_, r) => (
        <Select
          value={r.semana_plan ?? undefined}
          onChange={(v) => updateField(r.id, { semana_plan: v ?? null })}
          options={semanaOpts}
          placeholder="—"
          allowClear
          size="small"
          style={{ width: "100%" }}
          showSearch
          filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
        />
      ),
    },
    {
      title: "Operario", key: "tecnico", width: 280,
      filters: tecnicoValores, filterSearch: true,
      onFilter: (value, r) => splitTecnicos(r.tecnico).includes(value as string),
      render: (_, r) => {
        const qty = Math.max(1, Number(r.qty_personal ?? 1));
        const multi = qty > 1;
        const actuales = splitTecnicos(r.tecnico);

        function aplicar(seleccionados: string[]) {
          // Si "Tercero" está en la selección, la tarea es terciarizada — limpiamos máquina.
          const esTercero = seleccionados.includes("Tercero");
          const tecnicoStr = joinTecnicos(seleccionados);
          const patch: Record<string, unknown> = { tecnico: tecnicoStr };
          if (esTercero) {
            patch.trabajo_externo = true;
            patch.maquina = null;
            // Si la tarea es terciarizada, solo guardamos "Tercero" (sin mezclar operarios reales).
            patch.tecnico = "Tercero";
          } else {
            patch.trabajo_externo = false;
            // Autocompletar máquina con el primer operario que tenga una asignada (si no hay máquina aún)
            if (seleccionados.length > 0 && !r.maquina) {
              for (const nombre of seleccionados) {
                const t = trabajadores.find((x) => x.nombre === nombre);
                if (t?.equipo_codigo) { patch.maquina = t.equipo_codigo; break; }
              }
            }
          }
          updateField(r.id, patch);
        }

        if (multi) {
          return (
            <Tooltip title={`Tarea con Qty=${qty} — podés asignar hasta ${qty} operario(s). Actual: ${actuales.join(", ") || "—"}`}>
              <Select
                mode="multiple"
                value={actuales}
                onChange={(v) => aplicar((v as string[]).slice(0, qty))}
                options={buildOpcionesOperario(r.semana_plan ?? filterSemana)}
                placeholder="—"
                size="small"
                // Mostramos todos los tags (sin colapsar). El alto de la fila crece si hay varios.
                style={{ width: "100%" }}
                showSearch
                filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
                tagRender={({ label, onClose }) => (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#E6F4FF",
                      color: "#1677FF",
                      borderRadius: 4,
                      padding: "1px 6px",
                      margin: "2px 2px 2px 0",
                      fontSize: 11,
                      maxWidth: "100%",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    <a onClick={onClose} style={{ color: "#1677FF", marginLeft: 2, fontWeight: 700 }}>×</a>
                  </span>
                )}
              />
            </Tooltip>
          );
        }
        return (
          <Select
            value={actuales[0]}
            onChange={(v) => aplicar(v ? [v] : [])}
            options={buildOpcionesOperario(r.semana_plan ?? filterSemana)}
            placeholder="—"
            allowClear
            size="small"
            style={{ width: "100%" }}
            showSearch
            filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
          />
        );
      },
    },
    {
      title: "Equipo", key: "maquina", width: 280,
      filters: maquinaValores, filterSearch: true,
      onFilter: (value, r) => splitTecnicos(r.maquina).includes(value as string),
      render: (_, r) => {
        const esTercero = r.tecnico === "Tercero";
        const qty = Math.max(1, Number(r.qty_personal ?? 1));
        const multi = qty > 1 && !esTercero;
        const actuales = splitTecnicos(r.maquina);

        if (esTercero) {
          return (
            <Tooltip title="Tarea terciarizada: no aplica equipo del taller.">
              <Select size="small" disabled placeholder="— (Tercero)" style={{ width: "100%" }} />
            </Tooltip>
          );
        }

        if (multi) {
          return (
            <Tooltip title={`Hasta ${qty} equipo(s). Actual: ${actuales.join(", ") || "—"}`}>
              <Select
                mode="multiple"
                value={actuales}
                onChange={(v) => updateField(r.id, { maquina: joinTecnicos((v as string[]).slice(0, qty)) })}
                options={buildOpcionesEquipo(r.semana_plan ?? filterSemana)}
                placeholder="—"
                size="small"
                style={{ width: "100%" }}
                showSearch
                filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
                tagRender={({ label, onClose }) => (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#F6FFED",
                      color: "#389E0D",
                      borderRadius: 4,
                      padding: "1px 6px",
                      margin: "2px 2px 2px 0",
                      fontSize: 11,
                      maxWidth: "100%",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    <a onClick={onClose} style={{ color: "#389E0D", marginLeft: 2, fontWeight: 700 }}>×</a>
                  </span>
                )}
              />
            </Tooltip>
          );
        }
        return (
          <Select
            value={actuales[0]}
            onChange={(v) => updateField(r.id, { maquina: v ?? null })}
            options={buildOpcionesEquipo(r.semana_plan ?? filterSemana)}
            placeholder="—"
            allowClear
            size="small"
            style={{ width: "100%" }}
            showSearch
            filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
          />
        );
      },
    },
    {
      title: "Inicio Est.", key: "inicio", width: 155,
      filters: inicioValores, filterSearch: true,
      onFilter: (value, r) => r.fecha_inicio === value,
      render: (_, r) => (
        <DatePicker
          value={r.fecha_inicio ? dayjs(r.fecha_inicio) : null}
          showTime={{ format: "HH:mm", defaultValue: DEFAULT_PICKER_TIME }}
          format={FECHA_FORMATOS}
          size="small"
          style={{ width: "100%" }}
          placeholder="3-5 13:00"
          onChange={(d: Dayjs | null) => {
            const patch = recalcularFin(r, { fecha_inicio: d ? d.toISOString() : null });
            updateField(r.id, patch as Record<string, unknown>);
          }}
          onBlur={(e) => {
            // Fallback: si el usuario escribió "3-5 13:" o similar y AntD no parseó, intentamos nosotros.
            const raw = (e.target as HTMLInputElement | null)?.value ?? "";
            if (!raw) return;
            // Si ya coincide con la fecha actual, no hacemos nada.
            const actual = r.fecha_inicio ? dayjs(r.fecha_inicio).format("DD/MM/YY HH:mm") : "";
            if (raw === actual) return;
            const parsed = parseFechaSmart(raw);
            if (parsed && parsed.isValid()) {
              const patch = recalcularFin(r, { fecha_inicio: parsed.toISOString() });
              updateField(r.id, patch as Record<string, unknown>);
            }
          }}
        />
      ),
    },
    {
      title: "Dur. (hrs)", key: "dur", width: 90, align: "right",
      filters: durEstValores, filterSearch: true,
      onFilter: (value, r) => String(r.horas_estimadas ?? "") === value,
      render: (_, r) => (
        <InputNumber
          value={r.horas_estimadas != null ? Number(r.horas_estimadas) : undefined}
          min={0}
          step={0.5}
          size="small"
          style={{ width: "100%" }}
          onChange={(v) => {
            const patch = recalcularFin(r, { horas_estimadas: v == null ? null : String(v) });
            updateField(r.id, patch as Record<string, unknown>);
          }}
        />
      ),
    },
    {
      title: "HE", key: "he", width: 55, align: "center",
      filters: [
        { text: "Sí", value: "true" },
        { text: "No", value: "false" },
      ],
      onFilter: (value, r) => String(!!r.horas_extras) === value,
      render: (_, r) => (
        <Checkbox
          checked={!!r.horas_extras}
          onChange={(e) => {
            const checked = e.target.checked;
            if (checked) {
              // Al marcar: HE=true + auto-set Qty HE a 1 si está vacío
              // (el backend exige Qty HE > 0 cuando HE está activo).
              const qtyActual = r.horas_extras_qty != null ? Number(r.horas_extras_qty) : 0;
              const patch: Record<string, unknown> = { horas_extras: true };
              if (!(qtyActual > 0)) patch.horas_extras_qty = "1";
              updateField(r.id, patch);
            } else {
              // Al desmarcar: HE=false + limpiar Qty HE + recalcular Fin.
              const patch = recalcularFin({ ...r, horas_extras: false }, { horas_extras: false });
              (patch as Record<string, unknown>).horas_extras_qty = null;
              updateField(r.id, patch as Record<string, unknown>);
            }
          }}
        />
      ),
    },
    {
      title: "Qty HE", key: "qtyhe", width: 80, align: "right",
      filters: qtyHeValores, filterSearch: true,
      onFilter: (value, r) => String(r.horas_extras_qty ?? "") === value,
      render: (_, r) => (
        <InputNumber
          value={r.horas_extras_qty != null ? Number(r.horas_extras_qty) : undefined}
          min={0}
          step={0.5}
          size="small"
          disabled={!r.horas_extras}
          style={{ width: "100%" }}
          onChange={(v) => updateField(r.id, { horas_extras_qty: v == null ? null : String(v) })}
        />
      ),
    },
    {
      title: "Fin Est.", key: "fin", width: 155,
      filters: finValores, filterSearch: true,
      onFilter: (value, r) => r.fecha_fin === value,
      render: (_, r) => {
        // Con HE activo: editable manual. Sin HE: calculado (solo lectura).
        if (r.horas_extras) {
          return (
            <DatePicker
              value={r.fecha_fin ? dayjs(r.fecha_fin) : null}
              showTime={{ format: "HH:mm", defaultValue: DEFAULT_PICKER_TIME }}
              format={FECHA_FORMATOS}
              size="small"
              style={{ width: "100%" }}
              placeholder="3-5 13:00"
              onChange={(d: Dayjs | null) => updateField(r.id, { fecha_fin: d ? d.toISOString() : null })}
              onBlur={(e) => {
                const raw = (e.target as HTMLInputElement | null)?.value ?? "";
                if (!raw) return;
                const actual = r.fecha_fin ? dayjs(r.fecha_fin).format("DD/MM/YY HH:mm") : "";
                if (raw === actual) return;
                const parsed = parseFechaSmart(raw);
                if (parsed && parsed.isValid()) {
                  updateField(r.id, { fecha_fin: parsed.toISOString() });
                }
              }}
            />
          );
        }
        return (
          <span style={{ fontSize: 11, color: brand.textSecondary }}>
            {r.fecha_fin ? dayjs(r.fecha_fin).format("DD/MM/YY HH:mm") : "—"}
          </span>
        );
      },
    },
    {
      title: "Qty", key: "qty", width: 60, align: "center",
      filters: qtyValores, filterSearch: true,
      onFilter: (value, r) => String(r.qty_personal ?? 1) === value,
      render: (_, r) => (
        <InputNumber
          value={r.qty_personal ?? 1}
          min={1}
          step={1}
          size="small"
          style={{ width: "100%" }}
          onChange={(v) => {
            const patch = recalcularFin(r, { qty_personal: v == null ? 1 : Number(v) });
            updateField(r.id, patch as Record<string, unknown>);
          }}
        />
      ),
    },
    {
      title: "HH", key: "hh", width: 70, align: "right",
      render: (_, r) => {
        const hh = calcularHH({
          duracionHrs: Number(r.horas_estimadas ?? 0),
          qtyPersonal: r.qty_personal ?? 1,
          horasExtras: r.horas_extras ?? false,
          horasExtrasQty: r.horas_extras_qty != null ? Number(r.horas_extras_qty) : 0,
        });
        return <strong>{hh.toFixed(2)}</strong>;
      },
    },
    {
      key: "fecha_inicio_real",
      title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 110,
      sorter: (a, b) => (a.fecha_inicio_real || "").localeCompare(b.fecha_inicio_real || ""),
      filters: inicioRealValores, filterSearch: true,
      onFilter: (value, r) => r.fecha_inicio_real === value,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11, color: brand.success }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "fecha_fin_real",
      title: "Fin Real", dataIndex: "fecha_fin_real", width: 110,
      sorter: (a, b) => (a.fecha_fin_real || "").localeCompare(b.fecha_fin_real || ""),
      filters: finRealValores, filterSearch: true,
      onFilter: (value, r) => r.fecha_fin_real === value,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11, color: brand.success }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Dur. Real", key: "dur_real", width: 80, align: "right",
      render: (_, r) => {
        if (r.fecha_inicio_real && r.fecha_fin_real) {
          const h = dayjs(r.fecha_fin_real).diff(dayjs(r.fecha_inicio_real), "minute") / 60;
          return <strong>{h.toFixed(2)}</strong>;
        }
        return <span style={{ color: brand.textSecondary }}>—</span>;
      },
    },
    {
      title: "Estado", key: "estado", width: 130,
      filters: estadoValores, filterSearch: true,
      onFilter: (value, r) => (r.estado ?? "abierto") === value,
      render: (_, r) => (
        <Select
          value={r.estado ?? "abierto"}
          onChange={(v) => updateField(r.id, { estado: v })}
          options={estados.map((e) => ({ value: e.codigo, label: e.nombre }))}
          size="small"
          style={{ width: "100%" }}
          disabled={r.estado === "realizado"}
        />
      ),
    },
  ];

  // Opciones para los filtros del header. ANTES se calculaban desde `rows`, lo
  // cual era un bug: al filtrar por operario X, el dropdown quedaba con solo X
  // (porque `rows` ya venía filtrado del backend) y no se podía cambiar a otro.
  // Ahora usamos los catálogos completos (`trabajadores`, `equipos`).
  const tecnicosUnicos = useMemo(() => {
    const s = new Set<string>(trabajadores.map((t) => t.nombre));
    // Añadir valores presentes en rows que ya no estén en el catálogo (legacy /
    // operarios que perdieron su puesto técnico), para no esconder filas viejas.
    for (const r of rows) for (const t of splitTecnicos(r.tecnico)) s.add(t);
    return [...s].sort();
  }, [trabajadores, rows]);

  const equiposUnicos = useMemo(() => {
    const s = new Set<string>(equipos.map((e) => e.codigo));
    for (const r of rows) for (const m of splitTecnicos(r.maquina)) s.add(m);
    return [...s].sort();
  }, [equipos, rows]);

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<PlanRow>(columns, "planificacion-cols-widths-v1");

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Planificación
        </Typography.Title>
        <Space size="middle" wrap>
          <Button
            type={editMode ? "default" : "primary"}
            danger={editMode}
            onClick={toggleEditMode}
            disabled={!editMode && !lock.canEdit}
            title={!lock.canEdit && lock.lockedBy ? `Editando: ${lock.lockedBy}` : undefined}
          >
            {editMode ? "Salir de edición" : "Modo edición"}
          </Button>
          <span style={{ fontSize: 12, color: brand.textSecondary }}>
            <ThunderboltOutlined style={{ marginRight: 4 }} />
            Autoguardar
            <Switch
              size="small"
              checked={autoSave}
              onChange={(checked) => {
                if (!checked && cambiosPendientesCount > 0) return;
                if (checked && cambiosPendientesCount > 0) {
                  messageApi.warning("Guardá o descartá los cambios pendientes antes de cambiar el modo.");
                  return;
                }
                setAutoSave(checked);
              }}
              style={{ marginLeft: 8 }}
            />
          </span>
          {!autoSave && (
            <>
              <Tag color={cambiosPendientesCount > 0 ? "warning" : "default"} style={{ fontWeight: 600 }}>
                {cambiosPendientesCount} cambio{cambiosPendientesCount === 1 ? "" : "s"} pendiente{cambiosPendientesCount === 1 ? "" : "s"}
              </Tag>
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                onClick={guardarTodo}
                loading={savingBatch}
                disabled={cambiosPendientesCount === 0}
              >
                Guardar {cambiosPendientesCount > 0 ? cambiosPendientesCount : ""}
              </Button>
              <Popconfirm
                title="¿Descartar todos los cambios?"
                onConfirm={descartarTodo}
                okText="Sí, descartar"
                cancelText="No"
                disabled={cambiosPendientesCount === 0}
              >
                <Button
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={cambiosPendientesCount === 0}
                  danger
                >
                  Descartar
                </Button>
              </Popconfirm>
            </>
          )}
          <ColumnasToggleButton<PlanRow>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "ot", "descripcion"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <span style={{ fontSize: 12, color: brand.textSecondary }}>
            {total} tareas {savingId ? " · guardando…" : ""}
          </span>
        </Space>
      </div>

      {!lock.isOwner && lock.lockedBy && (
        <Alert
          type="warning"
          showIcon
          message={`${lock.lockedBy} está editando la planificación`}
          description="Solo podés ver hasta que termine. Si se quedó colgado el lock se libera solo a los 3 minutos."
          style={{ marginBottom: 12 }}
        />
      )}

      <Alert
        type="info"
        icon={<InfoCircleOutlined />}
        showIcon
        title="Jornada: L–V 08:00 – 18:00, descanso de almuerzo 12:30 – 13:30"
        description="Fin Estimado se calcula automáticamente respetando esta agenda (las horas extras no se incluyen en el cálculo)."
        style={{ marginBottom: 12 }}
      />

      <Card styles={{ body: { padding: 12 } }} style={{ marginBottom: 12 }}>
        <Row gutter={[12, 8]}>
          <Col xs={24} md={6}>
            <Input
              placeholder="OT, operación, descripción..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="Semana" allowClear showSearch style={{ width: "100%" }}
              value={filterSemana}
              onChange={setFilterSemana}
              options={semanaOpts}
              filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select placeholder="Estado" allowClear style={{ width: "100%" }}
              value={filterEstado}
              onChange={setFilterEstado}
              options={estados.map((e) => ({ value: e.codigo, label: e.nombre }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="Operario" allowClear showSearch style={{ width: "100%" }}
              value={filterTecnico}
              onChange={setFilterTecnico}
              options={tecnicosUnicos.map((t) => ({ value: t, label: t }))}
              filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
            />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="Equipo" allowClear showSearch style={{ width: "100%" }}
              value={filterMaquina}
              onChange={setFilterMaquina}
              options={equiposUnicos.map((cod) => {
                const eq = equipos.find((e) => e.codigo === cod);
                const label = eq ? `${eq.descripcion} — ${eq.codigo}` : cod;
                return { value: cod, label };
              })}
              filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
            />
          </Col>
          <Col xs={24} md={3}>
            <Button icon={<ReloadOutlined />} onClick={() => {
              setSearch(""); setFilterSemana(undefined); setFilterEstado(undefined);
              setFilterTecnico(undefined); setFilterMaquina(undefined);
            }} block>Limpiar</Button>
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha de inicio" value={rangoInicio} onChange={setRangoInicio} />
          </Col>
          <Col xs={24} md={12}>
            <RangoFechasFiltro label="Fecha de fin" value={rangoFin} onChange={setRangoFin} />
          </Col>
        </Row>
      </Card>

      {selectedKeys.length > 0 && (
        <Card
          size="small"
          styles={{ body: { padding: 12 } }}
          style={{ marginBottom: 12, borderColor: brand.cyan, background: "#E6FFFB" }}
        >
          <Row gutter={[12, 8]} align="middle">
            <Col flex="0 0 auto">
              <Tag color={brand.cyan} style={{ fontWeight: 600, fontSize: 13, padding: "4px 10px" }}>
                {selectedKeys.length} seleccionada{selectedKeys.length === 1 ? "" : "s"}
              </Tag>
            </Col>
            <Col flex="1 1 220px">
              <Select
                placeholder="Cambiar Operario a…"
                value={bulkTecnico}
                onChange={(v) => setBulkTecnico(v)}
                options={buildOpcionesOperario(bulkSemana ?? filterSemana)}
                allowClear
                showSearch
                style={{ width: "100%" }}
                filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
              />
            </Col>
            <Col flex="1 1 220px">
              <Select
                placeholder="Cambiar Equipo a…"
                value={bulkMaquina}
                onChange={(v) => setBulkMaquina(v)}
                options={buildOpcionesEquipo(bulkSemana ?? filterSemana)}
                allowClear
                showSearch
                style={{ width: "100%" }}
                filterOption={(i, o) => ((o as { search?: string })?.search ?? String(o?.value ?? "")).toLowerCase().includes(i.toLowerCase())}
              />
            </Col>
            <Col flex="1 1 220px">
              <Select
                placeholder="Cambiar Semana a…"
                value={bulkSemana}
                onChange={(v) => setBulkSemana(v)}
                options={semanaOpts}
                allowClear
                showSearch
                style={{ width: "100%" }}
                filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
              />
            </Col>
            <Col flex="0 0 auto">
              <Space>
                <Button type="primary" onClick={aplicarBulk}>
                  Aplicar
                </Button>
                <Button onClick={() => {
                  setSelectedKeys([]);
                  setBulkTecnico(undefined);
                  setBulkMaquina(undefined);
                  setBulkSemana(undefined);
                }}>
                  Cancelar
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <TableDragWrapper>
              <Table
          rowKey="id"
          columns={visibleColumns(columnsResizable, ocultas)}
          components={tableComponents}
          dataSource={rows.filter((r) =>
            dentroDeRango(r, "fecha_inicio", rangoInicio) &&
            dentroDeRango(r, "fecha_fin", rangoFin)
          )}
          loading={loading}
          size="small"
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: rows.filter((r) => dentroDeRango(r, "fecha_inicio", rangoInicio) && dentroDeRango(r, "fecha_fin", rangoFin)).length,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "tareas",
          })}
          scroll={{ x: 2400 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as number[]),
            getCheckboxProps: (r) => ({ disabled: r.estado === "realizado" }),
            fixed: true,
          }}
          rowClassName={(r) => {
            if (pendingChanges[r.id]) return "plan-row-pending";
            if (r.estado === "realizado") return "plan-row-done";
            if (r.estado === "cancelado") return "plan-row-cancel";
            return "";
          }}
        />
      </TableDragWrapper>

      <style jsx global>{`
        /* Color de fila por estado — solo celdas NO fijas. Las celdas fijas
           (NRO, OT) se quedan siempre blancas opacas para que nada se vea por detrás.
           NOTA: antd 6 renombró las clases de columnas fijas a fix-start/fix-end. */
        .plan-row-done > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #F6FFED !important;
        }
        .plan-row-cancel > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #FFF1F0 !important;
          color: #999 !important;
          text-decoration: line-through;
        }
        .plan-row-pending > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #FFFBE6 !important;
          box-shadow: inset 3px 0 0 #FAAD14;
        }
        /* Hover: oscurecer color de fondo de celdas no-fijas; las fijas se manejan en globals.css. */
        .ant-table-tbody > tr.plan-row-done:hover > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #d9f7be !important;
        }
        .ant-table-tbody > tr.plan-row-cancel:hover > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #ffccc7 !important;
        }
        .ant-table-tbody > tr.plan-row-pending:hover > td:not(.ant-table-cell-fix-start):not(.ant-table-cell-fix-end) {
          background-color: #fff1b8 !important;
        }
        /* Las celdas fijas: SIEMPRE blanco opaco. Cubrimos todas las variantes
           que usa antd v6 para hover (clase, :hover, row-hover) y para filas
           con coloreado de estado. */
        .ant-table-tbody > tr > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr:hover > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr:hover > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.ant-table-row-hover > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.ant-table-row-hover > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr > td.ant-table-cell-fix-start.ant-table-cell-row-hover,
        .ant-table-tbody > tr > td.ant-table-cell-fix-end.ant-table-cell-row-hover,
        .ant-table-tbody > tr.plan-row-done > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-done > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.plan-row-cancel > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-cancel > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.plan-row-pending > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-pending > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.plan-row-done:hover > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-done:hover > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.plan-row-cancel:hover > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-cancel:hover > td.ant-table-cell-fix-end,
        .ant-table-tbody > tr.plan-row-pending:hover > td.ant-table-cell-fix-start,
        .ant-table-tbody > tr.plan-row-pending:hover > td.ant-table-cell-fix-end {
          background-color: #ffffff !important;
        }
      `}</style>
    </div>
  );
}

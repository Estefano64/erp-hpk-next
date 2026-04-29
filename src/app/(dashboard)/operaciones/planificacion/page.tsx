"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Typography, Card, Table, Tag, Input, Select, Space, Button, DatePicker, InputNumber, Checkbox, message, Row, Col, Alert, Switch, Popconfirm,
} from "antd";
import { SearchOutlined, ReloadOutlined, CalendarOutlined, InfoCircleOutlined, SaveOutlined, UndoOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";
import { calcularFinEstimado, calcularHH } from "@/lib/planification-hours";
import { useTabSync } from "@/lib/useTabSync";

dayjs.extend(isoWeek);

interface PlanRow {
  id: number;
  ot_id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
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

interface TrabajadorOpt { trabajador_id: number; nombre: string; area: string; puesto: string }
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
  const [rows, setRows] = useState<PlanRow[]>([]);
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
        fetch("/api/trabajadores?limit=200"),
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
      const current = rows.find((r) => r.id === id);
      const res = await fetch(`/api/planificacion/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, version: current?.version }),
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
      const json = await res.json().catch(() => null);
      if (json?.data) {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...json.data } : r));
      } else {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
      }
      notifySync();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingId(null);
    }
  }, [messageApi, rows, fetchData, notifySync]);

  const updateField = useCallback((id: number, patch: Record<string, unknown>) => {
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
  }, [persistPatch, autoSave]);

  const guardarTodo = useCallback(async () => {
    const ids = Object.keys(pendingChanges).map(Number);
    if (ids.length === 0) return;
    setSavingBatch(true);
    let okCount = 0;
    let conflictCount = 0;
    let errorCount = 0;
    for (const id of ids) {
      const patch = pendingChanges[id];
      const current = rows.find((r) => r.id === id);
      try {
        const res = await fetch(`/api/planificacion/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, version: current?.version }),
        });
        if (res.status === 409) { conflictCount++; continue; }
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
    if (conflictCount > 0) messageApi.warning(`${conflictCount} con conflicto de versión.`);
    if (errorCount > 0) messageApi.error(`${errorCount} con error al guardar.`);
    notifySync();
    fetchData();
  }, [pendingChanges, rows, messageApi, notifySync, fetchData]);

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
    if (bulkTecnico !== undefined) patch.tecnico = bulkTecnico ?? null;
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
      if (r.tecnico) {
        if (!op.has(semana)) op.set(semana, new Map());
        const m = op.get(semana)!;
        m.set(r.tecnico, (m.get(r.tecnico) ?? 0) + hh);
      }
      if (r.maquina) {
        if (!eq.has(semana)) eq.set(semana, new Map());
        const m = eq.get(semana)!;
        m.set(r.maquina, (m.get(r.maquina) ?? 0) + hh);
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

  // Construye opciones con badge de carga si hay una semana de referencia
  function buildOpcionesOperario(semanaRef: string | null | undefined) {
    const cargaMap = semanaRef ? cargaIndex.op.get(semanaRef) : null;
    return trabajadores.map((t) => {
      const hh = cargaMap?.get(t.nombre) ?? 0;
      const showCarga = !!cargaMap;
      return {
        value: t.nombre,
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
  }

  function buildOpcionesEquipo(semanaRef: string | null | undefined) {
    const cargaMap = semanaRef ? cargaIndex.eq.get(semanaRef) : null;
    return equipos.map((e) => {
      const hh = cargaMap?.get(e.codigo) ?? 0;
      const showCarga = !!cargaMap;
      return {
        value: e.codigo,
        label: showCarga ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%" }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.codigo} <span style={{ color: brand.textSecondary }}>— {e.descripcion}</span>
            </span>
            <Tag color={cargaColor(hh)} style={{ fontSize: 10, margin: 0, lineHeight: "16px" }}>
              {hh.toFixed(0)}/{CAPACIDAD_SEMANA}h
            </Tag>
          </span>
        ) : `${e.codigo} — ${e.descripcion}`,
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

  const columns: ColumnsType<PlanRow> = [
    {
      title: "OT", key: "ot", width: 100, fixed: "left",
      render: (_, r) => r.orden_trabajo?.ot
        ? <Tag color={brand.navy}>{r.orden_trabajo.ot}</Tag>
        : <Tag>#{r.ot_id}</Tag>,
    },
    {
      title: "Cliente", key: "cliente", width: 140, ellipsis: true,
      render: (_, r) => r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "-",
    },
    {
      title: "Flota", key: "flota", width: 100,
      render: (_, r) => r.orden_trabajo?.codigo_reparacion?.flota?.codigo ?? "-",
    },
    {
      title: "Descripción", key: "otDesc", width: 200, ellipsis: true,
      render: (_, r) => r.orden_trabajo?.descripcion ?? "-",
    },
    {
      title: "F. Rec.", key: "recep", width: 95,
      render: (_, r) => r.orden_trabajo?.fecha_recepcion ? dayjs(r.orden_trabajo.fecha_recepcion).format("DD/MM/YY") : "-",
    },
    {
      title: "Prioridad", key: "prior", width: 110, align: "center",
      render: (_, r) => {
        const p = r.orden_trabajo?.prioridad_atencion;
        if (!p) return "-";
        const color = p.codigo === "1" ? "red" : p.codigo === "2" ? "orange" : p.codigo === "3" ? "cyan" : p.codigo === "E" ? "volcano" : "default";
        return <Tag color={color}>{p.nombre}</Tag>;
      },
    },
    {
      title: "Taller Status", key: "taller", width: 140, ellipsis: true,
      render: (_, r) => r.orden_trabajo?.taller_status ? <Tag>{r.orden_trabajo.taller_status.nombre}</Tag> : "-",
    },
    { title: "N°", dataIndex: "orden", width: 50, align: "center" },
    {
      title: "Parte", dataIndex: "componente", width: 100,
      render: (v: string) => <Tag color={brand.cyan}>{v}</Tag>,
    },
    { title: "Tarea", dataIndex: "descripcion", width: 250, ellipsis: true,
      render: (v: string, r) => {
        const code = (r.operacion_codigo ?? "").trim();
        const desc = (v ?? "").trim();
        const isFallback = !code || code === "EVAL" || code === "CUSTOM" || code.toLowerCase() === desc.toLowerCase();
        return <span style={{ fontSize: 12 }}>{isFallback ? desc : `${code} - ${desc}`}</span>;
      },
    },
    {
      title: "Semana", key: "semana", width: 160,
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
      title: "Operario", key: "tecnico", width: 220,
      render: (_, r) => (
        <Select
          value={r.tecnico ?? undefined}
          onChange={(v) => updateField(r.id, { tecnico: v ?? null })}
          options={buildOpcionesOperario(r.semana_plan ?? filterSemana)}
          placeholder="—"
          allowClear
          size="small"
          style={{ width: "100%" }}
          showSearch
          filterOption={(i, o) => String(o?.value ?? "").toLowerCase().includes(i.toLowerCase())}
        />
      ),
    },
    {
      title: "Equipo", key: "maquina", width: 220,
      render: (_, r) => (
        <Select
          value={r.maquina ?? undefined}
          onChange={(v) => updateField(r.id, { maquina: v ?? null })}
          options={buildOpcionesEquipo(r.semana_plan ?? filterSemana)}
          placeholder="—"
          allowClear
          size="small"
          style={{ width: "100%" }}
          showSearch
          filterOption={(i, o) => String(o?.value ?? "").toLowerCase().includes(i.toLowerCase())}
        />
      ),
    },
    {
      title: "Inicio Est.", key: "inicio", width: 155,
      render: (_, r) => (
        <DatePicker
          value={r.fecha_inicio ? dayjs(r.fecha_inicio) : null}
          showTime={{ format: "HH:mm" }}
          format="DD/MM/YY HH:mm"
          size="small"
          style={{ width: "100%" }}
          onChange={(d: Dayjs | null) => {
            const patch = recalcularFin(r, { fecha_inicio: d ? d.toISOString() : null });
            updateField(r.id, patch as Record<string, unknown>);
          }}
        />
      ),
    },
    {
      title: "Dur. (hrs)", key: "dur", width: 90, align: "right",
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
      render: (_, r) => (
        <Checkbox
          checked={!!r.horas_extras}
          onChange={(e) => {
            const checked = e.target.checked;
            // Al marcar: deja editar Fin manualmente. Al desmarcar: recalcular.
            const patch = checked
              ? { horas_extras: true }
              : recalcularFin({ ...r, horas_extras: false }, { horas_extras: false });
            updateField(r.id, patch as Record<string, unknown>);
          }}
        />
      ),
    },
    {
      title: "Qty HE", key: "qtyhe", width: 80, align: "right",
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
      render: (_, r) => {
        // Con HE activo: editable manual. Sin HE: calculado (solo lectura).
        if (r.horas_extras) {
          return (
            <DatePicker
              value={r.fecha_fin ? dayjs(r.fecha_fin) : null}
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YY HH:mm"
              size="small"
              style={{ width: "100%" }}
              onChange={(d: Dayjs | null) => updateField(r.id, { fecha_fin: d ? d.toISOString() : null })}
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
      title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 110,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11, color: brand.success }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      title: "Fin Real", dataIndex: "fecha_fin_real", width: 110,
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

  const tecnicosUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.tecnico) s.add(r.tecnico);
    return [...s].sort();
  }, [rows]);

  const equiposUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.maquina) s.add(r.maquina);
    return [...s].sort();
  }, [rows]);

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          <CalendarOutlined style={{ marginRight: 8 }} />
          Planificación
        </Typography.Title>
        <Space size="middle" wrap>
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
          <span style={{ fontSize: 12, color: brand.textSecondary }}>
            {total} tareas {savingId ? " · guardando…" : ""}
          </span>
        </Space>
      </div>

      <Alert
        type="info"
        icon={<InfoCircleOutlined />}
        showIcon
        message="Jornada: L–V 08:00 – 18:00, descanso de almuerzo 12:30 – 13:30"
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
              options={equiposUnicos.map((e) => ({ value: e, label: e }))}
              filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
            />
          </Col>
          <Col xs={24} md={3}>
            <Button icon={<ReloadOutlined />} onClick={() => {
              setSearch(""); setFilterSemana(undefined); setFilterEstado(undefined);
              setFilterTecnico(undefined); setFilterMaquina(undefined);
            }} block>Limpiar</Button>
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
                filterOption={(i, o) => String(o?.value ?? "").toLowerCase().includes(i.toLowerCase())}
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
                filterOption={(i, o) => String(o?.value ?? "").toLowerCase().includes(i.toLowerCase())}
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

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showTotal: (t) => `${t} tareas` }}
        scroll={{ x: 2400, y: 600 }}
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

      <style jsx global>{`
        .plan-row-done > td { background: #F6FFED !important; }
        .plan-row-cancel > td { background: #FFF1F0 !important; color: #999 !important; text-decoration: line-through; }
        .plan-row-pending > td { background: #FFFBE6 !important; box-shadow: inset 3px 0 0 #FAAD14; }
      `}</style>
    </div>
  );
}

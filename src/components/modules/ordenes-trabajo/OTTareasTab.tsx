"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button, Card, Col, Empty, Input, Popconfirm, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography, message,
} from "antd";
import {
  PlusOutlined, UnorderedListOutlined, EditOutlined, DeleteOutlined, CloseOutlined,
  PlayCircleOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useTabSync } from "@/lib/useTabSync";
import { formatDateOnlyShort } from "@/lib/dates";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";

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
interface TrabajadorOpt {
  trabajador_id: number;
  nombre: string;
  puesto: string;
  equipo_codigo: string | null;
}

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
  const [componentes, setComponentes] = useState<ComponenteOpt[]>([]);
  const [operaciones, setOperaciones] = useState<OperacionOpt[]>([]);
  const [equipos, setEquipos] = useState<EquipoOpt[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  const [estadosCat, setEstadosCat] = useState<StatusTareaOpt[]>([]);
  // Borradores de tareas a crear en lote (multi-fila en el form de "Nueva Tarea").
  type DraftTarea = {
    id: string; // uuid local
    parte: string | null;
    tipo_tarea: string;
    operacion_codigo: string | null;
    trabajo_manual: string | null;
    // Si el usuario eligió "+ Crear nueva" en el combobox de NoEstandar, guardamos
    // el nombre acá. Al guardar, primero creamos la operación en catálogo, conseguimos
    // el código auto-generado (NS-NNNN) y lo usamos en la planificación.
    nueva_operacion_nombre: string | null;
    qty: number;
    tecnico: string | null;
    equipo: string | null;
  };
  const newDraft = (): DraftTarea => ({
    id: crypto.randomUUID(),
    parte: null,
    tipo_tarea: "Estandar",
    operacion_codigo: null,
    trabajo_manual: null,
    nueva_operacion_nombre: null,
    qty: 1,
    tecnico: null,
    equipo: null,
  });
  const [draftRows, setDraftRows] = useState<DraftTarea[]>([]);
  function updateDraft(id: string, patch: Partial<DraftTarea>) {
    setDraftRows((prev) => prev.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, ...patch };
      // Si cambió parte o tipo_tarea, limpiamos selección de operación/texto libre
      if (patch.parte !== undefined && patch.parte !== d.parte) {
        next.operacion_codigo = null;
        next.trabajo_manual = null;
        next.nueva_operacion_nombre = null;
      }
      if (patch.tipo_tarea !== undefined && patch.tipo_tarea !== d.tipo_tarea) {
        next.operacion_codigo = null;
        next.trabajo_manual = null;
        next.nueva_operacion_nombre = null;
      }
      return next;
    }));
  }
  function addDraft() {
    setDraftRows((prev) => [...prev, newDraft()]);
  }
  function removeDraft(id: string) {
    setDraftRows((prev) => prev.filter((d) => d.id !== id));
  }

  /**
   * Atajo "Jalar todas las tareas {tipo} de {parte}": reemplaza el draft origen
   * por N nuevos drafts pre-llenos, uno por cada operación que matchea
   * (parte, clasificación). No guarda automáticamente — el usuario revisa y
   * después confirma con "Guardar". Filtra duplicados con drafts ya activos.
   */
  function loadAllForRow(rowId: string) {
    setDraftRows((prev) => {
      const source = prev.find((d) => d.id === rowId);
      if (!source || !source.parte) return prev;
      const clas = source.tipo_tarea === "NoEstandar" ? "NO_STD" : "STD";
      const candidatas = operaciones.filter((o) => o.componente_codigo === source.parte && o.clasificacion === clas);
      // Códigos ya usados en otros drafts activos para esa misma parte (evita duplicar)
      const yaUsados = new Set(
        prev
          .filter((d) => d.id !== rowId && d.parte === source.parte && d.operacion_codigo)
          .map((d) => d.operacion_codigo as string),
      );
      const nuevas = candidatas.filter((o) => !yaUsados.has(o.codigo));
      if (nuevas.length === 0) {
        messageApi.warning("Todas las tareas de esa parte+tipo ya están en la lista de drafts.");
        return prev;
      }
      const generados: DraftTarea[] = nuevas.map((o) => ({
        ...newDraft(),
        parte: source.parte,
        tipo_tarea: source.tipo_tarea,
        operacion_codigo: o.codigo,
      }));
      // Reemplaza el draft origen (incompleto) por los generados, conserva el resto.
      const sinSource = prev.filter((d) => d.id !== rowId);
      messageApi.success(`${generados.length} tarea(s) cargada(s). Revisá y guardá cuando estés listo.`);
      return [...sinSource, ...generados];
    });
  }
  const [messageApi, contextHolder] = message.useMessage();
  const { ocultas, setOcultas } = useColumnasOcultas("ot-tareas-cols-v1");
  const { rango: rangoInicio, setRango: setRangoInicio } = useRangoFechas();
  const { rango: rangoFin, setRango: setRangoFin } = useRangoFechas();

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
        const [resC, resO, resE, resS, resT] = await Promise.all([
          fetch("/api/catalogos?tabla=componente"),
          fetch("/api/catalogos?tabla=operacionReparacion"),
          fetch("/api/equipos?limit=200&tipo=MAQ"),
          fetch("/api/catalogos?tabla=statusTarea"),
          fetch("/api/trabajadores?limit=200&soloOperarios=1"),
        ]);
        const jsonC = await resC.json();
        const jsonO = await resO.json();
        const jsonE = await resE.json();
        const jsonS = await resS.json();
        const jsonT = await resT.json();
        setComponentes(jsonC.data ?? []);
        setOperaciones(jsonO.data ?? []);
        setEquipos((jsonE.data ?? []).map((e: { codigo: string; descripcion: string }) => ({ codigo: e.codigo, descripcion: e.descripcion })));
        setEstadosCat(jsonS.data ?? []);
        setTrabajadores(jsonT.data ?? []);
      } catch (e) {
        console.error("Error cargando catálogos Tareas:", e);
      }
    })();
  }, []);

  function openForm() {
    setDraftRows([newDraft()]);
    setFormOpen(true);
  }

  function cerrarForm() {
    setFormOpen(false);
    setDraftRows([]);
  }

  // Devuelve si la fila necesita texto libre (parte sin operaciones del tipo seleccionado).
  function usaTextoLibrePara(d: DraftTarea): boolean {
    if (!d.parte) return false;
    const clas = d.tipo_tarea === "NoEstandar" ? "NO_STD" : "STD";
    const matches = operaciones.filter((o) => o.componente_codigo === d.parte && o.clasificacion === clas);
    return matches.length === 0;
  }

  async function saveAllTareas() {
    // Validar
    const errs: string[] = [];
    for (const [idx, d] of draftRows.entries()) {
      const label = `Tarea ${idx + 1}`;
      if (!d.parte) errs.push(`${label}: falta Parte`);
      if (!d.tipo_tarea) errs.push(`${label}: falta Tipo`);
      const libre = usaTextoLibrePara(d);
      const tieneNueva = !!d.nueva_operacion_nombre?.trim();
      if (libre && !d.trabajo_manual?.trim()) errs.push(`${label}: falta descripción (texto libre)`);
      if (!libre && !d.operacion_codigo && !tieneNueva) errs.push(`${label}: falta seleccionar tarea`);
    }
    if (errs.length > 0) {
      messageApi.error(errs[0]);
      return;
    }
    setSaving(true);
    let ok = 0;
    let fail = 0;
    let nuevasOps = 0;
    try {
      for (const d of draftRows) {
        let operacionCodigo = d.operacion_codigo;
        // Si el usuario tipeó una operación nueva, la creamos primero en el catálogo
        if (d.nueva_operacion_nombre && !operacionCodigo) {
          const resOp = await fetch("/api/operaciones-reparacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nombre: d.nueva_operacion_nombre.trim(),
              componente_codigo: d.parte,
              clasificacion: d.tipo_tarea === "NoEstandar" ? "NO_STD" : "STD",
            }),
          });
          if (!resOp.ok) {
            fail++;
            continue;
          }
          const j = await resOp.json();
          operacionCodigo = j.data.codigo;
          if (!j.reused) {
            nuevasOps++;
            // Sumar a la lista local para que se vea en futuras selecciones sin recargar
            setOperaciones((prev) => [...prev, j.data]);
          }
        }
        const body: Record<string, unknown> = {
          ot_id: otId,
          componente_codigo: d.parte,
          tipo_reparacion: d.tipo_tarea ?? "Estandar",
          qty: Number(d.qty ?? 1),
          maquina: d.equipo ?? null,
          tecnico: d.tecnico ?? null,
        };
        if (usaTextoLibrePara(d)) {
          body.trabajo = d.trabajo_manual;
        } else {
          body.operacion_reparacion_codigo = operacionCodigo;
        }
        const res = await fetch("/api/planificacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) ok++; else fail++;
      }
      if (ok > 0) {
        const detalleOps = nuevasOps > 0 ? ` (${nuevasOps} operación(es) nueva(s) creada(s) en catálogo)` : "";
        messageApi.success(`${ok} tarea(s) agregadas${detalleOps}`);
      }
      if (fail > 0) messageApi.warning(`${fail} tarea(s) fallaron`);
      if (ok > 0) {
        cerrarForm();
        fetchRows();
      }
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
  // Helper para filtrar operaciones por parte + tipo (por fila del draft)
  function operacionesParaFila(d: DraftTarea) {
    if (!d.parte) return [];
    const clas = d.tipo_tarea === "NoEstandar" ? "NO_STD" : "STD";
    return operaciones.filter((o) => o.componente_codigo === d.parte && o.clasificacion === clas);
  }

  // Helpers para filtros de columnas con valores no-string
  const ordenesUnicos = [...new Set(rows.map((r) => r.orden).filter((v): v is number => v != null))]
    .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) }));
  const horasUnicas = [...new Set(rows.map((r) => r.horas_estimadas).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: Number(v).toFixed(2), value: v }));
  const fechasInicioUnicas = [...new Set(rows.map((r) => r.fecha_inicio).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: formatDateOnlyShort(v), value: v }));
  const fechasFinUnicas = [...new Set(rows.map((r) => r.fecha_fin).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: formatDateOnlyShort(v), value: v }));
  const fechasInicioRealUnicas = [...new Set(rows.map((r) => r.fecha_inicio_real).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: dayjs(v).format("DD/MM HH:mm"), value: v }));
  const fechasFinRealUnicas = [...new Set(rows.map((r) => r.fecha_fin_real).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: dayjs(v).format("DD/MM HH:mm"), value: v }));
  const createdUnicos = [...new Set(rows.map((r) => r.created_at).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: dayjs(v).format("DD/MM/YY HH:mm"), value: v }));

  const columns: ColumnsType<PlanRow> = [
    {
      key: "orden", title: "N°", dataIndex: "orden", width: 50, align: "center",
      sorter: (a, b) => (a.orden ?? 0) - (b.orden ?? 0),
      filters: ordenesUnicos, filterSearch: true,
      onFilter: (value, r) => String(r.orden ?? "") === value,
    },
    {
      key: "componente",
      title: "Parte", dataIndex: "componente", width: 110,
      ...filtroPorColumna(rows, "componente"),
      render: (v: string) => <Tag color={brand.cyan}>{v}</Tag>,
    },
    { key: "descripcion", title: "Tarea", dataIndex: "descripcion", width: 320, ellipsis: true,
      ...filtroPorColumna(rows, "descripcion"),
      render: (v: string, r) => {
        const code = (r.operacion_codigo ?? "").trim();
        const desc = (v ?? "").trim();
        const isFallback = !code || code === "EVAL" || code === "CUSTOM" || code.toLowerCase() === desc.toLowerCase();
        return <div style={{ fontWeight: 500 }}>{isFallback ? desc : `${code} - ${desc}`}</div>;
      },
    },
    { key: "tipo_reparacion", title: "Tipo", dataIndex: "tipo_reparacion", width: 100,
      filters: [
        { text: "Estandar", value: "Estandar" },
        { text: "NoEstandar", value: "NoEstandar" },
      ],
      onFilter: (value, r) => (r.tipo_reparacion ?? "Estandar") === value,
      render: (v: string | null) => v ?? "Estandar",
    },
    { key: "qty", title: "Qty", width: 60, align: "center", render: () => 1 },
    { key: "he", title: "HE", width: 55, align: "center", render: () => <span style={{ color: brand.textSecondary }}>—</span> },
    { key: "qty_he", title: "Qty HE", width: 60, align: "center", render: () => <span style={{ color: brand.textSecondary }}>—</span> },
    {
      key: "horas_estimadas",
      title: "Dur.(hrs)", dataIndex: "horas_estimadas", width: 80, align: "right",
      sorter: (a, b) => Number(a.horas_estimadas ?? 0) - Number(b.horas_estimadas ?? 0),
      filters: horasUnicas, filterSearch: true,
      onFilter: (value, r) => String(r.horas_estimadas ?? "") === value,
      render: (v: string | null) => v == null ? <span style={{ color: brand.textSecondary }}>—</span> : Number(v).toFixed(2),
    },
    {
      key: "hh", title: "HH", width: 70, align: "right",
      render: () => <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "fecha_inicio",
      title: "Inicio Est.", dataIndex: "fecha_inicio", width: 100,
      sorter: (a, b) => (a.fecha_inicio || "").localeCompare(b.fecha_inicio || ""),
      filters: fechasInicioUnicas, filterSearch: true,
      onFilter: (value, r) => r.fecha_inicio === value,
      render: (v: string | null) => v ? formatDateOnlyShort(v) : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "fecha_fin",
      title: "Fin Est.", dataIndex: "fecha_fin", width: 100,
      sorter: (a, b) => (a.fecha_fin || "").localeCompare(b.fecha_fin || ""),
      filters: fechasFinUnicas, filterSearch: true,
      onFilter: (value, r) => r.fecha_fin === value,
      render: (v: string | null) => v ? formatDateOnlyShort(v) : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "maquina",
      title: "Equipo", dataIndex: "maquina", width: 130,
      ...filtroPorColumna(rows, "maquina"),
      render: (v: string | null) => v ?? <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "tecnico",
      title: "Operario", dataIndex: "tecnico", width: 120,
      ...filtroPorColumna(rows, "tecnico"),
      render: (v: string | null) => v ?? <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "fecha_inicio_real",
      title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 110,
      sorter: (a, b) => (a.fecha_inicio_real || "").localeCompare(b.fecha_inicio_real || ""),
      filters: fechasInicioRealUnicas, filterSearch: true,
      onFilter: (value, r) => r.fecha_inicio_real === value,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "fecha_fin_real",
      title: "Fin Real", dataIndex: "fecha_fin_real", width: 110,
      sorter: (a, b) => (a.fecha_fin_real || "").localeCompare(b.fecha_fin_real || ""),
      filters: fechasFinRealUnicas, filterSearch: true,
      onFilter: (value, r) => r.fecha_fin_real === value,
      render: (v: string | null) => v
        ? <span style={{ fontSize: 11 }}>{dayjs(v).format("DD/MM HH:mm")}</span>
        : <span style={{ color: brand.textSecondary }}>—</span>,
    },
    {
      key: "dur_real",
      title: "Dur. Real", width: 90, align: "right",
      render: (_: unknown, r: PlanRow) => {
        if (r.fecha_inicio_real && r.fecha_fin_real) {
          const h = dayjs(r.fecha_fin_real).diff(dayjs(r.fecha_inicio_real), "minute") / 60;
          return <span>{h.toFixed(2)}</span>;
        }
        if (r.horas_reales != null) return Number(r.horas_reales).toFixed(2);
        return <span style={{ color: brand.textSecondary }}>—</span>;
      },
    },
    {
      key: "estado",
      title: "Estado Tarea", dataIndex: "estado", width: 120,
      filters: estadosCat.map((e) => ({ text: e.nombre, value: e.codigo })),
      onFilter: (value, r) => (r.estado ?? "abierto") === value,
      render: (v: string | null) => {
        const cat = estadosCat.find((e) => e.codigo === (v ?? "abierto"));
        return <Tag color={cat?.color ?? "default"}>{cat?.nombre ?? v ?? "-"}</Tag>;
      },
    },
    {
      key: "created_at",
      title: "Creado", dataIndex: "created_at", width: 120,
      sorter: (a, b) => (a.created_at || "").localeCompare(b.created_at || ""),
      filters: createdUnicos, filterSearch: true,
      onFilter: (value, r) => r.created_at === value,
      render: (v: string) => dayjs(v).format("DD/MM/YY HH:mm"),
    },
    {
      key: "acc",
      title: "Acc.", width: 130, align: "center", fixed: "right",
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

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper } =
    useColumnasRedimensionables<PlanRow>(columns, "ot-tareas-cols-widths-v1");

  return (
    <div>
      {contextHolder}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <UnorderedListOutlined style={{ marginRight: 8 }} />
          Planeamiento de Operaciones
        </Typography.Title>
        <Space>
          <ColumnasToggleButton<PlanRow>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["orden", "descripcion", "acc"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openForm}>
            Nueva Tarea
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16, background: "#F0F7FF" }} styles={{ body: { padding: "10px 16px" } }}>
        <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 4 }}>Progreso General</div>
        <Progress percent={progreso} size="small" />
      </Card>

      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Inicio estimado" value={rangoInicio} onChange={setRangoInicio} />
        </Col>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fin estimado" value={rangoFin} onChange={setRangoFin} />
        </Col>
      </Row>

      {formOpen && (
        <Card
          title={<span style={{ fontSize: 14 }}>Nueva(s) Tarea(s){draftRows.length > 1 ? ` — ${draftRows.length} tareas` : ""}</span>}
          size="small"
          style={{ marginBottom: 16, borderStyle: "dashed", borderColor: brand.cyan }}
          extra={<Button type="text" icon={<CloseOutlined />} onClick={cerrarForm} />}
        >
          {draftRows.map((d, idx) => {
            const opsFila = operacionesParaFila(d);
            const libre = usaTextoLibrePara(d);
            return (
              <Row key={d.id} gutter={12} align="bottom" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: idx < draftRows.length - 1 ? "1px dashed #e8e8e8" : "none" }}>
                <Col xs={24} sm={12} md={4}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Parte *</div>
                  <Select
                    size="small"
                    value={d.parte ?? undefined}
                    onChange={(v) => updateDraft(d.id, { parte: v })}
                    placeholder="Seleccione..."
                    options={componentes.map((c) => ({ value: c.codigo, label: c.nombre }))}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col xs={24} sm={12} md={3}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Tipo *</div>
                  <Select
                    size="small"
                    value={d.tipo_tarea}
                    onChange={(v) => updateDraft(d.id, { tipo_tarea: v })}
                    options={TIPO_TAREA_OPTS}
                    disabled={!d.parte}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col xs={24} sm={24} md={7}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Tarea *</div>
                  {libre ? (
                    <Input
                      size="small"
                      value={d.trabajo_manual ?? ""}
                      onChange={(e) => updateDraft(d.id, { trabajo_manual: e.target.value })}
                      placeholder={`Describa la tarea ${d.tipo_tarea === "NoEstandar" ? "no estándar" : ""} para ${d.parte ?? ""}...`}
                    />
                  ) : (
                    <OperacionCombo
                      draft={d}
                      opciones={opsFila}
                      onPickExisting={(codigo) => updateDraft(d.id, { operacion_codigo: codigo, nueva_operacion_nombre: null })}
                      onCreateNew={(nombre) => updateDraft(d.id, { operacion_codigo: null, nueva_operacion_nombre: nombre })}
                      onClear={() => updateDraft(d.id, { operacion_codigo: null, nueva_operacion_nombre: null })}
                      onLoadAll={d.parte && opsFila.length > 0 ? () => loadAllForRow(d.id) : undefined}
                      loadAllCount={opsFila.length}
                    />
                  )}
                </Col>
                <Col xs={24} sm={12} md={4}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Operario</div>
                  <Select
                    size="small"
                    value={d.tecnico ?? undefined}
                    onChange={(nombre) => {
                      const patch: Partial<DraftTarea> = { tecnico: nombre ?? null };
                      // Autocompletar máquina si no hay equipo asignado y el trabajador tiene uno por default
                      if (nombre && !d.equipo) {
                        const t = trabajadores.find((x) => x.nombre === nombre);
                        if (t?.equipo_codigo) patch.equipo = t.equipo_codigo;
                      }
                      updateDraft(d.id, patch);
                    }}
                    placeholder="Operario..."
                    allowClear
                    showSearch
                    filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                    options={trabajadores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.puesto}` }))}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col xs={24} sm={12} md={4}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Equipo</div>
                  <Select
                    size="small"
                    value={d.equipo ?? undefined}
                    onChange={(v) => updateDraft(d.id, { equipo: v ?? null })}
                    placeholder="Equipo..."
                    allowClear
                    showSearch
                    filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                    options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
                    style={{ width: "100%" }}
                  />
                </Col>
                <Col xs={24} sm={24} md={2} style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                  {draftRows.length > 1 && (
                    <Tooltip title="Quitar esta tarea del lote">
                      <Button
                        size="small"
                        danger
                        type="text"
                        icon={<CloseOutlined />}
                        onClick={() => removeDraft(d.id)}
                      />
                    </Tooltip>
                  )}
                </Col>
              </Row>
            );
          })}
          <Row justify="space-between" align="middle" style={{ marginTop: 12 }}>
            <Col>
              <Button type="dashed" icon={<PlusOutlined />} onClick={addDraft}>
                Agregar otra tarea
              </Button>
            </Col>
            <Col>
              <Space>
                <Button onClick={cerrarForm}>Cancelar</Button>
                <Button
                  type="primary"
                  style={{ background: brand.success, borderColor: brand.success }}
                  loading={saving}
                  onClick={saveAllTareas}
                >
                  Guardar {draftRows.length > 1 ? `(${draftRows.length})` : ""}
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
          pagination={false}
          size="small"
          loading={loading}
          scroll={{ x: 1800 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          locale={{ emptyText: <Empty description="Sin tareas. Agregalas con el botón 'Nueva Tarea'." /> }}
        />
      </TableDragWrapper>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Combo de Tarea: permite elegir existente o tipear una nueva.
// Si el usuario tipea texto que no matchea ninguna opción, ofrece "+ Crear: <texto>".
// Al confirmar la creación, el padre la guardará en catálogo al hacer "Guardar".
// ───────────────────────────────────────────────────────────────────────────
interface OperacionComboProps {
  draft: {
    parte: string | null;
    operacion_codigo: string | null;
    nueva_operacion_nombre: string | null;
    tipo_tarea: string;
  };
  opciones: OperacionOpt[];
  onPickExisting: (codigo: string) => void;
  onCreateNew: (nombre: string) => void;
  onClear: () => void;
  /** Si está presente, se muestra al tope del dropdown un botón "Jalar todas
   *  las tareas {tipo} de {parte}". El padre maneja la lógica de generar
   *  los N drafts pre-llenos. */
  onLoadAll?: () => void;
  /** Cantidad de operaciones que se cargarían — para mostrar "(N)" en el botón. */
  loadAllCount?: number;
}

function OperacionCombo({ draft, opciones, onPickExisting, onCreateNew, onClear, onLoadAll, loadAllCount = 0 }: OperacionComboProps) {
  const [search, setSearch] = useState("");
  // Valor visible en el Select: si hay operacion_codigo elegida, su código.
  // Si hay nueva_operacion_nombre (pendiente de crear), un marker "__new__:nombre".
  const valorActual = draft.operacion_codigo
    ?? (draft.nueva_operacion_nombre ? `__new__::${draft.nueva_operacion_nombre}` : undefined);
  // Match exacto contra opciones existentes (no distingue mayúsculas)
  const matchExacto = search.trim()
    ? opciones.find((o) => o.nombre.toLowerCase() === search.trim().toLowerCase())
    : null;
  const puedeCrear = search.trim().length >= 2 && !matchExacto;

  const opcionesSelect = [
    ...opciones.map((o) => ({ value: o.codigo, label: `${o.codigo} - ${o.nombre}` })),
    // Si hay una "nueva" pendiente, agregar como opción seleccionada
    ...(draft.nueva_operacion_nombre && !draft.operacion_codigo
      ? [{ value: `__new__::${draft.nueva_operacion_nombre}`, label: `🆕 ${draft.nueva_operacion_nombre} (se creará al guardar)` }]
      : []),
  ];

  return (
    <Select
      size="small"
      value={valorActual}
      onChange={(v) => {
        if (typeof v === "string" && v.startsWith("__new__::")) {
          onCreateNew(v.substring("__new__::".length));
        } else if (v) {
          onPickExisting(v);
        } else {
          onClear();
        }
      }}
      onSearch={(text) => setSearch(text)}
      onBlur={() => setSearch("")}
      placeholder={!draft.parte ? "Seleccione parte primero..." : "Seleccione o tipee para crear nueva..."}
      showSearch
      allowClear
      disabled={!draft.parte}
      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
      options={opcionesSelect}
      style={{ width: "100%" }}
      dropdownRender={(menu) => (
        <div>
          {/* Atajo: jalar todas las operaciones que matchean parte+tipo a la vez.
              Se borra el draft actual y se generan N drafts pre-llenos. */}
          {onLoadAll && loadAllCount > 0 && (
            <div style={{ borderBottom: "1px solid #f0f0f0", padding: "6px 8px", background: "#FAFAFA" }}>
              <Button
                type="link" size="small" block
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onLoadAll()}
              >
                ⚡ Jalar todas las tareas <b>{draft.tipo_tarea === "NoEstandar" ? "no estándar" : "estándar"}</b> de <b>{draft.parte}</b> ({loadAllCount})
              </Button>
            </div>
          )}
          {menu}
          {puedeCrear && (
            <div style={{ borderTop: "1px solid #f0f0f0", padding: "6px 8px" }}>
              <Button
                type="link" size="small" block
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onCreateNew(search.trim());
                  setSearch("");
                }}
              >
                + Crear: <b>{`"${search.trim()}"`}</b>
              </Button>
            </div>
          )}
        </div>
      )}
    />
  );
}

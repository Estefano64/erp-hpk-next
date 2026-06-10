"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Table, Button, Input, Select, Space, Tag, Modal, Form,
  Row, Col, Card, App, DatePicker, Popconfirm, Tooltip, Switch, Checkbox,
} from "antd";
import {
  ToolOutlined, PlusOutlined, ReloadOutlined, SearchOutlined,
  DeleteOutlined, EyeOutlined, StopOutlined, UndoOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSession } from "next-auth/react";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
dayjs.extend(isoWeek);
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
  filtroPorColumna,
  usePersistedState,
} from "@/lib/tables";
import { areasTallerGrouped, areaTallerLabel, tipoEquipoPorAreaTaller } from "@/lib/areas-taller";
import { formatOtInternaCodigo } from "@/lib/ot-formato";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

const { Title, Text } = Typography;

// Label visual de un Task List (lo usamos como `value` en el Select porque
// task_list en la BD es texto libre VarChar(200) — no hay FK al id del catálogo).
// Manteniendo la forma "MAQUINA · MP_X · descripción truncada" el dato queda
// legible aunque alguien lo lea directo de la BD.
function labelDeTaskList(t: {
  maquina_taller: string; actividad_codigo: string; descripcion: string;
}): string {
  const desc = t.descripcion.length > 80 ? t.descripcion.slice(0, 77) + "…" : t.descripcion;
  return `${t.maquina_taller} · ${t.actividad_codigo} · ${desc}`;
}

// ─── Semana ISO ↔ string "YYYYWww" ─────────────────────────────────────────
// Formato consistente con src/lib/emergencia-cascade.ts (sin guión entre año y W).
// Aceptamos también "YYYY-Www" al parsear por compatibilidad.
function isoWeekFormat(d: Dayjs | null | undefined): string | null {
  if (!d) return null;
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}
function isoWeekParse(s: string | null | undefined): Dayjs | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-?W(\d{1,2})$/i);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // 4 de enero ALWAYS pertenece a la semana ISO 1 del año. Anchamos ahí y
  // sumamos (week-1) semanas. Más portable que usar setters isoWeek/isoWeekYear
  // (que los tipos de dayjs no exponen como setters cuando reciben argumento).
  return dayjs(`${year}-01-04`).startOf("isoWeek").add(week - 1, "week");
}

interface CatalogOption { codigo: string; nombre: string }
interface EquipoOption { codigo: string; descripcion: string }
interface EstrategiaOption { estrategia_id: number; codigo: string; descripcion: string; equipo_codigo: string | null; actividad_codigo: string | null }

interface OTInternaRow {
  id: number;
  // ot ahora es INTEGER (NNNNYY) tras la migración; el display OIXXXXYY se
  // construye con formatOtInternaCodigo.
  ot: number | string | null;
  activo: boolean;
  descripcion: string | null;
  planta_codigo: string | null;
  equipo_codigo: string | null;
  area_taller: string | null;
  semana_revision: string | null;
  task_list: string | null;
  estrategia_id: number | null;
  fecha_creacion: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  fecha_cierre: string | null;
  asignado_a: string | null;
  comentarios: string | null;
  // Flag para diferenciar las OTs que nacieron de una solicitud de mantenimiento
  // (un operativo pidió intervención) vs OTs creadas por planificación regular.
  solicitud_mantenimiento: boolean;
  usuario_crea: string | null;
  version: number;
  equipo: { codigo: string; descripcion: string } | null;
  // Conteo de requerimientos activos — viene de `_count.repuestos` del endpoint.
  // `_count.repuestos` = cantidad de ITEMS (cada OTRepuesto cuenta como uno).
  // `n_reqs_distintos`  = cantidad de nro_req únicos (un req puede tener N items).
  _count?: { repuestos: number };
  n_reqs_distintos?: number;
  // Totales de costo agrupados por moneda. Calculados en el endpoint a
  // partir de los OTRepuesto activos. {} si no hay datos para esa categoría.
  //   costo_real      = SUM(cantidad_recibida × precio_unitario)
  //   costo_estimado  = SUM(pendiente × precio_unitario) si el req está en proceso
  costo_real_por_moneda?: Record<string, number>;
  costo_estimado_por_moneda?: Record<string, number>;
  planta: { codigo: string; nombre: string } | null;
  tipo_ot_interna: { codigo: string; nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  estrategia: { estrategia_id: number; codigo: string; descripcion: string } | null;
  user_status: { codigo: string; nombre: string } | null;
  ot_status: { codigo: string; nombre: string } | null;
  recursos_status: { codigo: string; nombre: string } | null;
}

interface FormValues {
  tipo_ot_interna_codigo: string;
  area_taller: string;
  equipo_codigo?: string;
  descripcion: string;
  planta_codigo?: string;
  prioridad_atencion_codigo?: string;
  semana_revision?: string;
  estrategia_id?: number;
  task_list?: string;
  user_status_codigo?: string;
  asignado_a?: string;
  comentarios?: string;
  solicitud_mantenimiento?: boolean;
  fecha_inicio_plan?: Dayjs | null;
  fecha_fin_plan?: Dayjs | null;
}

interface TrabajadorOpt { nombre: string; area: string; puesto: string }

export default function OrdenesTrabajoInternasPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { screens } = useResponsive();
  const { data: session } = useSession();
  // Eliminar / desactivar OTs internas es exclusivo del admin (destructivo).
  const esAdmin = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [form] = Form.useForm<FormValues>();
  // El área del taller seleccionada determina qué tipos de equipo se cargan
  // en el selector (1.3.1=HER, 1.3.2=MAQ, 1.3.3=VEH; resto: vacío).
  const areaTallerSel = Form.useWatch("area_taller", form);
  const tipoEquipoForm = tipoEquipoPorAreaTaller(areaTallerSel);
  // Watch del equipo seleccionado — para filtrar el catálogo task_list por
  // máquina (los preventivos típicos son específicos por máquina).
  const equipoSel = Form.useWatch("equipo_codigo", form);
  // Watch del check "solicitud de mantenimiento" — al togglearlo cambia el
  // user_status automático y el bloqueo de fechas pasadas en planificación.
  const solicitudMttoSel = Form.useWatch("solicitud_mantenimiento", form);
  // Watch de fecha_inicio_plan — para que el DatePicker de fin no permita
  // elegir una fecha anterior al inicio.
  const inicioPlanSel = Form.useWatch("fecha_inicio_plan", form);
  // `bloquearFechasPasadas` se computa más abajo, después de declarar `editing`.
  // Tipo de OT interna seleccionado: si es correctiva no aplica Estrategia
  // ni Task list (esos campos son del flujo preventivo). El cálculo de
  // `esCorrectiva` se hace más abajo, después de declarar `tiposOTInterna`.
  const tipoOTInternaSel = Form.useWatch("tipo_ot_interna_codigo", form);

  // Estado
  const [rows, setRows] = useState<OTInternaRow[]>([]);
  const [verInactivas, setVerInactivas] = usePersistedState<boolean>("oti-list-ver-inactivas", false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  // Filtros persistidos por usuario (localStorage namespaced).
  const [search, setSearch] = usePersistedState<string>("oti-list-search", "");
  const [filterTipo, setFilterTipo] = usePersistedState<string | undefined>("oti-list-tipo", undefined);
  const [filterEquipo, setFilterEquipo] = usePersistedState<string | undefined>("oti-list-equipo", undefined);
  // Filtro de OT Status — default "Abierta" (el usuario casi siempre entra a
  // trabajar con OTs activas). Su selección se persiste, así que si lo cambia
  // a otra cosa, en la próxima entrada se respeta lo que dejó.
  const [otStatusFilter, setOtStatusFilter] = usePersistedState<string[] | null>(
    "oti-list-ot-status-filter",
    ["Abierta"],
  );
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OTInternaRow | null>(null);
  // Derivación: ¿el estado al guardar va a ser PLANIFICADO o PROGRAMADO/REPROGRAMADO?
  // En ese caso bloqueamos fechas pasadas. EN_REVISION (solicitud) permite fechas
  // pasadas porque el operativo puede estar registrando una falla que ya empezó.
  const bloquearFechasPasadas = !solicitudMttoSel
    || editing?.user_status?.codigo === "PROGRAMADO"
    || editing?.user_status?.codigo === "REPROGRAMADO";

  // Catálogos
  const [tiposOTInterna, setTiposOTInterna] = useState<CatalogOption[]>([]);
  // Es correctiva cuando el código o nombre del tipo contiene "correctiv".
  // Necesita estar acá (después de declarar tiposOTInterna) porque depende
  // del catálogo cargado para resolver el nombre desde el código.
  // El flujo "no estratégico" (antes "correctivo") es lo que el negocio llama
  // así porque NO tiene estrategia ni task_list — son OTs improvisadas que se
  // crean para resolver una falla. Aceptamos los códigos viejos por compat con
  // deploys que no migraron y por el flujo correctivo de mantenimiento.
  const esCorrectiva = (() => {
    const cod = (tipoOTInternaSel ?? "").toString().toUpperCase();
    if (cod === "NO_ESTRATEGICA" || cod === "CORRECTIVA" || cod === "CORR") return true;
    const nombre = tiposOTInterna.find((t) => t.codigo === tipoOTInternaSel)?.nombre ?? "";
    return /correctiv|no\s*estrat[ée]g/i.test(nombre);
  })();
  const [equipos, setEquipos] = useState<EquipoOption[]>([]);
  const [plantas, setPlantas] = useState<CatalogOption[]>([]);
  const [prioridades, setPrioridades] = useState<CatalogOption[]>([]);
  const [userStatuses, setUserStatuses] = useState<CatalogOption[]>([]);
  const [estrategias, setEstrategias] = useState<EstrategiaOption[]>([]);
  const [trabajadores, setTrabajadores] = useState<TrabajadorOpt[]>([]);
  // Catálogo de Task Lists del taller (importado del Excel HPK). Se usa en el
  // form para que el usuario elija una tarea en vez de tipearla como texto libre.
  const [taskLists, setTaskLists] = useState<Array<{
    id: number; maquina_taller: string; actividad_codigo: string; descripcion: string;
  }>>([]);

  // El dropdown "Asignado a" en OTs internas muestra TODO el personal de
  // Logística (incluyendo jefe/compras/almacén) + Mantenimiento + Limpieza
  // + Software, más Antonio (Antonio Zumaeta Mendoza) por nombre.
  // Decisión del usuario (2026-05-28).
  const AREAS_ASIGNABLES_OT_INTERNA = new Set([
    "LOGISTICA",
    "MANTENIMIENTO",
    "LIMPIEZA",
    "SOFTWARE",
  ]);
  const trabajadoresAsignables = trabajadores.filter(
    (t) =>
      (t.area && AREAS_ASIGNABLES_OT_INTERNA.has(t.area.toUpperCase())) ||
      t.nombre.toLowerCase().includes("antonio"),
  );

  const { ocultas, setOcultas } = useColumnasOcultas("ot-internas-cols-v1", [
    "fecha_inicio_real", "fecha_fin_real", "fecha_cierre", "estrategia", "task_list", "recursos_status",
  ]);

  // Cargar catálogos una vez
  useEffect(() => {
    (async () => {
      const [tRes, pRes, prRes, usRes, estRes, trRes, tlRes] = await Promise.all([
        fetch("/api/catalogos?tabla=tipoOTInterna"),
        fetch("/api/catalogos?tabla=planta"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=userStatus"),
        fetch("/api/catalogos?tabla=estrategia"),
        // No usamos soloOperarios=1 acá: necesitamos incluir JEFE DE LOGISTICA
        // y COMPRAS (que sí pueden ser asignados de OTs internas).
        fetch("/api/trabajadores?limit=200"),
        // Catálogo de Task Lists del taller (291 entradas importadas del Excel).
        fetch("/api/mantenimiento/task-lists?limit=2000"),
      ]);
      if (tRes.ok) setTiposOTInterna((await tRes.json()).data ?? []);
      // NOTA: los equipos se cargan dinámicamente según el área del taller
      // elegida en el formulario (ver useEffect más abajo).
      if (pRes.ok) setPlantas((await pRes.json()).data ?? []);
      if (prRes.ok) setPrioridades((await prRes.json()).data ?? []);
      if (usRes.ok) setUserStatuses((await usRes.json()).data ?? []);
      if (estRes.ok) setEstrategias((await estRes.json()).data ?? []);
      if (trRes.ok) setTrabajadores((await trRes.json()).data ?? []);
      if (tlRes.ok) setTaskLists((await tlRes.json()).data ?? []);
    })();
  }, []);

  // Carga dinámica del catálogo de equipos según el área del taller elegida.
  // Si el área no corresponde a un tipo (MAQ/VEH/HER), el selector queda vacío.
  useEffect(() => {
    if (!tipoEquipoForm) {
      setEquipos([]);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/equipos?limit=500&tipo=${tipoEquipoForm}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setEquipos((await res.json()).data ?? []);
      } catch {
        // abortado
      }
    })();
    return () => ctrl.abort();
  }, [tipoEquipoForm]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (search) params.set("search", search);
      if (filterTipo) params.set("tipo", filterTipo);
      if (filterEquipo) params.set("equipo", filterEquipo);
      if (verInactivas) params.set("incluirInactivas", "1");
      const res = await fetch(`/api/ordenes-trabajo-internas?${params}`);
      if (res.ok) {
        const json = await res.json();
        setRows(json.data ?? []);
        setTotal(json.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterTipo, filterEquipo, verInactivas]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openNuevoModal() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEditarModal(row: OTInternaRow) {
    setEditing(row);
    form.setFieldsValue({
      tipo_ot_interna_codigo: row.tipo_ot_interna?.codigo ?? "",
      area_taller: row.area_taller ?? "",
      equipo_codigo: row.equipo?.codigo,
      descripcion: row.descripcion ?? "",
      planta_codigo: row.planta?.codigo,
      prioridad_atencion_codigo: row.prioridad_atencion?.codigo,
      semana_revision: row.semana_revision ?? undefined,
      estrategia_id: row.estrategia?.estrategia_id,
      task_list: row.task_list ?? undefined,
      user_status_codigo: row.user_status?.codigo,
      asignado_a: row.asignado_a ?? undefined,
      comentarios: row.comentarios ?? undefined,
      solicitud_mantenimiento: row.solicitud_mantenimiento,
      fecha_inicio_plan: row.fecha_inicio_plan ? dayjs(row.fecha_inicio_plan) : null,
      fecha_fin_plan: row.fecha_fin_plan ? dayjs(row.fecha_fin_plan) : null,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // Auto-asignación del User Status (ya no se muestra en el form):
      //   - solicitud_mantenimiento = true → EN_REVISION
      //   - solicitud_mantenimiento = false → PLANIFICADO
      // Al editar, respetamos estados avanzados (PROGRAMADO/REPROGRAMADO) que
      // vienen de otros flujos (planificación) — no los sobreescribimos por
      // cambiar el check.
      const checkSol = values.solicitud_mantenimiento === true;
      const statusAuto = checkSol ? "EN_REVISION" : "PLANIFICADO";
      const estadoActual = editing?.user_status?.codigo;
      const userStatusFinal = !editing
        ? statusAuto
        : (estadoActual === "PROGRAMADO" || estadoActual === "REPROGRAMADO")
          ? estadoActual // no tocamos estados avanzados
          : statusAuto;

      const payload = {
        ...values,
        user_status_codigo: userStatusFinal,
        fecha_inicio_plan: values.fecha_inicio_plan ? values.fecha_inicio_plan.toISOString() : null,
        fecha_fin_plan: values.fecha_fin_plan ? values.fecha_fin_plan.toISOString() : null,
        ...(editing ? { version: editing.version } : {}),
      };
      const url = editing
        ? `/api/ordenes-trabajo-internas/${editing.id}`
        : "/api/ordenes-trabajo-internas";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error ?? "Error al guardar");
      }
      message.success(editing ? "OT actualizada" : "OT interna creada");
      setModalOpen(false);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Desactivar (anular, reversible) / reactivar. Solo admin.
  async function toggleActivo(r: OTInternaRow) {
    const activar = !r.activo;
    const res = await fetch(`/api/ordenes-trabajo-internas/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: activar }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { message.error(j.error ?? "No se pudo cambiar el estado"); return; }
    message.success(activar ? "OT interna reactivada" : "OT interna desactivada");
    fetchData();
  }

  // Eliminar en cascada (irreversible). Solo admin. Confirmación reforzada.
  function confirmarEliminar(r: OTInternaRow) {
    modal.confirm({
      title: `Eliminar OT interna ${formatOtInternaCodigo(r.ot, `#${r.id}`)} definitivamente`,
      okText: "Eliminar todo",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      width: 500,
      content: (
        <div style={{ fontSize: 13 }}>
          Esto borra <b>permanentemente</b> la OT interna y <b>todo lo relacionado</b>
          (requerimientos, adjuntos, historial). No se puede deshacer.
          <br /><br />
          Si solo querés ocultarla, usá <b>Desactivar</b> en su lugar.
        </div>
      ),
      onOk: async () => {
        const res = await fetch(`/api/ordenes-trabajo-internas/${r.id}`, { method: "DELETE" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(j.error ?? "No se pudo eliminar"); throw new Error("fail"); }
        message.success("OT interna eliminada");
        fetchData();
      },
    });
  }

  // Columnas
  const baseColumns: ColumnsType<OTInternaRow> = useMemo(() => [
    numeracionColumn<OTInternaRow>({ current: page, pageSize }),
    {
      key: "ot", title: "OT", dataIndex: "ot", width: 130,
      render: (_: unknown, r: OTInternaRow) => (
        <Space size={4}>
          {r.ot != null
            ? <Tag style={{ background: brand.navy, color: brand.white, border: "none", fontFamily: "monospace" }}>{formatOtInternaCodigo(r.ot)}</Tag>
            : "-"}
          {!r.activo && <Tag color="default">desactivada</Tag>}
        </Space>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 110,
      // Filter manual — antes usaba filtroPorColumna sobre el objeto
      // tipo_ot_interna y stringificaba como "[object Object]". Ahora
      // derivamos {nombre, codigo} de los rows y filtramos por código.
      filters: [...new Set(rows.map((r) => r.tipo_ot_interna?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const nombre = rows.find((r) => r.tipo_ot_interna?.codigo === c)?.tipo_ot_interna?.nombre ?? c;
          return { text: nombre, value: c };
        }),
      filterMultiple: true,
      onFilter: (value, r) => r.tipo_ot_interna?.codigo === value,
      render: (_: unknown, r: OTInternaRow) => {
        const t = r.tipo_ot_interna?.codigo;
        if (!t) return "-";
        // Color por tipo:
        //   ESTRATEGICA (antes PREVENTIVA) → azul
        //   NO_ESTRATEGICA (antes CORRECTIVA) → naranja
        // Aceptamos los códigos viejos por compat.
        const color = t === "ESTRATEGICA" || t === "PREVENTIVA"
          ? "blue"
          : "orange";
        return <Tag color={color}>{r.tipo_ot_interna?.nombre}</Tag>;
      },
    },
    {
      key: "area_taller", title: "Área asignada", width: 200, ellipsis: true,
      // Filter por código de área del taller — texto leíble en el dropdown.
      filters: [...new Set(rows.map((r) => r.area_taller).filter(Boolean) as string[])]
        .sort()
        .map((c) => ({ text: areaTallerLabel(c), value: c })),
      filterSearch: true,
      filterMultiple: true,
      onFilter: (value, r) => r.area_taller === value,
      render: (_: unknown, r: OTInternaRow) => {
        // Prioridad: área del taller (campo nuevo). Si no, fallback a equipo legacy.
        if (r.area_taller) return <span>{areaTallerLabel(r.area_taller)}</span>;
        if (r.equipo) {
          return <Tooltip title={r.equipo.descripcion}><span><b>{r.equipo.codigo}</b> · {r.equipo.descripcion}</span></Tooltip>;
        }
        return "-";
      },
    },
    {
      // Equipo/Maquinaria asociada — muestra el nombre (descripción) del equipo;
      // el código queda en el tooltip al hacer hover para auditoría.
      key: "equipo", title: "Equipo", width: 220, ellipsis: true,
      // Filter manual — antes mostraba el código del equipo (cosa ABC-001-XYZ)
      // pero la columna muestra la descripción, así que era inconsistente.
      // Ahora las opciones del filtro muestran "descripción (codigo)" y el
      // filtro real sigue siendo por código (único en BD).
      filters: [...new Set(rows.map((r) => r.equipo_codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const eq = rows.find((r) => r.equipo_codigo === c)?.equipo;
          return {
            text: eq?.descripcion ? `${eq.descripcion} (${c})` : c,
            value: c,
          };
        }),
      filterSearch: true,
      filterMultiple: true,
      onFilter: (value, r) => r.equipo_codigo === value,
      render: (_: unknown, r: OTInternaRow) =>
        r.equipo
          ? <Tooltip title={r.equipo.codigo}><span>{r.equipo.descripcion}</span></Tooltip>
          : <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion", title: "Descripción", dataIndex: "descripcion", width: 260, ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "planta", title: "Planta", width: 130,
      // Filter por código de planta — texto leíble (nombre) en el dropdown.
      filters: [...new Set(rows.map((r) => r.planta?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const nombre = rows.find((r) => r.planta?.codigo === c)?.planta?.nombre ?? c;
          return { text: nombre, value: c };
        }),
      filterMultiple: true,
      onFilter: (value, r) => r.planta?.codigo === value,
      render: (_: unknown, r: OTInternaRow) =>
        r.planta
          ? <Tooltip title={r.planta.codigo}><span>{r.planta.nombre}</span></Tooltip>
          : "-",
    },
    {
      key: "prioridad", title: "Prio.", width: 70, align: "center",
      filters: [...new Set(rows.map((r) => r.prioridad_atencion?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => ({ text: `Prio ${c}`, value: c })),
      filterMultiple: true,
      onFilter: (value, r) => r.prioridad_atencion?.codigo === value,
      render: (_: unknown, r: OTInternaRow) => {
        const p = r.prioridad_atencion?.codigo;
        if (!p) return "-";
        const color = p === "1" ? "red" : p === "2" ? "orange" : p === "E" ? "volcano" : "default";
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      key: "semana_revision", title: "Revisión", dataIndex: "semana_revision", width: 100,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "user_status", title: "User Status", width: 130,
      filters: [...new Set(rows.map((r) => r.user_status?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const nombre = rows.find((r) => r.user_status?.codigo === c)?.user_status?.nombre ?? c;
          return { text: nombre, value: c };
        }),
      filterMultiple: true,
      onFilter: (value, r) => r.user_status?.codigo === value,
      render: (_: unknown, r: OTInternaRow) => r.user_status?.nombre
        ? <Tag>{r.user_status.nombre}</Tag>
        : "-",
    },
    {
      key: "ot_status", title: "OT Status", width: 110,
      // Filtros derivados de los valores únicos cargados (que vienen del
      // catálogo OtStatus vía include en el endpoint). Por defecto seleccionado
      // "Abierta" — ver `otStatusFilter` arriba.
      //
      // 2026-06: usamos defaultFilteredValue (UNCONTROLLED) en vez de
      // filteredValue (controlled) para evitar el warning de AntD que pide
      // que TODAS las columnas tengan filteredValue o NINGUNA. La persistencia
      // sigue funcionando porque guardamos a localStorage vía el onChange de
      // la tabla; el inicial se lee del state cuando el componente monta.
      filters: [...new Set(rows.map((r) => r.ot_status?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const nombre = rows.find((r) => r.ot_status?.codigo === c)?.ot_status?.nombre ?? c;
          return { text: nombre, value: c };
        }),
      filterMultiple: true,
      defaultFilteredValue: otStatusFilter ?? undefined,
      onFilter: (value, r) => r.ot_status?.codigo === value,
      render: (_: unknown, r: OTInternaRow) => r.ot_status?.nombre
        ? <Tag color={r.ot_status.codigo === "Abierta" ? "processing" : r.ot_status.codigo === "Cerrada" ? "success" : "default"}>
            {r.ot_status.nombre}
          </Tag>
        : "-",
    },
    {
      key: "recursos_status", title: "Recursos Status", width: 150,
      filters: [...new Set(rows.map((r) => r.recursos_status?.codigo).filter(Boolean) as string[])]
        .sort()
        .map((c) => {
          const nombre = rows.find((r) => r.recursos_status?.codigo === c)?.recursos_status?.nombre ?? c;
          return { text: nombre, value: c };
        }),
      filterMultiple: true,
      onFilter: (value, r) => r.recursos_status?.codigo === value,
      render: (_: unknown, r: OTInternaRow) => r.recursos_status?.nombre ?? "-",
    },
    {
      key: "asignado_a", title: "Asignado a", dataIndex: "asignado_a", width: 160, ellipsis: true,
      ...filtroPorColumna<OTInternaRow>(rows, "asignado_a"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "usuario_crea", title: "Creado por", dataIndex: "usuario_crea", width: 150, ellipsis: true,
      ...filtroPorColumna<OTInternaRow>(rows, "usuario_crea"),
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      // Flag "Solicitud de mantenimiento": filtrable Sí/No. Tag verde si está
      // marcado, dash si no. Permite ver de un vistazo qué OTs nacieron de una
      // solicitud externa (no de planificación).
      key: "solicitud_mantenimiento", title: "Solicitud Mtto", width: 130, align: "center",
      filters: [
        { text: "Sí — solicitudes", value: "true" },
        { text: "No — planificadas", value: "false" },
      ],
      filterMultiple: false,
      onFilter: (value, r) => String(!!r.solicitud_mantenimiento) === String(value),
      sorter: (a: OTInternaRow, b: OTInternaRow) =>
        Number(b.solicitud_mantenimiento) - Number(a.solicitud_mantenimiento),
      render: (_: unknown, r: OTInternaRow) =>
        r.solicitud_mantenimiento
          ? <Tag color="green">Sí</Tag>
          : <Text type="secondary">—</Text>,
    },
    {
      key: "comentarios", title: "Comentarios", dataIndex: "comentarios", width: 220, ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span>{v}</span></Tooltip>
        : "-",
    },
    {
      key: "estrategia", title: "Estrategia", width: 200, ellipsis: true,
      render: (_: unknown, r: OTInternaRow) =>
        r.estrategia
          ? <Tooltip title={r.estrategia.codigo}><span>{r.estrategia.descripcion}</span></Tooltip>
          : "-",
    },
    {
      key: "task_list", title: "Task list", dataIndex: "task_list", width: 200, ellipsis: true,
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "fecha_inicio_plan", title: "Inicio Plan", dataIndex: "fecha_inicio_plan", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_fin_plan", title: "Fin Plan", dataIndex: "fecha_fin_plan", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_inicio_real", title: "Inicio Real", dataIndex: "fecha_inicio_real", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_fin_real", title: "Fin Real", dataIndex: "fecha_fin_real", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "fecha_cierre", title: "Cierre", dataIndex: "fecha_cierre", width: 130,
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      // Conteo de requerimientos. Muestra "X reqs / Y items" donde X = nro_req
      // únicos y Y = total de items. Click abre el detalle en el tab
      // Requerimientos. El sorter usa cantidad de items (más útil que reqs).
      key: "reqs", title: "Reqs / Items", width: 110, align: "center",
      sorter: (a: OTInternaRow, b: OTInternaRow) =>
        (a._count?.repuestos ?? 0) - (b._count?.repuestos ?? 0),
      render: (_: unknown, r: OTInternaRow) => {
        const items = r._count?.repuestos ?? 0;
        const reqs = r.n_reqs_distintos ?? 0;
        if (items === 0) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={`${reqs} requerimiento(s) · ${items} item(s) — click para ver en detalle`}>
            <a
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/ordenes-trabajo-internas/${r.id}?tab=requerimientos`);
              }}
            >
              <Tag color="blue" style={{ margin: 0, cursor: "pointer" }}>
                {reqs} reqs / {items} items
              </Tag>
            </a>
          </Tooltip>
        );
      },
    },
    {
      // Costo REAL (ejecutado): SUM(cantidad_recibida × precio_unitario) por
      // moneda. Si hay varias monedas (mezcla USD+PEN) mostramos ambas
      // separadas por " · ". El sorter usa la suma sin convertir (informativo).
      key: "costo_real", title: "Costo Real", width: 140, align: "right",
      sorter: (a: OTInternaRow, b: OTInternaRow) => {
        const sumA = Object.values(a.costo_real_por_moneda ?? {}).reduce((s, n) => s + n, 0);
        const sumB = Object.values(b.costo_real_por_moneda ?? {}).reduce((s, n) => s + n, 0);
        return sumA - sumB;
      },
      render: (_: unknown, r: OTInternaRow) => {
        const por = r.costo_real_por_moneda ?? {};
        const entries = Object.entries(por).filter(([, n]) => n > 0);
        if (entries.length === 0) return <Text type="secondary">—</Text>;
        return (
          <span style={{ color: brand.success ?? "#52c41a", fontWeight: 600, fontSize: 12 }}>
            {entries
              .map(([m, n]) => `${m} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
              .join(" · ")}
          </span>
        );
      },
    },
    {
      // Costo ESTIMADO (proyectado): SUM(pendiente × precio_unitario) por
      // moneda, solo de items en proceso (APROBADO o con OC vigente).
      key: "costo_estimado", title: "Costo Estimado", width: 140, align: "right",
      sorter: (a: OTInternaRow, b: OTInternaRow) => {
        const sumA = Object.values(a.costo_estimado_por_moneda ?? {}).reduce((s, n) => s + n, 0);
        const sumB = Object.values(b.costo_estimado_por_moneda ?? {}).reduce((s, n) => s + n, 0);
        return sumA - sumB;
      },
      render: (_: unknown, r: OTInternaRow) => {
        const por = r.costo_estimado_por_moneda ?? {};
        const entries = Object.entries(por).filter(([, n]) => n > 0);
        if (entries.length === 0) return <Text type="secondary">—</Text>;
        return (
          <span style={{ color: brand.cyan, fontWeight: 600, fontSize: 12 }}>
            {entries
              .map(([m, n]) => `${m} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
              .join(" · ")}
          </span>
        );
      },
    },
    {
      // Fecha de creación de la OT (auto-setteada en el POST). Útil para auditar
      // y filtrar por antigüedad. Solo fecha + hora corta (HH:mm).
      key: "fecha_creacion", title: "F. Creación", dataIndex: "fecha_creacion", width: 130,
      sorter: (a: OTInternaRow, b: OTInternaRow) =>
        (a.fecha_creacion ?? "").localeCompare(b.fecha_creacion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : <Text type="secondary">—</Text>,
    },
    {
      // Acciones: solo "Ver detalle" + (admin: activar/desactivar/eliminar).
      // El botón "Editar" desde la grilla se quitó — la edición se hace
      // desde el detalle de la OT para forzar contexto completo y reducir
      // ediciones accidentales que dispararían historial.
      key: "acciones", title: "", width: esAdmin ? 140 : 60, fixed: "right",
      render: (_: unknown, r: OTInternaRow) => (
        <Space size="small">
          <Tooltip title="Ver detalle">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => router.push(`/ordenes-trabajo-internas/${r.id}`)}
            />
          </Tooltip>
          {esAdmin && (r.activo ? (
            <Popconfirm
              title="Desactivar esta OT interna"
              description="Se oculta de los listados. Reversible (los datos se conservan)."
              okText="Desactivar" cancelText="Cancelar"
              onConfirm={() => toggleActivo(r)}
            >
              <Tooltip title="Desactivar (anular)">
                <Button size="small" type="text" icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Reactivar">
              <Button size="small" type="text" icon={<UndoOutlined style={{ color: brand.success }} />} onClick={() => toggleActivo(r)} />
            </Tooltip>
          ))}
          {esAdmin && (
            <Tooltip title="Eliminar definitivamente (cascada)">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmarEliminar(r)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [page, pageSize, rows, esAdmin]);

  const { columnas, components, resetAnchos, TableDragWrapper, orden: ordenColumnas } =
    useColumnasRedimensionables<OTInternaRow>(baseColumns, "ot-internas-cols-widths-v1", { data: rows });

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ToolOutlined style={{ marginRight: 8, color: brand.cyan }} />
            OTs Internas
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Mantenimiento de equipos del taller HP&amp;K (correctivas y preventivas).
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData} />
          {/* Export Excel — usa las MISMAS keys que las columnas de la tabla
              para que "Respetar layout actual de la tabla" pueda matchearlas. */}
          <ExportarExcelButton<OTInternaRow>
            endpoint="/api/ordenes-trabajo-internas"
            filename="OTs-Internas"
            sheetName="OTs Internas"
            tablaLayout={{ orden: ordenColumnas ?? undefined, ocultas }}
            columns={[
              { key: "ot", label: "OT", value: (r) => r.ot != null ? formatOtInternaCodigo(r.ot) : "" },
              { key: "tipo", label: "Tipo", value: (r) => r.tipo_ot_interna?.nombre ?? "" },
              { key: "area_taller", label: "Área asignada", value: (r) => r.area_taller ? areaTallerLabel(r.area_taller) : "" },
              { key: "equipo", label: "Equipo", value: (r) => r.equipo?.descripcion ?? r.equipo_codigo ?? "" },
              { key: "descripcion", label: "Descripción", value: (r) => r.descripcion ?? "" },
              { key: "planta", label: "Planta", value: (r) => r.planta?.nombre ?? "" },
              { key: "prioridad", label: "Prio.", value: (r) => r.prioridad_atencion?.codigo ?? "" },
              { key: "semana_revision", label: "Semana Revisión", value: (r) => r.semana_revision ?? "" },
              { key: "user_status", label: "User Status", value: (r) => r.user_status?.nombre ?? "" },
              { key: "ot_status", label: "OT Status", value: (r) => r.ot_status?.nombre ?? "" },
              { key: "recursos_status", label: "Recursos Status", value: (r) => r.recursos_status?.nombre ?? "" },
              { key: "asignado_a", label: "Asignado a", value: (r) => r.asignado_a ?? "" },
              { key: "usuario_crea", label: "Creado por", value: (r) => r.usuario_crea ?? "" },
              { key: "solicitud_mantenimiento", label: "Solicitud Mtto", value: (r) => r.solicitud_mantenimiento ? "Sí" : "No" },
              { key: "comentarios", label: "Comentarios", value: (r) => r.comentarios ?? "" },
              { key: "estrategia", label: "Estrategia", value: (r) => r.estrategia ? `${r.estrategia.codigo} — ${r.estrategia.descripcion}` : "" },
              { key: "task_list", label: "Task List", value: (r) => r.task_list ?? "" },
              { key: "fecha_inicio_plan", label: "Inicio Plan", value: (r) => r.fecha_inicio_plan ? dayjs(r.fecha_inicio_plan).format("DD/MM/YYYY HH:mm") : "" },
              { key: "fecha_fin_plan", label: "Fin Plan", value: (r) => r.fecha_fin_plan ? dayjs(r.fecha_fin_plan).format("DD/MM/YYYY HH:mm") : "" },
              { key: "fecha_inicio_real", label: "Inicio Real", value: (r) => r.fecha_inicio_real ? dayjs(r.fecha_inicio_real).format("DD/MM/YYYY HH:mm") : "" },
              { key: "fecha_fin_real", label: "Fin Real", value: (r) => r.fecha_fin_real ? dayjs(r.fecha_fin_real).format("DD/MM/YYYY HH:mm") : "" },
              { key: "fecha_cierre", label: "Cierre", value: (r) => r.fecha_cierre ? dayjs(r.fecha_cierre).format("DD/MM/YYYY HH:mm") : "" },
              { key: "reqs", label: "Reqs / Items", value: (r) => `${r.n_reqs_distintos ?? 0} reqs / ${r._count?.repuestos ?? 0} items` },
              { key: "costo_real", label: "Costo Real", value: (r) => Object.entries(r.costo_real_por_moneda ?? {}).filter(([, n]) => n > 0).map(([m, n]) => `${m} ${Number(n).toFixed(2)}`).join(" · ") },
              { key: "costo_estimado", label: "Costo Estimado", value: (r) => Object.entries(r.costo_estimado_por_moneda ?? {}).filter(([, n]) => n > 0).map(([m, n]) => `${m} ${Number(n).toFixed(2)}`).join(" · ") },
              { key: "fecha_creacion", label: "F. Creación", value: (r) => r.fecha_creacion ? dayjs(r.fecha_creacion).format("DD/MM/YYYY HH:mm") : "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openNuevoModal}>
            Nueva OT Interna
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[12, 8]}>
          <Col xs={24} md={8}>
            <Input
              placeholder="OT, equipo, descripción…"
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select showSearch optionFilterProp="label"
              placeholder="Tipo (Correctiva / Preventiva)"
              allowClear
              value={filterTipo}
              onChange={(v) => { setFilterTipo(v); setPage(1); }}
              options={tiposOTInterna.map((t) => ({ value: t.codigo, label: t.nombre }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={6}>
            <Select
              placeholder="Equipo"
              allowClear
              showSearch
              optionFilterProp="label"
              value={filterEquipo}
              onChange={(v) => { setFilterEquipo(v); setPage(1); }}
              options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} · ${e.descripcion}` }))}
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={5}>
            <Space>
              <ColumnasToggleButton<OTInternaRow>
                columns={baseColumns}
                ocultas={ocultas}
                setOcultas={setOcultas}
                obligatorias={["__num", "ot", "acciones"]}
              />
              <Button onClick={resetAnchos}>Restablecer anchos</Button>
            </Space>
          </Col>
          {esAdmin && (
            <Col xs={24}>
              <Switch size="small" checked={verInactivas} onChange={(v) => { setVerInactivas(v); setPage(1); }} />
              <span style={{ marginLeft: 8, fontSize: 13, color: brand.textSecondary }}>
                Ver OTs internas desactivadas (anuladas)
              </span>
            </Col>
          )}
        </Row>
      </Card>

      <TableDragWrapper>
        <Table
          rowKey="id"
          columns={visibleColumns(columnas, ocultas, ["__num", "ot", "acciones"])}
          components={components}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: 2200 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          // Row clickable — navega a la página detalle (igual que OT externas).
          // Filtramos clicks de los botones de acciones para no navegar cuando
          // ya están haciendo editar/eliminar desde la columna fija.
          onRow={(r) => ({
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest("button, .ant-popover, .ant-popconfirm")) return;
              router.push(`/ordenes-trabajo-internas/${r.id}`);
            },
            style: { cursor: "pointer" },
          })}
          // Capturamos el cambio del filtro ot_status para persistirlo. Otros
          // filtros (in-memory de AntD) no necesitan estado controlado.
          onChange={(_p, filters) => {
            const next = filters?.ot_status ?? null;
            setOtStatusFilter(next as string[] | null);
          }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "OTs internas",
          })}
        />
      </TableDragWrapper>

      <Modal
        title={editing ? `Editar ${formatOtInternaCodigo(editing.ot, "")}` : "Nueva OT Interna"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText={editing ? "Guardar" : "Crear"}
        cancelText="Cancelar"
        width={modalWidth(screens, 720)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="tipo_ot_interna_codigo"
                label="Tipo de OT"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Select showSearch optionFilterProp="label"
                  placeholder="Estratégica / No estratégica"
                  options={tiposOTInterna.map((t) => ({ value: t.codigo, label: t.nombre }))}
                  onChange={(value) => {
                    // Si se cambia a "No estratégica" (antes "Correctiva"),
                    // limpiar estrategia y task_list (campos exclusivos del
                    // flujo estratégico/preventivo). Aceptamos códigos viejos.
                    const nombre = tiposOTInterna.find((t) => t.codigo === value)?.nombre ?? "";
                    const codUp = (value ?? "").toString().toUpperCase();
                    if (codUp === "NO_ESTRATEGICA" || codUp === "CORRECTIVA" || codUp === "CORR" || /correctiv|no\s*estrat[ée]g/i.test(nombre)) {
                      form.setFieldsValue({ estrategia_id: undefined, task_list: undefined });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item
                name="area_taller"
                label="Área asignada"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Select
                  placeholder="Elegí un área o sub-área"
                  showSearch
                  optionFilterProp="label"
                  options={areasTallerGrouped()}
                  onChange={() => {
                    // Al cambiar el área, el equipo previo queda inválido (es de
                    // otro tipo o el área nueva no admite equipos). Lo limpiamos.
                    form.setFieldValue("equipo_codigo", undefined);
                  }}
                />
              </Form.Item>
            </Col>
            {tipoEquipoForm && (
              <Col xs={24} md={24}>
                <Form.Item
                  name="equipo_codigo"
                  label={tipoEquipoForm === "VEH" ? "Vehículo" : "Maquinaria"}
                  tooltip={
                    tipoEquipoForm === "VEH"
                      ? "Vehículo del taller al que aplica la OT interna."
                      : "Máquina del taller a la que aplica la OT interna."
                  }
                >
                  <Select
                    placeholder={
                      tipoEquipoForm === "VEH"
                        ? "Buscar vehículo (código o descripción)"
                        : "Buscar máquina (código o descripción)"
                    }
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    options={equipos.map((e) => ({ value: e.codigo, label: `${e.codigo} — ${e.descripcion}` }))}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={24}>
              <Form.Item
                name="descripcion"
                label="Descripción"
                rules={[{ required: true, message: "Requerido" }]}
              >
                <Input.TextArea rows={2} maxLength={500} placeholder="Detalle del trabajo a realizar" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="planta_codigo" label="Planta">
                <Select showSearch optionFilterProp="label"
                  allowClear
                  placeholder="Opcional"
                  options={plantas.map((p) => ({ value: p.codigo, label: p.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="prioridad_atencion_codigo" label="Prioridad">
                <Select showSearch optionFilterProp="label"
                  allowClear
                  placeholder="Opcional"
                  options={prioridades.map((p) => ({ value: p.codigo, label: p.nombre }))}
                />
              </Form.Item>
            </Col>
            {/* Semana revisión: solo aparece al editar — al crear no se pide.
                El form value se guarda como string "YYYYWww" (formato del sistema
                — ver src/lib/emergencia-cascade.ts) pero la UI usa DatePicker
                week. Convertimos entrada/salida con isoWeekParse/isoWeekFormat. */}
            {editing && (
              <Col xs={12} md={6}>
                <Form.Item
                  name="semana_revision"
                  label="Semana revisión"
                  tooltip="Semana ISO (formato YYYYWww, ej: 2026W18)"
                  // Form guarda string; DatePicker quiere Dayjs → convertimos
                  // ida y vuelta acá.
                  getValueProps={(value: string | null | undefined) => ({
                    value: isoWeekParse(value),
                  })}
                  normalize={(value: Dayjs | null) => isoWeekFormat(value)}
                >
                  <DatePicker
                    picker="week"
                    format="YYYY [W]WW"
                    style={{ width: "100%" }}
                    placeholder="Elegí semana"
                  />
                </Form.Item>
              </Col>
            )}
            {/* User Status NO se muestra al usuario — se asigna automáticamente:
                 - PLANIFICADO si la OT no es solicitud de mantenimiento
                 - EN_REVISION si lo es
                El estado avanzado (PROGRAMADO / REPROGRAMADO) se respeta al editar. */}
            <Col xs={12} md={12}>
              <Form.Item name="fecha_inicio_plan" label="Inicio planificado">
                <DatePicker
                  showTime
                  format="DD/MM/YY HH:mm"
                  style={{ width: "100%" }}
                  // Bloqueo de fechas pasadas: aplica cuando la OT quedará en
                  // PLANIFICADO/PROGRAMADO/REPROGRAMADO. No aplica si está en
                  // EN_REVISION (solicitud de mantenimiento) — esas pueden
                  // requerir registrar fechas reales de inicio aunque sean
                  // pasadas. `disabledDate` recibe Dayjs.
                  disabledDate={(current) => bloquearFechasPasadas
                    ? current && current.isBefore(dayjs().startOf("day"))
                    : false
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={12}>
              <Form.Item name="fecha_fin_plan" label="Fin planificado">
                <DatePicker
                  showTime
                  format="DD/MM/YY HH:mm"
                  style={{ width: "100%" }}
                  disabledDate={(current) => {
                    if (!current) return false;
                    // No permitir fin antes del inicio (si hay inicio seteado).
                    if (inicioPlanSel && current.isBefore(inicioPlanSel.startOf("day"))) {
                      return true;
                    }
                    // Si la OT termina en estado planificado/programado, tampoco
                    // permitir fechas pasadas.
                    if (bloquearFechasPasadas && current.isBefore(dayjs().startOf("day"))) {
                      return true;
                    }
                    return false;
                  }}
                />
              </Form.Item>
            </Col>
            {!esCorrectiva && (
              <>
                <Col xs={24} md={12}>
                  <Form.Item name="estrategia_id" label="Estrategia">
                    {/* Lista priorizada: arriba van las estrategias del equipo
                        seleccionado (lo "fijado" a esa maquinaria), abajo van
                        las que no están atadas a ningún equipo (genéricas /
                        compartidas) por si el user necesita una alternativa.
                        Las estrategias amarradas a OTROS equipos se ocultan. */}
                    <Select
                      allowClear
                      showSearch
                      placeholder={equipoSel
                        ? "Elegí estrategia del equipo (o una genérica)"
                        : "Elegí una estrategia"}
                      optionFilterProp="label"
                      // AntD Select acepta o un array plano de {value,label}
                      // o un array de grupos {label, options:[]}. Para que
                      // TypeScript no se queje de la unión, casteamos a un
                      // tipo amplio aceptado por el componente.
                      options={(() => {
                        const labelOf = (e: EstrategiaOption) => `${e.codigo} — ${e.descripcion}`;
                        const delEquipo = equipoSel
                          ? estrategias.filter((e) => e.equipo_codigo === equipoSel)
                          : [];
                        const genericas = estrategias.filter((e) => e.equipo_codigo == null);
                        if (delEquipo.length === 0 && genericas.length === 0) {
                          return estrategias.map((e) => ({
                            value: e.estrategia_id,
                            label: labelOf(e),
                          })) as unknown as { value: number; label: string }[];
                        }
                        const groups: Array<{
                          label: React.ReactNode;
                          options: { value: number; label: string }[];
                        }> = [];
                        if (delEquipo.length > 0) {
                          groups.push({
                            label: <Text strong style={{ fontSize: 11 }}>Del equipo seleccionado</Text>,
                            options: delEquipo.map((e) => ({ value: e.estrategia_id, label: labelOf(e) })),
                          });
                        }
                        if (genericas.length > 0) {
                          groups.push({
                            label: <Text type="secondary" style={{ fontSize: 11 }}>Genéricas (sin equipo)</Text>,
                            options: genericas.map((e) => ({ value: e.estrategia_id, label: labelOf(e) })),
                          });
                        }
                        return groups as unknown as { value: number; label: string }[];
                      })()}
                    />
                  </Form.Item>
                </Col>
              </>
            )}
            <Col xs={24} md={12}>
              <Form.Item name="asignado_a" label="Asignado a">
                <Select
                  allowClear
                  showSearch
                  placeholder="Operario que ejecuta"
                  optionFilterProp="label"
                  options={trabajadoresAsignables.map((t) => ({
                    value: t.nombre,
                    label: `${t.nombre} — ${t.area}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="comentarios" label="Comentarios">
                <Input.TextArea rows={3} maxLength={2000} placeholder="Notas / instrucciones / contexto adicional" />
              </Form.Item>
            </Col>
            <Col span={24}>
              {/* Flag para marcar OTs que nacen de una solicitud de mantenimiento
                  (un operativo pide intervención). Sirve para filtrar después en
                  la tabla. valuePropName="checked" porque es un Checkbox. */}
              <Form.Item name="solicitud_mantenimiento" valuePropName="checked" noStyle>
                <Checkbox>
                  Solicitud de mantenimiento{" "}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (marcala si esta OT nace de una solicitud externa, no de planificación)
                  </Text>
                </Checkbox>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

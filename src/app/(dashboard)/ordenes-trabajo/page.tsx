"use client";

import { useState, useEffect, useCallback, useMemo, type Key } from "react";
import {
  Typography,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Row,
  Col,
  Card,
  Tooltip,
  App,
  Popconfirm,
  Switch,
  Segmented,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  AuditOutlined,
  DeleteOutlined,
  StopOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useSession } from "next-auth/react";
import {
  numeracionColumn,
  paginacionEstandar,
  useColumnasOcultas,
  usePersistedState,
  useRangoFechasPersistente,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  RangoFechasFiltro,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { brand } from "@/lib/theme";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { formatDateOnly } from "@/lib/dates";
import OTDetalleModal from "@/components/modules/ordenes-trabajo/OTDetalleModal";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";
import { formatOtCodigo } from "@/lib/ot-formato";

const { Title } = Typography;

interface OTRecord {
  id: number;
  // `ot` ahora es número (INTEGER) tras la migración del 2026-05-28.
  ot: number | null;
  activo: boolean;
  estrategia: boolean;
  cantidad: number;
  tipo: string | null;
  tipo_codigo: string | null;
  tipo_ot: { codigo: string; nombre: string } | null;
  np: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  equipo_codigo: string | null;
  ns: string | null;
  plaqueteo: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  po_item: string | null;
  id_viajero: string | null;
  guia_remision: string | null;
  empresa_entrega: string | null;
  descripcion: string | null;
  fecha_recepcion: string | null;
  pcr: number | null;
  horas: number | null;
  porcentaje_pcr: number | null;
  contrato_dias: number | null;
  fecha_requerimiento_cliente: string | null;
  fecha_reprogramada: string | null;
  comentarios: string | null;
  ot_status_codigo: string | null;
  recursos_status_codigo: string | null;
  taller_status_codigo: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string; tipo?: { nombre: string } | null; flota?: { nombre: string } | null; fabricante?: { nombre: string } | null; posicion?: { nombre: string } | null } | null;
  fabricante: { nombre: string } | null;
  atencion_reparacion: { nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  ot_status: { nombre: string } | null;
  recursos_status: { nombre: string } | null;
  taller_status: { nombre: string } | null;
  tipo_reparacion: { nombre: string } | null;
  tipo_garantia: { nombre: string } | null;
  garantia: { nombre: string } | null;
  base_metalica: { nombre: string } | null;
  usuario_crea: string | null;
  fecha_creacion: string | null;
  // Cotización — monto + divisa. Antes era export-only; ahora aparece en la
  // tabla como columna "Monto Cotizado" (decisión del usuario).
  monto_cotizacion: string | number | null;
  moneda_cotizacion_codigo: string | null;
  // Tracking de evaluación + tiempo en taller (campos históricos). Antes
  // solo iban al export — ahora aparecen como columnas opcionales en la
  // tabla (ocultas por default; el usuario las habilita desde "Columnas").
  fecha_evaluacion?: string | null;
  evaluador?: string | null;
  // Aprobación INTERNA de la evaluación (distinta de fecha_aprobacion, que
  // es la aprobación del CLIENTE sobre la cotización).
  fecha_aprobacion_evaluacion?: string | null;
  evaluacion_aprobado_por?: string | null;
  fecha_cotizacion?: string | null;
  fecha_aprobacion?: string | null;
  fecha_facturacion?: string | null;
  // Reparación en vendor externo (boolean + nombre del proveedor).
  reparacion_externa?: boolean;
  vendor_externo?: string | null;
  // Característica del cilindro (ESTANDAR / NO_ESTANDAR / null) — dato
  // importado del Excel "Data_data". Independiente de tipo_reparacion.
  caracteristica_cilindro?: string | null;
  dias_en_taller?: number | null;
  // Estado de la hoja de evaluación técnica (último registro). null = sin
  // evaluación todavía.
  evaluaciones_tecnicas?: { estado: string }[];
  // Adjuntos de la etapa "po_cliente" — viene como array con 0 o 1 id desde
  // la API. Sirve solo como flag para derivar la columna "Estado PO".
  adjuntos?: { id: number }[];
}

// Campos extra que la API devuelve y van al Excel pero no se renderizan en la
// tabla. Los que ya tienen columna propia (fecha_evaluacion, evaluador,
// fecha_cotizacion, fecha_aprobacion, fecha_facturacion, dias_en_taller,
// reparacion_externa, vendor_externo) ya están en OTRecord; acá quedan solo
// los export-only puros.
interface OTRecordExport extends OTRecord {
  nro_informe_evaluacion?: string | null;
  nro_cotizacion?: string | null;
  fecha_entrega?: string | null;
  cumplimiento?: string | null;
  dias_proceso?: number | null;
  nro_factura?: string | null;
}

const otStatusColor: Record<string, string> = {
  Abierta: "blue",
  Cerrada: "green",
  "No Ejecutada": "default",
};

const prioridadColor: Record<string, string> = {
  "1": "red",
  "2": "orange",
  "3": "cyan",
  E: "volcano",
};

// Color e etiqueta para el icono / tag del estado de la hoja de evaluación.
// Estados reales: BORRADOR, PENDIENTE_APROBACION, APROBADA, RECHAZADA.
// (COMPLETADA fue eliminado del flujo — antes era un intermedio entre BORRADOR
//  y PENDIENTE_APROBACION; ahora "guardar" deja la evaluación en BORRADOR y se
//  pasa directo a PENDIENTE_APROBACION al solicitar revisión.)
const EVAL_META: Record<string, { color: string; label: string; tag: string }> = {
  BORRADOR: { color: "#FAAD14", label: "Borrador", tag: "warning" },          // amarillo
  PENDIENTE_APROBACION: { color: "#1677FF", label: "Pendiente aprobación", tag: "processing" },
  APROBADA: { color: "#52C41A", label: "Aprobada", tag: "success" },          // verde
  RECHAZADA: { color: "#cf1322", label: "Rechazada", tag: "error" },
};
function evalEstadoMeta(estado: string | null) {
  if (!estado) return { color: "#bfbfbf", label: "Sin evaluación", tag: "default" };
  return EVAL_META[estado] ?? { color: "#8c8c8c", label: estado, tag: "default" };
}

// ── Config de filtros server-side (post-procesado de columnas) ──
// Columnas de texto libre: filtran por `contains` (param txt_<key>).
// usuario_crea NO va aquí: la columna "Creada por" usa el filtro
// automático de useColumnasRedimensionables (checkboxes con valores únicos
// del dataset). Decisión del usuario — más natural para columnas con pocos
// valores repetidos como nombre del creador.
const TEXT_KEYS = new Set<string>([
  "equipo_codigo", "descripcion", "tipo", "np", "cod_rep_flota", "cod_rep_posicion",
  "plaqueteo", "wo_cliente", "po_cliente", "po_item", "id_viajero",
  "guia_remision", "empresa_entrega", "comentarios",
]);
// Columnas enum cuyas opciones vienen del endpoint /facets.
const ENUM_FACET_KEYS = new Set<string>([
  "cliente", "codigo_reparacion", "prioridad_atencion", "ot_status", "recursos_status",
  "taller_status", "tipo_ot", "fabricante", "atencion_reparacion",
  "tipo_reparacion", "tipo_garantia",
]);
// Columnas con lista de opciones fija (no facets).
const FIXED_FILTERS: Record<string, { text: string; value: string }[]> = {
  garantia: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
  base_metalica: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
  evaluacion_estado: [
    { text: "Sin evaluación", value: "__none__" },
    ...Object.keys(EVAL_META).map((k) => ({ text: EVAL_META[k].label, value: k })),
  ],
  estado_po: [
    { text: "Pdt de PO", value: "PDT_PO" },
    { text: "Con PO",    value: "CON_PO" },
  ],
};

export default function OrdenesTrabajoPage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const { data: session } = useSession();
  // Eliminar / desactivar OTs es exclusivo del admin (operación destructiva).
  const esAdmin = ((session?.user as { roles?: string[] } | undefined)?.roles ?? []).includes("admin");
  const [data, setData] = useState<OTRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  // Filtros: ahora PERSISTENTES por usuario (sobreviven F5 y navegación).
  const [search, setSearch] = usePersistedState<string>("ot-list-search", "");
  // Paginación server-side: los filtros de columna y el orden se mandan al
  // server. `columnFilters` = estado de filtros de la tabla (key → valores),
  // `sorter` = columna+orden activos, `facets` = opciones de los dropdowns enum.
  // Default inicial: filtrar por OT Status "Abierta" — el usuario casi siempre
  // entra para trabajar con OTs activas. Si después aplica/quita filtros, su
  // selección queda persistida y se respeta en la próxima entrada.
  const [columnFilters, setColumnFilters] = usePersistedState<Record<string, Key[] | null>>(
    "ot-list-column-filters",
    { ot_status: ["Abierta"] },
  );
  // Sort NO se persiste (decisión: F5 vuelve al sort default).
  const [sorter, setSorter] = useState<{ field: string | null; order: "ascend" | "descend" | null }>({ field: null, order: null });
  const [facets, setFacets] = useState<Record<string, { value: string; text: string }[]>>({});
  // Años disponibles (2 dígitos) y los seleccionados. Por default, el año actual.
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([]);
  const [aniosSel, setAniosSel] = usePersistedState<number[]>("ot-list-anios", [new Date().getFullYear() % 100]);
  // Admin: ver también las OTs desactivadas (para reactivarlas).
  const [verInactivas, setVerInactivas] = usePersistedState<boolean>("ot-list-ver-inactivas", false);
  // v2: nuevas columnas opcionales (tipo, NP, flota, posición, fabricante, garantía, base metálica, etc.)
  // ocultas por default — el usuario las habilita desde el botón "Columnas".
  const { ocultas, setOcultas } = useColumnasOcultas("ordenes-trabajo-list-cols-v2", [
    "tipo", "np", "cod_rep_flota", "fabricante",
    "plaqueteo", "wo_cliente", "po_cliente", "po_item", "id_viajero", "guia_remision", "empresa_entrega",
    "usuario_crea", "fecha_creacion",
    "pcr", "horas", "contrato_dias",
    "fecha_requerimiento_cliente", "fecha_reprogramada",
    // Bloque "ciclo evaluación → cotización → aprobación → facturación":
    // ocultas por default (son muchas columnas; el usuario las activa
    // desde el botón "Columnas" cuando hace análisis).
    "fecha_evaluacion", "evaluador", "fecha_aprobacion_evaluacion",
    "evaluacion_aprobado_por", "fecha_cotizacion",
    "caracteristica_cilindro",
    "reparacion_externa", "vendor_externo",
    "fecha_aprobacion", "fecha_facturacion",
    "dias_en_taller",
    "atencion_reparacion", "tipo_reparacion", "garantia", "tipo_garantia", "base_metalica",
    "comentarios",
  ]);
  const { rango: rangoRecepcion, setRango: setRangoRecepcion } = useRangoFechasPersistente("ot-list-rango-recepcion");

  // Modal detalle
  const [modalOtId, setModalOtId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Filtros server-side activos (todo lo que vamos a mandar al endpoint,
  // EXCEPTO page/limit que cambian por paginación). Memoizado para reusar
  // entre fetchData y el botón de exportar (que respeta los mismos filtros).
  const filtrosServer = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    for (const [key, vals] of Object.entries(columnFilters)) {
      // TEXT_KEYS son inputs de búsqueda (un solo valor); el resto son enum
      // multi-select. Para multi-select mandamos los valores como CSV — el
      // backend hace `value.split(",")` y arma un `where: { in: [...] }`.
      if (TEXT_KEYS.has(key)) {
        const v = Array.isArray(vals) ? vals[0] : vals;
        if (v == null || v === "") continue;
        params.set(`txt_${key}`, String(v));
        continue;
      }
      if (!Array.isArray(vals) || vals.length === 0) continue;
      const csv = vals.filter((x) => x != null && x !== "").map(String).join(",");
      if (!csv) continue;
      params.set(key, csv);
    }
    if (sorter.field && sorter.order) {
      params.set("sortField", sorter.field);
      params.set("sortOrder", sorter.order);
    }
    if (rangoRecepcion.desde) params.set("fecha_recepcion_desde", rangoRecepcion.desde.format("YYYY-MM-DD"));
    if (rangoRecepcion.hasta) params.set("fecha_recepcion_hasta", rangoRecepcion.hasta.format("YYYY-MM-DD"));
    if (aniosSel.length) params.set("anios", aniosSel.join(","));
    if (verInactivas) params.set("incluirInactivas", "1");
    return params;
  }, [search, columnFilters, sorter, rangoRecepcion, aniosSel, verInactivas]);

  // Paginación server-side: trae solo la página actual (50). Manda al server
  // la búsqueda, los filtros de columna, el rango de fecha y el orden. Campos
  // de texto van como txt_<campo>; el resto (enum) por su nombre de columna.
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(filtrosServer);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    const res = await fetch(`/api/ordenes-trabajo?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [page, pageSize, filtrosServer]);

  // Desactivar (anular, reversible) / reactivar una OT. Solo admin.
  async function toggleActivo(record: OTRecord) {
    const activar = !record.activo;
    const res = await fetch(`/api/ordenes-trabajo/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: activar }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { message.error(json.error ?? "No se pudo cambiar el estado"); return; }
    message.success(activar ? "OT reactivada" : "OT desactivada — su número queda libre");
    fetchData();
  }

  // Eliminar OT en cascada (irreversible). Solo admin. Confirmación reforzada
  // porque borra TODO lo relacionado, incluidas las Órdenes de Compra.
  function confirmarEliminar(record: OTRecord) {
    modal.confirm({
      title: `Eliminar OT ${record.ot ?? `#${record.id}`} definitivamente`,
      okText: "Eliminar todo",
      okButtonProps: { danger: true },
      cancelText: "Cancelar",
      width: 520,
      content: (
        <div style={{ fontSize: 13 }}>
          Esto borra <b>permanentemente</b> la OT y <b>todo lo relacionado</b>:
          evaluación, planificación, requerimientos, adjuntos, historial
          <b> y las Órdenes de Compra vinculadas</b>. No se puede deshacer.
          <br /><br />
          Si solo querés ocultarla y liberar su número, usá <b>Desactivar</b> en su lugar.
        </div>
      ),
      onOk: async () => {
        const res = await fetch(`/api/ordenes-trabajo/${record.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { message.error(json.error ?? "No se pudo eliminar"); throw new Error("fail"); }
        message.success("OT eliminada");
        fetchData();
      },
    });
  }

  // Opciones de los filtros enum (todas, no solo las de la página actual).
  useEffect(() => {
    fetch("/api/ordenes-trabajo/facets")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) { setFacets(j); setAniosDisponibles(j.anios ?? []); } })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setSearch("");
    setColumnFilters({});
    setSorter({ field: null, order: null });
    setRangoRecepcion({ desde: null, hasta: null });
    setAniosSel([new Date().getFullYear() % 100]); // vuelve al año actual
    setPage(1);
  }

  const columns: ColumnsType<OTRecord> = [
    numeracionColumn<OTRecord>({ current: page, pageSize }),
    {
      key: "ot",
      title: "OT",
      dataIndex: "ot",
      width: 150,
      sorter: (a, b) => Number(a.ot ?? 0) - Number(b.ot ?? 0),
      ...filtroPorColumna(data, "ot"),
      // Prefijo según tipo: V (Bien) / S (Servicio) / sin prefijo (Reparación).
      // El número en BD sigue siendo entero; el prefijo es solo visual.
      render: (_v: unknown, r: OTRecord) => (
        <Space size={4}>
          <Tooltip title="Abrir página de la OT (URL compartible)">
            <Tag
              color={brand.navy}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}
            >
              {formatOtCodigo(r.ot, r.tipo_ot?.codigo ?? r.tipo_codigo, "—")}
            </Tag>
          </Tooltip>
          {!r.activo && <Tag color="default">desactivada</Tag>}
        </Space>
      ),
    },
    {
      key: "cliente",
      title: "Cliente",
      dataIndex: "cliente",
      width: 150,
      ellipsis: true,
      sorter: (a, b) => (a.cliente?.nombre_comercial ?? a.cliente?.razon_social ?? "").localeCompare(b.cliente?.nombre_comercial ?? b.cliente?.razon_social ?? ""),
      render: (_: unknown, r: OTRecord) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "-",
    },
    {
      key: "codigo_reparacion",
      title: "Código Reparación",
      width: 140,
      ellipsis: true,
      sorter: (a, b) => (a.codigo_reparacion?.codigo ?? "").localeCompare(b.codigo_reparacion?.codigo ?? ""),
      filters: [...new Set(data.map((r) => r.codigo_reparacion?.codigo).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.codigo_reparacion?.codigo === value,
      render: (_: unknown, r: OTRecord) => r.codigo_reparacion?.codigo ?? "-",
    },
    {
      key: "equipo_codigo",
      title: "Equipo",
      dataIndex: "equipo_codigo",
      width: 100,
      sorter: (a, b) => (a.equipo_codigo ?? "").localeCompare(b.equipo_codigo ?? ""),
      ...filtroPorColumna(data, "equipo_codigo"),
    },
    {
      key: "cantidad",
      title: "Cantidad",
      dataIndex: "cantidad",
      width: 90,
      align: "right" as const,
      sorter: (a, b) => Number(a.cantidad ?? 1) - Number(b.cantidad ?? 1),
      render: (v: number | null) => {
        const n = Number(v ?? 1);
        // Resaltamos cantidades > 1 (típico de OT de Bienes con varias unidades)
        // para que el operario las detecte sin abrir la OT.
        return n > 1
          ? <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>{n}</Tag>
          : <span>{n}</span>;
      },
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? ""),
      ...filtroPorColumna(data, "descripcion"),
    },
    {
      key: "fecha_recepcion",
      title: "Fecha Recepción",
      dataIndex: "fecha_recepcion",
      width: 130,
      sorter: (a, b) => (a.fecha_recepcion ?? "").localeCompare(b.fecha_recepcion ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "porcentaje_pcr",
      title: "% PCR",
      dataIndex: "porcentaje_pcr",
      width: 80,
      align: "center",
      sorter: (a, b) => (a.porcentaje_pcr ?? 0) - (b.porcentaje_pcr ?? 0),
      render: (v: number | null) => v != null ? `${v}%` : "-",
    },
    {
      key: "prioridad_atencion",
      title: "Prioridad",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.prioridad_atencion?.codigo ?? "").localeCompare(b.prioridad_atencion?.codigo ?? ""),
      filters: [...new Set(data.map((r) => r.prioridad_atencion?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.prioridad_atencion?.nombre === value,
      render: (_: unknown, r: OTRecord) =>
        r.prioridad_atencion ? (
          <Tag color={prioridadColor[r.prioridad_atencion.codigo] ?? "default"}>
            {r.prioridad_atencion.nombre}
          </Tag>
        ) : "-",
    },
    {
      key: "ot_status",
      title: "OT Status",
      width: 120,
      sorter: (a, b) => (a.ot_status?.nombre ?? "").localeCompare(b.ot_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.ot_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.ot_status?.nombre === value,
      render: (_: unknown, r: OTRecord) =>
        r.ot_status ? (
          <Tag color={otStatusColor[r.ot_status_codigo ?? ""] ?? "default"}>
            {r.ot_status.nombre}
          </Tag>
        ) : "-",
    },
    {
      key: "evaluacion_estado",
      title: "Evaluación",
      width: 140,
      sorter: (a, b) => (a.evaluaciones_tecnicas?.[0]?.estado ?? "").localeCompare(b.evaluaciones_tecnicas?.[0]?.estado ?? ""),
      filters: [
        { text: "Sin evaluación", value: "__none__" },
        ...Object.keys(EVAL_META).map((k) => ({ text: EVAL_META[k].label, value: k })),
      ],
      onFilter: (value, r) => {
        const est = r.evaluaciones_tecnicas?.[0]?.estado ?? null;
        return value === "__none__" ? est === null : est === value;
      },
      render: (_: unknown, r: OTRecord) => {
        const est = r.evaluaciones_tecnicas?.[0]?.estado ?? null;
        const meta = evalEstadoMeta(est);
        return <Tag color={meta.tag}>{meta.label}</Tag>;
      },
    },
    {
      key: "recursos_status",
      title: "Recursos",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.recursos_status?.nombre ?? "").localeCompare(b.recursos_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.recursos_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.recursos_status?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.recursos_status?.nombre ?? "-",
    },
    {
      key: "taller_status",
      title: "Taller",
      width: 160,
      ellipsis: true,
      sorter: (a, b) => (a.taller_status?.nombre ?? "").localeCompare(b.taller_status?.nombre ?? ""),
      filters: [...new Set(data.map((r) => r.taller_status?.nombre).filter(Boolean) as string[])]
        .sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.taller_status?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.taller_status?.nombre ?? "-",
    },
    {
      key: "estado_po",
      title: "Estado PO",
      width: 110,
      align: "center",
      // El filtro real (FIXED_FILTERS["estado_po"]) lo inyecta serverColumns —
      // acá ponemos un array vacío para que la columna sea filtrable.
      filters: [],
      render: (_: unknown, r: OTRecord) => {
        const conPo = (r.adjuntos?.length ?? 0) > 0;
        return <Tag color={conPo ? "green" : "orange"}>{conPo ? "Con PO" : "Pdt de PO"}</Tag>;
      },
    },
    {
      key: "monto_cotizado",
      title: "Monto Cotizado",
      dataIndex: "monto_cotizacion",
      width: 140,
      align: "right",
      sorter: (a, b) => Number(a.monto_cotizacion ?? 0) - Number(b.monto_cotizacion ?? 0),
      render: (_: unknown, r: OTRecord) => {
        if (r.monto_cotizacion == null || r.monto_cotizacion === "") return "-";
        const n = Number(r.monto_cotizacion);
        if (!Number.isFinite(n)) return "-";
        const cur = r.moneda_cotizacion_codigo ?? "";
        const monto = n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return cur ? `${cur} ${monto}` : monto;
      },
    },
    // ── Columnas opcionales (ocultas por default) ──
    {
      key: "tipo_ot", title: "Tipo OT", width: 100,
      filters: [...new Set(data.map((r) => r.tipo_ot?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      onFilter: (value, r) => r.tipo_ot?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_ot?.nombre ?? r.tipo_codigo ?? "-",
    },
    {
      key: "tipo", title: "Tipo (Código Reparación)", dataIndex: "tipo", width: 180,
      ...filtroPorColumna(data, "tipo"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "np", title: "N/P", dataIndex: "np", width: 130,
      ...filtroPorColumna(data, "np"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "cod_rep_flota", title: "Flota", dataIndex: "cod_rep_flota", width: 110,
      ...filtroPorColumna(data, "cod_rep_flota"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "cod_rep_posicion", title: "Posición", dataIndex: "cod_rep_posicion", width: 100,
      ...filtroPorColumna(data, "cod_rep_posicion"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "fabricante", title: "Fabricante", width: 140, ellipsis: true,
      filters: [...new Set(data.map((r) => r.fabricante?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.fabricante?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.fabricante?.nombre ?? "-",
    },
    {
      key: "plaqueteo", title: "Plaqueteo", dataIndex: "plaqueteo", width: 110,
      ...filtroPorColumna(data, "plaqueteo"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "wo_cliente", title: "WO Cliente", dataIndex: "wo_cliente", width: 120,
      ...filtroPorColumna(data, "wo_cliente"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "po_cliente", title: "PO Cliente", dataIndex: "po_cliente", width: 120,
      ...filtroPorColumna(data, "po_cliente"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "po_item", title: "PO Item", dataIndex: "po_item", width: 100,
      ...filtroPorColumna(data, "po_item"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "id_viajero", title: "ID Viajero", dataIndex: "id_viajero", width: 120,
      ...filtroPorColumna(data, "id_viajero"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "guia_remision", title: "Guía Remisión", dataIndex: "guia_remision", width: 140,
      ...filtroPorColumna(data, "guia_remision"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "empresa_entrega", title: "Empresa que entrega", dataIndex: "empresa_entrega", width: 180, ellipsis: true,
      ...filtroPorColumna(data, "empresa_entrega"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "pcr", title: "PCR", dataIndex: "pcr", width: 90, align: "right",
      sorter: (a, b) => (a.pcr ?? 0) - (b.pcr ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "horas", title: "Horas", dataIndex: "horas", width: 90, align: "right",
      sorter: (a, b) => (a.horas ?? 0) - (b.horas ?? 0),
      render: (v: number | null) => v != null ? Number(v).toLocaleString() : "-",
    },
    {
      key: "contrato_dias", title: "Días contrato", dataIndex: "contrato_dias", width: 110, align: "right",
      sorter: (a, b) => (a.contrato_dias ?? 0) - (b.contrato_dias ?? 0),
      render: (v: number | null) => v != null ? `${v} d` : "-",
    },
    {
      key: "fecha_requerimiento_cliente", title: "Fecha Requerimiento Cliente", dataIndex: "fecha_requerimiento_cliente", width: 180,
      sorter: (a, b) => (a.fecha_requerimiento_cliente ?? "").localeCompare(b.fecha_requerimiento_cliente ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      key: "fecha_reprogramada", title: "Fecha Reprogramada", dataIndex: "fecha_reprogramada", width: 150,
      sorter: (a, b) => (a.fecha_reprogramada ?? "").localeCompare(b.fecha_reprogramada ?? ""),
      render: (v: string | null) => formatDateOnly(v),
    },
    {
      // Fecha en que se completó la evaluación técnica.
      key: "fecha_evaluacion", title: "Fecha Evaluación", dataIndex: "fecha_evaluacion", width: 140,
      sorter: (a, b) => (a.fecha_evaluacion ?? "").localeCompare(b.fecha_evaluacion ?? ""),
      render: (v: string | null | undefined) => formatDateOnly(v ?? null),
    },
    {
      // Persona que hizo la evaluación.
      key: "evaluador", title: "Evaluador", dataIndex: "evaluador", width: 160, ellipsis: true,
      ...filtroPorColumna(data, "evaluador" as never),
      render: (v: string | null | undefined) => v ?? "-",
    },
    {
      // Fecha en que se APROBÓ INTERNAMENTE la evaluación (firma del supervisor).
      // Distinto de fecha_aprobacion, que es la aprobación del CLIENTE sobre cotización.
      key: "fecha_aprobacion_evaluacion", title: "Fecha Aprobación Evaluación", dataIndex: "fecha_aprobacion_evaluacion", width: 200,
      sorter: (a, b) => (a.fecha_aprobacion_evaluacion ?? "").localeCompare(b.fecha_aprobacion_evaluacion ?? ""),
      render: (v: string | null | undefined) => formatDateOnly(v ?? null),
    },
    {
      // Persona que aprobó internamente la evaluación técnica.
      key: "evaluacion_aprobado_por", title: "Evaluación Aprobado Por", dataIndex: "evaluacion_aprobado_por", width: 180, ellipsis: true,
      ...filtroPorColumna(data, "evaluacion_aprobado_por" as never),
      render: (v: string | null | undefined) => v ?? "-",
    },
    {
      // Fecha de cotización (cuando se cotizó al cliente).
      key: "fecha_cotizacion", title: "Fecha Cotización", dataIndex: "fecha_cotizacion", width: 140,
      sorter: (a, b) => (a.fecha_cotizacion ?? "").localeCompare(b.fecha_cotizacion ?? ""),
      render: (v: string | null | undefined) => formatDateOnly(v ?? null),
    },
    {
      // Característica del cilindro — ESTANDAR / NO_ESTANDAR / "—" cuando
      // no hay dato. Independiente del Tipo de Reparación (catálogo).
      key: "caracteristica_cilindro", title: "Característica Cilindro", dataIndex: "caracteristica_cilindro", width: 170,
      filters: [
        { text: "ESTANDAR", value: "ESTANDAR" },
        { text: "NO ESTANDAR", value: "NO_ESTANDAR" },
        { text: "(vacío)", value: "__vacio__" },
      ],
      filterMultiple: true,
      onFilter: (value, r) => value === "__vacio__" ? !r.caracteristica_cilindro : r.caracteristica_cilindro === value,
      render: (v: string | null | undefined) => {
        if (!v) return <span style={{ color: "#8c8c8c" }}>—</span>;
        const label = v === "NO_ESTANDAR" ? "NO ESTANDAR" : v;
        return <Tag color={v === "ESTANDAR" ? "blue" : "purple"}>{label}</Tag>;
      },
    },
    {
      // Flag: la reparación se hace en taller externo (no HP&K).
      key: "reparacion_externa", title: "Reparación Externa", width: 130, align: "center",
      filters: [{ text: "Sí", value: "true" }, { text: "No", value: "false" }],
      filterMultiple: false,
      onFilter: (value, r) => String(!!r.reparacion_externa) === String(value),
      sorter: (a, b) => Number(!!b.reparacion_externa) - Number(!!a.reparacion_externa),
      render: (_: unknown, r: OTRecord) =>
        r.reparacion_externa ? <Tag color="orange">Sí</Tag> : <span style={{ color: "#8c8c8c" }}>—</span>,
    },
    {
      // Nombre del proveedor externo (cuando aplica).
      key: "vendor_externo", title: "Vendor Externo", dataIndex: "vendor_externo", width: 160, ellipsis: true,
      ...filtroPorColumna(data, "vendor_externo" as never),
      render: (v: string | null | undefined) => v ?? "-",
    },
    {
      // Fecha en que el CLIENTE aprobó la cotización (distinta de
      // fecha_aprobacion_evaluacion que es la aprobación interna).
      key: "fecha_aprobacion", title: "Fecha Aprobación", dataIndex: "fecha_aprobacion", width: 150,
      sorter: (a, b) => (a.fecha_aprobacion ?? "").localeCompare(b.fecha_aprobacion ?? ""),
      render: (v: string | null | undefined) => formatDateOnly(v ?? null),
    },
    {
      // Fecha de facturación al cliente.
      key: "fecha_facturacion", title: "Fecha Facturación", dataIndex: "fecha_facturacion", width: 150,
      sorter: (a, b) => (a.fecha_facturacion ?? "").localeCompare(b.fecha_facturacion ?? ""),
      render: (v: string | null | undefined) => formatDateOnly(v ?? null),
    },
    {
      // Días totales que el componente lleva en taller (se calcula al cerrar la OT).
      // Igual que arriba: viene del campo histórico de la BD.
      key: "dias_en_taller", title: "Días en taller", dataIndex: "dias_en_taller", width: 120, align: "right",
      sorter: (a, b) => (a.dias_en_taller ?? 0) - (b.dias_en_taller ?? 0),
      render: (v: number | null | undefined) => v != null ? `${v} d` : "-",
    },
    {
      key: "fecha_creacion", title: "Fecha Creación", dataIndex: "fecha_creacion", width: 160,
      sorter: (a, b) => (a.fecha_creacion ?? "").localeCompare(b.fecha_creacion ?? ""),
      render: (v: string | null) => v ? dayjs(v).format("DD/MM/YY HH:mm") : "-",
    },
    {
      key: "usuario_crea", title: "Creada por", dataIndex: "usuario_crea", width: 130,
      ...filtroPorColumna(data, "usuario_crea"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "atencion_reparacion", title: "Atención Reparación", width: 170, ellipsis: true,
      filters: [...new Set(data.map((r) => r.atencion_reparacion?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.atencion_reparacion?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.atencion_reparacion?.nombre ?? "-",
    },
    {
      key: "tipo_reparacion", title: "Tipo Reparación", width: 150,
      filters: [...new Set(data.map((r) => r.tipo_reparacion?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.tipo_reparacion?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_reparacion?.nombre ?? "-",
    },
    {
      key: "garantia", title: "Garantía", width: 90, align: "center",
      filters: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
      onFilter: (value, r) => r.garantia?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.garantia?.nombre ?? "-",
    },
    {
      key: "tipo_garantia", title: "Tipo Garantía", width: 120,
      filters: [...new Set(data.map((r) => r.tipo_garantia?.nombre).filter(Boolean) as string[])].sort().map((v) => ({ text: v, value: v })),
      filterSearch: true,
      onFilter: (value, r) => r.tipo_garantia?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.tipo_garantia?.nombre ?? "-",
    },
    {
      key: "base_metalica", title: "Base metálica", width: 110, align: "center",
      filters: [{ text: "Si", value: "Si" }, { text: "No", value: "No" }],
      onFilter: (value, r) => r.base_metalica?.nombre === value,
      render: (_: unknown, r: OTRecord) => r.base_metalica?.nombre ?? "-",
    },
    {
      key: "comentarios", title: "Comentarios", dataIndex: "comentarios", width: 200, ellipsis: true,
      ...filtroPorColumna(data, "comentarios"),
      render: (v: string | null) => v ?? "-",
    },
    {
      key: "acciones",
      title: "",
      width: esAdmin ? 180 : 90,
      align: "center",
      fixed: "right",
      render: (_: unknown, record: OTRecord) => (
        <Space size={0}>
          <Tooltip title="Ver detalle">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => { setModalOtId(record.id); setModalOpen(true); }}
            />
          </Tooltip>
          {(() => {
            const estadoEval = record.evaluaciones_tecnicas?.[0]?.estado ?? null;
            const meta = evalEstadoMeta(estadoEval);
            return (
              <Tooltip title={`Hoja de evaluación — ${meta.label}`}>
                <Button
                  type="text"
                  icon={<AuditOutlined style={{ color: meta.color, fontSize: 16 }} />}
                  onClick={() => router.push(`/ordenes-trabajo/${record.id}/evaluacion`)}
                />
              </Tooltip>
            );
          })()}
          {esAdmin && (record.activo ? (
            <Popconfirm
              title="Desactivar esta OT"
              description="Se oculta de los listados y su número queda libre. Reversible."
              okText="Desactivar"
              cancelText="Cancelar"
              onConfirm={() => toggleActivo(record)}
            >
              <Tooltip title="Desactivar (anular)">
                <Button type="text" icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          ) : (
            <Tooltip title="Reactivar OT">
              <Button type="text" icon={<UndoOutlined style={{ color: brand.success }} />} onClick={() => toggleActivo(record)} />
            </Tooltip>
          ))}
          {esAdmin && (
            <Tooltip title="Eliminar definitivamente (cascada)">
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmarEliminar(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // ── Post-proceso: convierte los filtros/orden client-side de cada columna en
  // server-side (paginación server-side). Mantiene render/width/etc. intactos.
  //   - enum (facets o lista fija) → dropdown con opciones completas
  //   - texto libre → input de búsqueda (contains)
  //   - sorter función → sorter: true (orden en el server)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverColumns = (columns as any[]).map((col) => {
    const key = col.key as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = { ...col };
    if (c.sorter) { c.sorter = true; c.sortOrder = sorter.field === key ? sorter.order : null; }
    // limpiar config de filtro client-side
    delete c.onFilter; delete c.filterSearch; delete c.filters; delete c.filterDropdown; delete c.filterIcon; delete c.filterMultiple;
    // antd exige que TODAS las columnas tengan o NO tengan filteredValue.
    // Las columnas filtrables lo sobreescriben abajo; el resto queda en null.
    c.filteredValue = null;
    if (FIXED_FILTERS[key]) {
      c.filters = FIXED_FILTERS[key]; c.filterMultiple = true; c.filteredValue = columnFilters[key] ?? null;
    } else if (ENUM_FACET_KEYS.has(key)) {
      c.filters = facets[key] ?? []; c.filterSearch = true; c.filterMultiple = true; c.filteredValue = columnFilters[key] ?? null;
    } else if (TEXT_KEYS.has(key)) {
      c.filteredValue = columnFilters[key] ?? null;
      c.filterIcon = (filtered: boolean) => <SearchOutlined style={{ color: filtered ? brand.navy : undefined }} />;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      c.filterDropdown = ({ setSelectedKeys, selectedKeys, confirm, clearFilters: clr }: any) => (
        <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            placeholder={`Buscar ${typeof col.title === "string" ? col.title : ""}`}
            value={selectedKeys[0] as string}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()}
            style={{ width: 200, marginBottom: 8, display: "block" }}
          />
          <Space>
            <Button type="primary" size="small" onClick={() => confirm()}>Buscar</Button>
            <Button size="small" onClick={() => { clr?.(); confirm(); }}>Limpiar</Button>
          </Space>
        </div>
      );
    }
    return c;
  });

  const { columnas: columnsResizable, components: tableComponents, resetAnchos, TableDragWrapper, orden: ordenColumnas } =
    useColumnasRedimensionables<OTRecord>(serverColumns, "ot-list-cols-widths-v1", { data });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Órdenes de Trabajo</Title>
        <Space>
          <Tooltip title="Refrescar el listado preservando filtros, paginación y ancho de columnas (sin recargar la página).">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchData()}
              loading={loading}
            >
              Refrescar
            </Button>
          </Tooltip>
          <ColumnasToggleButton<OTRecord>
            columns={columns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "ot", "acciones"]}
          />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
          <ExportarExcelButton<OTRecordExport>
            endpoint="/api/ordenes-trabajo?export=1"
            filename="OTs-Externas"
            sheetName="OTs Externas"
            // Cuando el usuario marca "Usar filtros actuales de la tabla", la
            // descarga envía estos mismos filtros server-side al endpoint y
            // recibe TODAS las filas que cumplen (no solo la página visible).
            endpointParams={filtrosServer}
            // Layout actual de la tabla (orden + columnas ocultas). Sólo aplica
            // a columnas del export cuya `key` coincide con la `key` de la
            // tabla — el resto (datos históricos como evaluación/cotización)
            // queda al final cuando "respetar layout" está activo.
            tablaLayout={{ orden: ordenColumnas ?? undefined, ocultas }}
            dateFilter={{
              label: "Fecha de recepción",
              paramNameDesde: "fecha_recepcion_desde",
              paramNameHasta: "fecha_recepcion_hasta",
            }}
            categoryFilters={[
              {
                key: "tipo_ot",
                label: "Tipo de OT",
                paramName: "tipo_ot",
                options: [
                  { value: "Reparación", label: "Reparación" },
                  { value: "Bien", label: "Bien" },
                  { value: "Servicio", label: "Servicio" },
                ],
              },
            ]}
            columns={[
              // Keys que matchean con las de la tabla → respetan layout cuando el
              // usuario activa el checkbox. Las columnas "histórico" sin match
              // (Evaluación, Cotización, etc.) van al final con su orden original.
              // Prefijo V/S según tipo (Bien/Servicio). Reparación queda como número puro.
              { key: "ot", label: "OT", value: (r) => formatOtCodigo(r.ot, r.tipo_ot?.codigo ?? r.tipo_codigo, "") },
              { key: "cliente", label: "Cliente", value: (r) => r.cliente?.nombre_comercial ?? r.cliente?.razon_social ?? "" },
              { key: "codigo_reparacion", label: "Cod. Rep", value: (r) => r.codigo_reparacion?.codigo ?? "" },
              { key: "codigo_reparacion_desc", label: "Cod. Rep - Descripción", value: (r) => r.codigo_reparacion?.descripcion ?? "" },
              { key: "equipo_codigo", label: "Equipo", value: (r) => r.equipo_codigo ?? "" },
              { key: "cantidad", label: "Cantidad", value: (r) => r.cantidad ?? 1 },
              { key: "fabricante", label: "Fabricante", value: (r) => r.fabricante?.nombre ?? "" },
              { key: "tipo", label: "Tipo (Cod. Rep)", value: (r) => r.tipo ?? "" },
              { key: "tipo_ot", label: "Tipo OT", value: (r) => r.tipo_ot?.nombre ?? r.tipo_codigo ?? "" },
              { key: "np", label: "N/P", value: (r) => r.np ?? "" },
              { key: "ns", label: "NS", value: (r) => r.ns ?? "" },
              { key: "cod_rep_flota", label: "Flota", value: (r) => r.cod_rep_flota ?? "" },
              { key: "cod_rep_posicion", label: "Posición", value: (r) => r.cod_rep_posicion ?? "" },
              { key: "plaqueteo", label: "Plaqueteo", value: (r) => r.plaqueteo ?? "" },
              { key: "descripcion", label: "Descripción", value: (r) => r.descripcion ?? "" },
              { key: "wo_cliente", label: "WO Cliente", value: (r) => r.wo_cliente ?? "" },
              { key: "po_cliente", label: "PO Cliente", value: (r) => r.po_cliente ?? "" },
              { key: "po_item", label: "PO Item", value: (r) => r.po_item ?? "" },
              { key: "id_viajero", label: "ID Viajero", value: (r) => r.id_viajero ?? "" },
              { key: "guia_remision", label: "Guía Remisión", value: (r) => r.guia_remision ?? "" },
              { key: "empresa_entrega", label: "Empresa entrega", value: (r) => r.empresa_entrega ?? "" },
              { key: "fecha_recepcion", label: "Fecha Recepción", value: (r) => formatDateOnly(r.fecha_recepcion) ?? "" },
              { key: "fecha_requerimiento_cliente", label: "F. Req. Cliente", value: (r) => formatDateOnly(r.fecha_requerimiento_cliente) ?? "" },
              { key: "fecha_reprogramada", label: "F. Reprogramada", value: (r) => formatDateOnly(r.fecha_reprogramada) ?? "" },
              { key: "pcr", label: "PCR", value: (r) => r.pcr ?? "" },
              { key: "horas", label: "Horas", value: (r) => r.horas ?? "" },
              { key: "porcentaje_pcr", label: "% PCR", value: (r) => r.porcentaje_pcr ?? "" },
              { key: "contrato_dias", label: "Días contrato", value: (r) => r.contrato_dias ?? "" },
              { key: "prioridad_atencion", label: "Prioridad", value: (r) => r.prioridad_atencion?.nombre ?? "" },
              { key: "atencion_reparacion", label: "Atención Rep.", value: (r) => r.atencion_reparacion?.nombre ?? "" },
              { key: "tipo_reparacion", label: "Tipo Rep.", value: (r) => r.tipo_reparacion?.nombre ?? "" },
              { key: "ot_status", label: "OT Status", value: (r) => r.ot_status?.nombre ?? r.ot_status_codigo ?? "" },
              { key: "recursos_status", label: "Recursos Status", value: (r) => r.recursos_status?.nombre ?? r.recursos_status_codigo ?? "" },
              { key: "taller_status", label: "Taller Status", value: (r) => r.taller_status?.nombre ?? r.taller_status_codigo ?? "" },
              { key: "garantia", label: "Garantía", value: (r) => r.garantia?.nombre ?? "" },
              { key: "tipo_garantia", label: "Tipo Garantía", value: (r) => r.tipo_garantia?.nombre ?? "" },
              { key: "base_metalica", label: "Base metálica", value: (r) => r.base_metalica?.nombre ?? "" },
              { key: "comentarios", label: "Comentarios", value: (r) => r.comentarios ?? "" },
              // Histórico (importado del Excel)
              { label: "Fecha Evaluación", value: (r) => formatDateOnly(r.fecha_evaluacion ?? null) ?? "" },
              { label: "Evaluador", value: (r) => r.evaluador ?? "" },
              { label: "Nro Informe Evaluación", value: (r) => r.nro_informe_evaluacion ?? "" },
              { label: "Fecha Cotización", value: (r) => formatDateOnly(r.fecha_cotizacion ?? null) ?? "" },
              { label: "Nro Cotización", value: (r) => r.nro_cotizacion ?? "" },
              { label: "Monto Cotización", value: (r) => r.monto_cotizacion ?? "" },
              { label: "Fecha Aprobación", value: (r) => formatDateOnly(r.fecha_aprobacion ?? null) ?? "" },
              { label: "Fecha Entrega", value: (r) => formatDateOnly(r.fecha_entrega ?? null) ?? "" },
              { label: "Cumplimiento", value: (r) => r.cumplimiento ?? "" },
              { label: "Días Proceso", value: (r) => r.dias_proceso ?? "" },
              { label: "Días en Taller", value: (r) => r.dias_en_taller ?? "" },
              { label: "Nro Factura", value: (r) => r.nro_factura ?? "" },
              { label: "Fecha Facturación", value: (r) => formatDateOnly(r.fecha_facturacion ?? null) ?? "" },
              { label: "Usuario Crea", value: (r) => r.usuario_crea ?? "" },
              { label: "Fecha Creación", value: (r) => formatDateOnly(r.fecha_creacion) ?? "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/ordenes-trabajo/nueva")}>
            Nueva OT
          </Button>
        </Space>
      </div>

      {/* Filtro rápido por tipo de OT (sincronizado con el filtro de columna
          `tipo_ot`). "Todas" limpia ese filtro. */}
      <Segmented
        style={{ marginBottom: 12 }}
        value={(columnFilters.tipo_ot?.[0] as string) || "todas"}
        onChange={(v) => {
          setColumnFilters((prev) => {
            const next = { ...prev };
            if (v === "todas") {
              delete next.tipo_ot;
            } else {
              next.tipo_ot = [v as string];
            }
            return next;
          });
          setPage(1);
        }}
        options={[
          { value: "todas", label: "Todas" },
          { value: "Reparación", label: "Reparación" },
          { value: "Bien", label: "Bien" },
          { value: "Servicio", label: "Servicio" },
        ]}
      />

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="Buscar OT, equipo, NS..."
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Select
              mode="multiple"
              allowClear
              style={{ width: "100%" }}
              placeholder="Año(s) — por defecto el actual"
              value={aniosSel}
              onChange={(vals) => { setAniosSel(vals); setPage(1); }}
              maxTagCount="responsive"
              options={aniosDisponibles.map((y) => ({ value: y, label: String(2000 + y) }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={clearFilters}>Limpiar filtros</Button>
          </Col>
          <Col xs={24}>
            <RangoFechasFiltro
              label="Fecha de recepción"
              value={rangoRecepcion}
              onChange={setRangoRecepcion}
            />
          </Col>
          {esAdmin && (
            <Col xs={24}>
              <Switch size="small" checked={verInactivas} onChange={(v) => { setVerInactivas(v); setPage(1); }} />
              <span style={{ marginLeft: 8, fontSize: 13, color: brand.textSecondary }}>
                Ver OTs desactivadas (anuladas)
              </span>
            </Col>
          )}
        </Row>
      </Card>

      <TableDragWrapper>
        <Table
          rowKey="id"
          // Pasamos `obligatorias` también aquí — protege contra localStorage
          // de versiones viejas donde estas keys podrían haber sido ocultadas
          // (NRO, OT y Acciones son no-ocultables por diseño).
          columns={visibleColumns(columnsResizable, ocultas, ["__num", "ot", "acciones"])}
          components={tableComponents}
          // Paginación server-side: `data` ya es la página actual del server.
          // Los filtros de columna, el orden y el rango de fecha se mandan al
          // server vía onChange + fetchData (ver arriba).
          dataSource={data}
          loading={loading}
          onChange={(_pag, filters, srt, extra) => {
            // El filtro de TIPO (Segmented) guarda su valor en columnFilters.tipo_ot,
            // pero NO es una columna de la tabla: antd no lo incluye en `filters`.
            // Si pisáramos todo el estado con `filters`, el tipo se resetearía a
            // "Todas" cada vez que se aplica un filtro de columna. Lo preservamos.
            setColumnFilters((prev) => ({
              ...(filters as Record<string, Key[] | null>),
              tipo_ot: prev.tipo_ot ?? null,
            }));
            const s = Array.isArray(srt) ? srt[0] : srt;
            setSorter({
              field: (s?.order ? (s.field ?? s.columnKey) : null) as string | null,
              order: (s?.order ?? null) as "ascend" | "descend" | null,
            });
            // Volver a la página 1 SOLO si cambió un filtro o el orden. Al paginar
            // (extra.action === "paginate") la página la maneja pagination.onChange;
            // si acá reseteábamos a 1 siempre, la paginación quedaba trabada en 1.
            if (extra?.action !== "paginate") setPage(1);
          }}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "órdenes de trabajo",
          })}
          scroll={{ x: 1500 }}
          sticky={{ offsetHeader: 56, offsetScroll: 0 }}
          size="small"
        />
      </TableDragWrapper>

      <OTDetalleModal
        otId={modalOtId}
        open={modalOpen}
        // Al cerrar el modal siempre refrescamos: cubre el caso típico de subir
        // un adjunto (ej. PO Cliente) que cambia el "Estado PO" del listado pero
        // no dispara onUpdated. Es un fetch barato y preserva todos los filtros.
        onClose={() => { setModalOpen(false); fetchData(); }}
        onUpdated={() => fetchData()}
      />
    </div>
  );
}

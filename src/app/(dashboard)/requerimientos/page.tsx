"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Select, DatePicker, Row, Col,
  Modal, Form, message, Tooltip, Popconfirm, Empty, Alert, InputNumber, Segmented,
  Popover, Divider, Flex,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, StopOutlined,
  EditOutlined, FileAddOutlined, InboxOutlined, SendOutlined,
  FileExcelOutlined, ClockCircleOutlined,
  WarningOutlined, InfoCircleOutlined, EyeOutlined, UnorderedListOutlined,
  TruckOutlined, DatabaseOutlined, DollarOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  numeracionColumn,
  paginacionEstandar,
  PAGINATION_PAGE_SIZE,
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  useColumnasRedimensionables,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface RequerimientoRow {
  id: number;
  ot_id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string;
  material_id: number | null;
  material_codigo: string | null;
  descripcion: string | null;
  cantidad: string;
  unidad_medida: string | null;
  precio_unitario: string | null;
  moneda: string | null;
  proveedor_id: number | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  fecha_entrega_esperada: string | null;
  status_requerimiento_codigo: string | null;
  status_cotizacion_codigo: string | null;
  status_oc_codigo: string | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  status_cotizacion: { codigo: string; nombre: string } | null;
  status_oc: { codigo: string; nombre: string } | null;
  proveedor: { id: number; razon_social: string } | null;
  compra: { id: number; numero_po: string } | null;
  po_id: number | null;
  es_adicional: boolean | null;
  orden_trabajo: {
    id: number;
    ot: string | null;
    cliente: { codigo: string; razon_social: string; nombre_comercial: string | null } | null;
    codigo_reparacion: { codigo: string; descripcion: string } | null;
  } | null;
  material: { codigo: string; descripcion: string; unidad_medida_codigo: string | null; stock_actual: string | number | null } | null;
}

interface CatalogOpt { codigo: string; nombre: string; orden?: number | null }
interface ProveedorOpt { id: number; razon_social: string; ruc: string | null }
interface UbicacionOpt { codigo: string; nombre: string }

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };
const REQ_COLOR: Record<string, string> = { SIN_APROBACION: "default", APROBADO: "success", DESAPROBADO: "error", ANULADO: "default" };
const COT_COLOR: Record<string, string> = { PEND_COT: "default", PEND_APROB: "processing", APROBADO: "success", COMPLETO: "success", ANULADO: "error" };
const OC_COLOR: Record<string, string> = { PEND_OC: "default", PROCESO: "processing", ENTREGADO: "success", COMPLETO: "success", INCOMPLETO: "warning", ANULADO: "error", DEVOLUCION: "warning" };

// KPI compacto que muestra el conteo por RQ y por item lado a lado.
function KpiRqItem({
  title, icon, color, rq, items,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  rq: number;
  items: number;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        {icon}<span>{title}</span>
      </div>
      <Row gutter={4} align="middle">
        <Col span={12}>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{rq}</div>
            <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>por RQ</div>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{items}</div>
            <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>por item</div>
          </div>
        </Col>
      </Row>
    </div>
  );
}

function fmtMonto(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Bloque para una moneda específica (USD o SOL): total grande + catálogo + real.
function BloqueMoneda({
  codigo, simbolo, color,
  total, catalogo, real,
}: {
  codigo: string;
  simbolo: string;
  color: string;
  total: number;
  catalogo: number;
  real: number;
}) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8, lineHeight: 1.1 }}>
      <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", fontWeight: 600, letterSpacing: 0.4 }}>
        {codigo}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>
        {simbolo} {fmtMonto(total)}
      </div>
      <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
        Catálogo: <b>{fmtMonto(catalogo)}</b>
      </div>
      <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)" }}>
        Real (PO): <b>{fmtMonto(real)}</b>
      </div>
    </div>
  );
}

// KPI especial: precio global. Sin PO → catálogo, con PO → real.
// Cuenta SOLO USD y SOL por separado (no se mezclan entre sí).
function KpiPrecioGlobal({
  total, catalogo, real,
}: {
  total: Record<string, number>;
  catalogo: Record<string, number>;
  real: Record<string, number>;
}) {
  const usdTotal = total.USD ?? 0;
  const usdCat = catalogo.USD ?? 0;
  const usdReal = real.USD ?? 0;
  const solTotal = total.SOL ?? 0;
  const solCat = catalogo.SOL ?? 0;
  const solReal = real.SOL ?? 0;

  // Detecta monedas inesperadas para no esconder datos.
  const otras = Object.keys(total).filter((k) => k !== "USD" && k !== "SOL" && (total[k] ?? 0) > 0);

  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
        <DollarOutlined style={{ color: brand.navy }} />
        <Tooltip title="Sin PO: precio de catálogo (material). Con PO: precio real de la OC. Cada moneda se cuenta por separado.">
          <span>Precio global</span>
        </Tooltip>
      </div>
      <Row gutter={12} align="top">
        <Col span={12}>
          <BloqueMoneda
            codigo="USD"
            simbolo="$"
            color={brand.navy}
            total={usdTotal}
            catalogo={usdCat}
            real={usdReal}
          />
        </Col>
        <Col span={12}>
          <BloqueMoneda
            codigo="SOL"
            simbolo="S/"
            color="#52c41a"
            total={solTotal}
            catalogo={solCat}
            real={solReal}
          />
        </Col>
      </Row>
      {otras.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 10, color: "rgba(0,0,0,0.55)" }}>
          Otras monedas detectadas:{" "}
          {otras.map((m) => `${m} ${fmtMonto(total[m] ?? 0)}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

export default function RequerimientosPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_PAGE_SIZE);
  const { ocultas, setOcultas } = useColumnasOcultas("requerimientos-list-cols-v1");
  const { rango: rangoSol, setRango: setRangoSol } = useRangoFechas();
  const { rango: rangoReq, setRango: setRangoReq } = useRangoFechas();

  // Filtros
  const [search, setSearch] = useState("");
  const [filterOt, setFilterOt] = useState("");
  const [filterStatusReq, setFilterStatusReq] = useState<string | undefined>();
  const [filterStatusCot, setFilterStatusCot] = useState<string | undefined>();
  const [filterStatusOc, setFilterStatusOc] = useState<string | undefined>();
  const [filterTipo, setFilterTipo] = useState<string | undefined>();
  const [filterProveedor, setFilterProveedor] = useState<number | undefined>();
  const [filterFechas, setFilterFechas] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [soloAprobadosSinOC, setSoloAprobadosSinOC] = useState(false);

  // Selección
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);

  // Rol
  const [rol, setRol] = useState<string | null>(null);
  const isAdmin = rol === "admin";

  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalCtx] = Modal.useModal();

  // Editar modal (admin)
  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<RequerimientoRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm<{
    descripcion: string;
    cantidad: number;
    unidad_medida?: string;
    material_codigo?: string;
    fabricante_codigo?: string;
    fecha_requerida?: dayjs.Dayjs | null;
    observaciones?: string;
  }>();

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const srRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusRequerimiento");
  const scRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusCotizacion");
  const soRes = useCachedFetch<Wrapped<CatalogOpt>>("/api/catalogos?tabla=statusOc");
  const provRes = useCachedFetch<Wrapped<ProveedorOpt>>("/api/proveedores?limit=500");
  const ubicRes = useCachedFetch<Wrapped<UbicacionOpt>>("/api/catalogos?tabla=ubicacion");
  const matsRes = useCachedFetch<Wrapped<{ codigo: string; descripcion: string; fabricante_codigo: string | null; unidad_medida_codigo: string | null }>>("/api/materiales?limit=2000");
  const materiales = matsRes?.data ?? [];
  const fabsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string }>>("/api/catalogos?tabla=fabricante");
  const fabricantes = fabsRes?.data ?? [];

  const statusReqOpts = (srRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const statusCotOpts = (scRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const statusOcOpts = (soRes?.data ?? []).map((s) => ({ value: s.codigo, label: s.nombre }));
  const proveedoresOpts = (provRes?.data ?? []).map((p) => ({ value: p.id, label: `${p.razon_social}${p.ruc ? ` (${p.ruc})` : ""}` }));
  const ubicacionesOpts = (ubicRes?.data ?? []).map((u) => ({ value: u.codigo, label: `${u.codigo} — ${u.nombre}` }));

  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => { if (d?.user) setRol(d.user.rol); }).catch(() => { /* noop */ });
  }, []);

  // ── Stats (agregadas en backend sobre TODO el conjunto filtrado, no sólo la página visible) ──
  interface ReqStats {
    totalItems: number; itemsActivos: number;
    aprob: number; sinAprob: number; conOC: number; anul: number;
    porSolicitar: number; porLlegar: number; enStock: number; sinStock: number;
    cantidadTotal: number; cantidadPromedio: number;
    rqTotal: number; rqActivos: number;
    rqSinAprob: number; rqPorSolicitar: number; rqPorLlegar: number;
    rqEnStock: number; rqSinStock: number;
    precioPorMoneda: Record<string, number>;
    precioRealPorMoneda: Record<string, number>;
    precioCatalogoPorMoneda: Record<string, number>;
  }
  const STATS_VACIAS: ReqStats = {
    totalItems: 0, itemsActivos: 0, aprob: 0, sinAprob: 0, conOC: 0, anul: 0,
    porSolicitar: 0, porLlegar: 0, enStock: 0, sinStock: 0,
    cantidadTotal: 0, cantidadPromedio: 0,
    rqTotal: 0, rqActivos: 0, rqSinAprob: 0, rqPorSolicitar: 0,
    rqPorLlegar: 0, rqEnStock: 0, rqSinStock: 0,
    precioPorMoneda: {}, precioRealPorMoneda: {}, precioCatalogoPorMoneda: {},
  };
  const [stats, setStats] = useState<ReqStats>(STATS_VACIAS);

  // Construye los mismos query-params que `fetchData` (sin paginación) para que
  // los KPIs sigan los filtros activos pero no dependan de page/pageSize.
  const buildStatsParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterOt) params.set("ot", filterOt);
    if (filterStatusReq) params.set("status_req", filterStatusReq);
    if (filterStatusCot) params.set("status_cot", filterStatusCot);
    if (filterStatusOc) params.set("status_oc", filterStatusOc);
    if (filterTipo) params.set("tipo", filterTipo);
    if (filterProveedor) params.set("proveedor_id", String(filterProveedor));
    if (filterFechas?.[0]) params.set("fecha_desde", filterFechas[0].toISOString());
    if (filterFechas?.[1]) params.set("fecha_hasta", filterFechas[1].toISOString());
    if (soloAprobadosSinOC) params.set("solo_aprobados_sin_oc", "1");
    return params;
  }, [search, filterOt, filterStatusReq, filterStatusCot, filterStatusOc, filterTipo, filterProveedor, filterFechas, soloAprobadosSinOC]);

  const fetchStats = useCallback(async () => {
    try {
      const params = buildStatsParams();
      const res = await fetch(`/api/requerimientos/stats?${params}`);
      if (!res.ok) return;
      const j = await res.json();
      if (j?.stats) setStats(j.stats);
    } catch { /* silencioso: las tarjetas mantienen el último valor */ }
  }, [buildStatsParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (search) params.set("search", search);
      if (filterOt) params.set("ot", filterOt);
      if (filterStatusReq) params.set("status_req", filterStatusReq);
      if (filterStatusCot) params.set("status_cot", filterStatusCot);
      if (filterStatusOc) params.set("status_oc", filterStatusOc);
      if (filterTipo) params.set("tipo", filterTipo);
      if (filterProveedor) params.set("proveedor_id", String(filterProveedor));
      if (filterFechas?.[0]) params.set("fecha_desde", filterFechas[0].toISOString());
      if (filterFechas?.[1]) params.set("fecha_hasta", filterFechas[1].toISOString());
      if (soloAprobadosSinOC) params.set("solo_aprobados_sin_oc", "1");

      const res = await fetch(`/api/requerimientos?${params}`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
        setTotal(j.total ?? 0);
      }
      // Stats globales (toda la tabla, no sólo esta página).
      fetchStats();
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterOt, filterStatusReq, filterStatusCot, filterStatusOc, filterTipo, filterProveedor, filterFechas, soloAprobadosSinOC, fetchStats]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearFilters() {
    setSearch(""); setFilterOt(""); setFilterStatusReq(undefined); setFilterStatusCot(undefined);
    setFilterStatusOc(undefined); setFilterTipo(undefined); setFilterProveedor(undefined);
    setFilterFechas(null); setSoloAprobadosSinOC(false); setPage(1);
  }

  // Selección candidata para acciones bulk
  const selectedRows = useMemo(() => rows.filter((r) => selectedKeys.includes(r.id)), [rows, selectedKeys]);
  const elegiblesAprobar = selectedRows.filter((r) => r.status_requerimiento_codigo === "SIN_APROBACION");

  // ── Helpers que iteran un endpoint POST por cada item ──
  async function bulkPost(items: RequerimientoRow[], path: (id: number) => string, label: string) {
    let ok = 0, errs = 0;
    for (const r of items) {
      const res = await fetch(path(r.id), { method: "POST" });
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) messageApi.success(`${label}: ${ok} item(s).`);
    if (errs > 0) messageApi.warning(`${errs} con error.`);
    return { ok, errs };
  }
  async function aprobarItems(items: RequerimientoRow[]) {
    await bulkPost(items, (id) => `/api/requerimientos/${id}/aprobar`, "Aprobados");
    setSelectedKeys([]); fetchData();
  }
  async function enviarItems(items: RequerimientoRow[]) {
    await bulkPost(items, (id) => `/api/requerimientos/${id}/enviar-a-aprobacion`, "Enviados a aprobación");
    setSelectedKeys([]); fetchData();
  }
  async function anularItems(items: RequerimientoRow[]) {
    let ok = 0, errs = 0;
    for (const r of items) {
      const res = await fetch(`/api/requerimientos/${r.id}/anular`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) messageApi.success(`Anulados ${ok} item(s).`);
    if (errs > 0) messageApi.warning(`${errs} con error.`);
    setSelectedKeys([]); fetchData();
  }
  // Wrapper para mantener el botón global compatible con la firma anterior.
  async function aprobarBulk() { await aprobarItems(elegiblesAprobar); }

  // ── Acciones admin por fila ──
  async function aprobar(r: RequerimientoRow) {
    const res = await fetch(`/api/requerimientos/${r.id}/aprobar`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error.");
      return;
    }
    messageApi.success(`${r.nro_req ?? "Item"} aprobado.`);
    fetchData();
  }
  function desaprobar(r: RequerimientoRow) {
    let motivo = "";
    modalApi.confirm({
      title: `Desaprobar ${r.nro_req ?? "requerimiento"}`,
      content: (
        <Input.TextArea rows={3} placeholder="Motivo (opcional)" onChange={(e) => { motivo = e.target.value; }} />
      ),
      okText: "Desaprobar", okButtonProps: { danger: true },
      onOk: async () => {
        const res = await fetch(`/api/requerimientos/${r.id}/desaprobar`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo || null }),
        });
        if (!res.ok) { const err = await res.json().catch(() => null); messageApi.error(err?.error ?? "Error."); return; }
        messageApi.success(`Desaprobado.`); fetchData();
      },
    });
  }
  function anular(r: RequerimientoRow) {
    let motivo = "";
    modalApi.confirm({
      title: `Anular ${r.nro_req ?? "requerimiento"}`,
      content: (
        <Input.TextArea rows={3} placeholder="Motivo (opcional)" onChange={(e) => { motivo = e.target.value; }} />
      ),
      okText: "Anular", okButtonProps: { danger: true },
      onOk: async () => {
        const res = await fetch(`/api/requerimientos/${r.id}/anular`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: motivo || null }),
        });
        if (!res.ok) { const err = await res.json().catch(() => null); messageApi.error(err?.error ?? "Error."); return; }
        messageApi.success(`Anulado.`); fetchData();
      },
    });
  }
  function abrirEditar(r: RequerimientoRow) {
    setEditingRow(r);
    editForm.setFieldsValue({
      descripcion: r.descripcion ?? "",
      cantidad: Number(r.cantidad),
      unidad_medida: r.unidad_medida ?? undefined,
      material_codigo: r.material_codigo ?? undefined,
      fabricante_codigo: undefined, // OTRepuesto no tiene fabricante directo
      fecha_requerida: r.fecha_requerida ? dayjs(r.fecha_requerida) : null,
      observaciones: undefined,
    });
    setEditOpen(true);
  }
  async function onSaveEdit() {
    if (!editingRow) return;
    const values = await editForm.validateFields().catch(() => null);
    if (!values) return;
    setEditSaving(true);
    try {
      const payload = {
        ...values,
        fecha_requerida: values.fecha_requerida ? values.fecha_requerida.format("YYYY-MM-DD") : null,
      };
      const res = await fetch(`/api/requerimientos/${editingRow.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al guardar.");
        return;
      }
      messageApi.success("Actualizado.");
      setEditOpen(false);
      fetchData();
    } finally {
      setEditSaving(false);
    }
  }

  // ── Export Excel ──
  const exportarExcel = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const data = rows.map((r) => ({
        OT: r.orden_trabajo?.ot ?? "",
        "Estado REQ": r.status_requerimiento?.nombre ?? r.status_requerimiento_codigo ?? "",
        "Estado OC": r.status_oc?.nombre ?? r.status_oc_codigo ?? "",
        "Nro REQ": r.nro_req ?? "",
        Item: r.item_req ?? "",
        Tipo: r.tipo_codigo,
        Código: r.material?.codigo ?? r.material_codigo ?? "",
        Material: r.material?.descripcion ?? r.descripcion ?? "",
        Cantidad: Number(r.cantidad),
        UM: r.unidad_medida ?? r.material?.unidad_medida_codigo ?? "",
        Stock: r.material ? Number(r.material.stock_actual ?? 0) : "",
        Cliente: r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "",
        "P. Unit": r.precio_unitario != null ? Number(r.precio_unitario) : "",
        Moneda: r.moneda ?? "",
        Subtotal: r.precio_unitario != null ? Number(r.precio_unitario) * Number(r.cantidad) : "",
        "Nro OC": r.compra?.numero_po ?? "",
        Proveedor: r.proveedor?.razon_social ?? "",
        "F. Solicitud": r.fecha_solicitud ? dayjs(r.fecha_solicitud).format("DD/MM/YYYY") : "",
        "F. Requerida": r.fecha_requerida ? dayjs(r.fecha_requerida).format("DD/MM/YYYY") : "",
        "F. Entrega": r.fecha_entrega_esperada ? dayjs(r.fecha_entrega_esperada).format("DD/MM/YYYY") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Requerimientos");
      XLSX.writeFile(wb, `Requerimientos-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
      messageApi.success("Excel descargado");
    } catch {
      messageApi.error("Error al exportar Excel");
    }
  }, [rows, messageApi]);

  // ── Agrupación por nro_req ──
  // Cada grupo es un "Requerimiento" (header) con N items adentro.
  interface GrupoReq {
    key: string;
    nro_req: string | null;
    ot_id: number;
    orden_trabajo: RequerimientoRow["orden_trabajo"];
    fecha_solicitud: string | null;
    fecha_requerida: string | null;
    fecha_entrega_esperada: string | null;
    total_items: number;
    cantidad_total: number;
    items: RequerimientoRow[];
    // Agregados de status (códigos únicos presentes)
    estados_req: string[];
    estados_cot: string[];
    estados_oc: string[];
    numero_po: string | null; // si todos los items comparten la misma OC
    proveedor_nombre: string | null; // si todos comparten proveedor
  }

  function earliest(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return new Date(a) < new Date(b) ? a : b;
  }
  function latest(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return new Date(a) > new Date(b) ? a : b;
  }

  const grupos = useMemo<GrupoReq[]>(() => {
    const map = new Map<string, RequerimientoRow[]>();
    for (const r of rows) {
      const key = r.nro_req ?? `__sin_req_${r.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      items.sort((a, b) => (a.item_req ?? 0) - (b.item_req ?? 0));
      const first = items[0];
      const setUniq = (vals: (string | undefined | null)[]) =>
        Array.from(new Set(vals.filter((v): v is string => !!v)));
      const cantidad_total = items.reduce((s, i) => s + Number(i.cantidad), 0);
      const numerosPo = setUniq(items.map((i) => i.compra?.numero_po ?? null));
      const proveedores = setUniq(items.map((i) => i.proveedor?.razon_social ?? null));
      let fSol: string | null = null;
      let fReq: string | null = null;
      let fEnt: string | null = null;
      for (const i of items) {
        // Fecha WO/Solicitud: la más LEJADA del grupo (último pedido emitido).
        fSol = latest(fSol, i.fecha_solicitud);
        // Fecha requerida: la más CERCANA del grupo (la más urgente).
        fReq = earliest(fReq, i.fecha_requerida);
        // Fecha entrega esperada: la más cercana (la primera entrega prevista).
        fEnt = earliest(fEnt, i.fecha_entrega_esperada);
      }
      return {
        key,
        nro_req: key.startsWith("__sin_req_") ? null : key,
        ot_id: first.ot_id,
        orden_trabajo: first.orden_trabajo,
        fecha_solicitud: fSol,
        fecha_requerida: fReq,
        fecha_entrega_esperada: fEnt,
        total_items: items.length,
        cantidad_total,
        items,
        estados_req: setUniq(items.map((i) => i.status_requerimiento?.codigo)),
        estados_cot: setUniq(items.map((i) => i.status_cotizacion?.codigo)),
        estados_oc: setUniq(items.map((i) => i.status_oc?.codigo)),
        numero_po: numerosPo.length === 1 ? numerosPo[0] : null,
        proveedor_nombre: proveedores.length === 1 ? proveedores[0] : null,
      };
    });
  }, [rows]);

  // Helper: render un grupo de status como Tag(s). Si todos coinciden, un tag; si hay mezcla, "Mixto".
  function renderStatusResumen(
    codes: string[],
    palette: Record<string, string>,
    label: (c: string) => string,
  ) {
    if (codes.length === 0) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
    if (codes.length === 1) {
      const c = codes[0];
      return <Tag color={palette[c] ?? "default"} style={{ margin: 0, fontSize: 10 }}>{label(c)}</Tag>;
    }
    return (
      <Tooltip title={codes.map(label).join(" / ")}>
        <Tag color="warning" style={{ margin: 0, fontSize: 10 }}>Mixto ({codes.length})</Tag>
      </Tooltip>
    );
  }

  // Diccionarios de label desde catálogo cacheado (fallback al código si no está)
  const reqLabel = (c: string) =>
    (srRes?.data ?? []).find((s) => s.codigo === c)?.nombre ?? c;
  const cotLabel = (c: string) =>
    (scRes?.data ?? []).find((s) => s.codigo === c)?.nombre ?? c;
  const ocLabel = (c: string) =>
    (soRes?.data ?? []).find((s) => s.codigo === c)?.nombre ?? c;

  // Columnas del nivel "grupo" (header de cada nro_req)
  const groupColumns: ColumnsType<GrupoReq> = [
    numeracionColumn<GrupoReq>({ current: page, pageSize }),
    {
      title: "OT", key: "ot", width: 110, fixed: "left",
      render: (_, g) => g.orden_trabajo?.ot ? (
        <a onClick={() => router.push(`/ordenes-trabajo/${g.ot_id}`)} style={{ fontSize: 11 }}>
          <Tag color={brand.navy} style={{ margin: 0 }}>{g.orden_trabajo.ot}</Tag>
        </a>
      ) : <Tag>#{g.ot_id}</Tag>,
    },
    {
      title: "Nro Req", key: "nro", width: 160,
      render: (_, g) => (
        <Flex vertical gap={4} style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 12 }}>{g.nro_req ?? "(sin nro)"}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{g.total_items} item(s)</Text>
        </Flex>
      ),
    },
    {
      title: "Cliente / Cod. Rep.", key: "cliente", width: 200, ellipsis: true,
      render: (_, g) => (
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12 }}>{g.orden_trabajo?.cliente?.nombre_comercial ?? g.orden_trabajo?.cliente?.razon_social ?? "—"}</div>
          {g.orden_trabajo?.codigo_reparacion?.codigo && (
            <Text type="secondary" style={{ fontSize: 10 }}>{g.orden_trabajo.codigo_reparacion.codigo}</Text>
          )}
        </div>
      ),
    },
    {
      title: "Proveedor", key: "prov", width: 140, ellipsis: true,
      render: (_, g) => g.proveedor_nombre ?? <Text type="secondary">—</Text>,
    },
    {
      title: "REQ", key: "req", width: 110, align: "center",
      render: (_, g) => renderStatusResumen(g.estados_req, REQ_COLOR, reqLabel),
    },
    {
      title: "OC", key: "oc", width: 140, align: "center",
      render: (_, g) => (
        <Flex vertical gap={2} align="center" style={{ lineHeight: 1 }}>
          {renderStatusResumen(g.estados_oc, OC_COLOR, ocLabel)}
          {g.numero_po && (
            <a onClick={() => router.push(`/compras`)} style={{ fontSize: 10 }} title="Ver compras">
              <Text code style={{ fontSize: 10 }}>{g.numero_po}</Text>
            </a>
          )}
        </Flex>
      ),
    },
    {
      title: (
        <Tooltip title="Fecha WO más lejada del grupo (último pedido emitido)">
          <span>F. Solicitud</span>
        </Tooltip>
      ),
      key: "fsol", width: 100,
      render: (_, g) => g.fecha_solicitud
        ? <Text style={{ fontSize: 11 }}>{dayjs(g.fecha_solicitud).format("DD/MM/YY")}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: (
        <Tooltip title="Fecha requerida más cercana del grupo (la más urgente)">
          <span>F. Requerida</span>
        </Tooltip>
      ),
      key: "freq", width: 100,
      render: (_, g) => g.fecha_requerida
        ? <Text style={{ fontSize: 11 }}>{dayjs(g.fecha_requerida).format("DD/MM/YY")}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "F. Entrega", key: "fent", width: 100,
      render: (_, g) => g.fecha_entrega_esperada
        ? <Text style={{ fontSize: 11 }}>{dayjs(g.fecha_entrega_esperada).format("DD/MM/YY")}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Acciones", key: "actions_grupo", width: 200, fixed: "right",
      render: (_, g) => {
        const borrador = g.items.filter((i) => i.status_requerimiento_codigo === "BORRADOR");
        const sinAprob = g.items.filter((i) => i.status_requerimiento_codigo === "SIN_APROBACION");
        const anulables = g.items.filter(
          (i) => i.status_requerimiento_codigo !== "ANULADO" &&
                 i.status_requerimiento_codigo !== "DESAPROBADO" &&
                 i.po_id == null,
        );
        const verDetalleHref = g.nro_req
          ? `/requerimientos/detalle?nro_req=${encodeURIComponent(g.nro_req)}`
          : `/requerimientos/detalle?ot_id=${g.ot_id}`;
        return (
          <Space size={2} wrap>
            <Tooltip title="Ver detalle completo del requerimiento (con dividir, asignar proveedor, generar OC)">
              <Button
                size="small"
                type="primary"
                icon={<EyeOutlined />}
                onClick={() => router.push(verDetalleHref)}
              />
            </Tooltip>
            {borrador.length > 0 && (
              <Tooltip title={`Enviar ${borrador.length} item(s) a aprobación`}>
                <Popconfirm
                  title={`Enviar ${borrador.length} item(s) a aprobación?`}
                  onConfirm={() => enviarItems(borrador)}
                  okText="Enviar" cancelText="Cancelar"
                >
                  <Button size="small" icon={<SendOutlined />}>{borrador.length}</Button>
                </Popconfirm>
              </Tooltip>
            )}
            {isAdmin && sinAprob.length > 0 && (
              <Tooltip title={`Aprobar ${sinAprob.length} item(s) del grupo`}>
                <Popconfirm
                  title={`Aprobar ${sinAprob.length} item(s)?`}
                  onConfirm={() => aprobarItems(sinAprob)}
                  okText="Aprobar" cancelText="Cancelar"
                >
                  <Button size="small" type="primary" icon={<CheckOutlined />}>{sinAprob.length}</Button>
                </Popconfirm>
              </Tooltip>
            )}
            {isAdmin && anulables.length > 0 && (
              <Tooltip title={`Anular ${anulables.length} item(s) del grupo`}>
                <Popconfirm
                  title={`Anular ${anulables.length} item(s) del requerimiento ${g.nro_req}?`}
                  onConfirm={() => anularItems(anulables)}
                  okText="Anular" cancelText="Cancelar" okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<StopOutlined />} />
                </Popconfirm>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  // Hacer las columnas redimensionables (drag horizontal en el borde derecho del header).
  const { columnas: groupColumnsResizable, components: tableComponents } =
    useColumnasRedimensionables<GrupoReq>(groupColumns, "requerimientos-list-cols-widths-v1");

  // Columnas del nivel "item" (filas dentro de un grupo expandido)
  // Popover de detalle del item (en hover sobre Material / Descripción).
  const popoverItemContent = (r: RequerimientoRow) => (
    <div style={{ maxWidth: 360, fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: brand.navy, marginBottom: 6 }}>
        {r.material?.descripcion || r.descripcion || "Sin descripción"}
      </div>
      <Row gutter={[8, 4]}>
        <Col span={12}><span style={{ color: "#888" }}>OT:</span> <b>{r.orden_trabajo?.ot ?? "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>REQ/Item:</span> <b>{r.nro_req ?? "-"}/{r.item_req ?? "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Código:</span> <b>{r.material?.codigo ?? r.material_codigo ?? "-"}</b></Col>
        <Col span={12}><span style={{ color: "#888" }}>Tipo:</span> <b>{r.tipo_codigo}</b></Col>
        <Col span={12}>
          <span style={{ color: "#888" }}>Cant:</span>{" "}
          <b>{Number(r.cantidad).toLocaleString()} {r.unidad_medida ?? ""}</b>
        </Col>
        <Col span={12}>
          <span style={{ color: "#888" }}>Stock:</span>{" "}
          <b style={{ color: Number(r.material?.stock_actual ?? 0) > 0 ? "#52c41a" : "#ff4d4f" }}>
            {r.material?.stock_actual != null ? Number(r.material.stock_actual) : "-"}
          </b>
        </Col>
        <Col span={12}>
          <span style={{ color: "#888" }}>P. Unit:</span>{" "}
          <b>{r.precio_unitario != null ? `${Number(r.precio_unitario).toFixed(2)} ${r.moneda ?? ""}` : "-"}</b>
        </Col>
        <Col span={12}>
          <span style={{ color: "#888" }}>Subtotal:</span>{" "}
          <b>
            {r.precio_unitario != null
              ? `${(Number(r.precio_unitario) * Number(r.cantidad)).toFixed(2)} ${r.moneda ?? ""}`
              : "-"}
          </b>
        </Col>
        <Col span={24}>
          <span style={{ color: "#888" }}>Cliente:</span>{" "}
          {r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? "-"}
        </Col>
        <Col span={24}><span style={{ color: "#888" }}>Proveedor:</span> {r.proveedor?.razon_social ?? "-"}</Col>
        <Col span={24}>
          <span style={{ color: "#888" }}>F. Solicitud:</span>{" "}
          {r.fecha_solicitud ? dayjs(r.fecha_solicitud).format("DD/MM/YYYY") : "-"}
        </Col>
        <Col span={24}>
          <span style={{ color: "#888" }}>F. Requerida:</span>{" "}
          {r.fecha_requerida ? dayjs(r.fecha_requerida).format("DD/MM/YYYY") : "-"}
        </Col>
      </Row>
      <Divider style={{ margin: "8px 0" }} />
      <Space size={4} wrap>
        {r.status_requerimiento && (
          <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"}>
            REQ: {r.status_requerimiento.nombre}
          </Tag>
        )}
        {r.status_oc && (
          <Tag color={OC_COLOR[r.status_oc.codigo] ?? "default"}>
            OC: {r.status_oc.nombre}
          </Tag>
        )}
        {r.compra?.numero_po && <Tag color="blue">PO: {r.compra.numero_po}</Tag>}
      </Space>
    </div>
  );

  const itemColumns: ColumnsType<RequerimientoRow> = [
    {
      title: "Item", key: "item", width: 60, align: "center",
      render: (_, r) => (
        <Flex vertical gap={2} align="center" style={{ lineHeight: 1.1 }}>
          <Text strong style={{ fontSize: 11 }}>#{r.item_req}</Text>
          {r.es_adicional && <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>ADIC</Tag>}
        </Flex>
      ),
    },
    {
      title: "Tipo", dataIndex: "tipo_codigo", width: 60, align: "center",
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? "default"} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: "Material / Descripción", key: "desc", ellipsis: true,
      render: (_, r) => (
        <Popover content={popoverItemContent(r)} placement="right" mouseEnterDelay={0.3} trigger="hover">
          <div style={{ lineHeight: 1.2, cursor: "help" }}>
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <InfoCircleOutlined style={{ color: brand.cyan, fontSize: 11 }} />
              {r.material_codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material_codigo}</Tag>}
              {r.descripcion}
            </div>
          </div>
        </Popover>
      ),
    },
    {
      title: "Qty", key: "qty", width: 90, align: "right",
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      title: "Precio", key: "precio", width: 100, align: "right",
      render: (_, r) => r.precio_unitario != null
        ? `${Number(r.precio_unitario).toFixed(2)} ${r.moneda ?? ""}`
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Proveedor", key: "prov", width: 140, ellipsis: true,
      render: (_, r) => r.proveedor?.razon_social ?? <Text type="secondary">—</Text>,
    },
    {
      title: "REQ", key: "req", width: 110, align: "center",
      render: (_, r) => r.status_requerimiento ? (
        <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_requerimiento.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "OC", key: "oc", width: 130, align: "center",
      render: (_, r) => (
        <Flex vertical gap={2} align="center" style={{ lineHeight: 1 }}>
          {r.status_oc ? (
            <Tag color={OC_COLOR[r.status_oc.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
              {r.status_oc.nombre}
            </Tag>
          ) : <Text type="secondary">—</Text>}
          {r.compra?.numero_po && (
            <a onClick={() => router.push(`/compras`)} style={{ fontSize: 10 }} title="Ver compras">
              <Text code style={{ fontSize: 10 }}>{r.compra.numero_po}</Text>
            </a>
          )}
        </Flex>
      ),
    },
    {
      title: "F. Requerida", key: "freq", width: 100,
      render: (_, r) => r.fecha_requerida
        ? <Text style={{ fontSize: 11 }}>{dayjs(r.fecha_requerida).format("DD/MM/YY")}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "F. Entrega", key: "fent", width: 100,
      render: (_, r) => r.fecha_entrega_esperada
        ? <Text style={{ fontSize: 11 }}>{dayjs(r.fecha_entrega_esperada).format("DD/MM/YY")}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "", key: "actions", width: 150, fixed: "right",
      render: (_, r) => {
        const sr = r.status_requerimiento_codigo;
        const tieneOC = r.po_id != null;
        const canEdit = isAdmin && sr !== "ANULADO" && sr !== "DESAPROBADO" && !tieneOC;
        const canApprove = isAdmin && sr === "SIN_APROBACION";
        const canAnular = isAdmin && !tieneOC && sr !== "ANULADO";
        return (
          <Space size={0}>
            {canApprove && (
              <Tooltip title="Aprobar">
                <Popconfirm title={`Aprobar item ${r.item_req}?`} onConfirm={() => aprobar(r)} okText="Aprobar" cancelText="Cancelar">
                  <Button type="text" size="small" icon={<CheckOutlined style={{ color: brand.success }} />} />
                </Popconfirm>
              </Tooltip>
            )}
            {canApprove && (
              <Tooltip title="Desaprobar">
                <Button type="text" size="small" icon={<CloseOutlined style={{ color: brand.error }} />} onClick={() => desaprobar(r)} />
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip title="Editar">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
              </Tooltip>
            )}
            {canAnular && (
              <Tooltip title="Anular">
                <Button type="text" size="small" icon={<StopOutlined />} onClick={() => anular(r)} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {contextHolder}
      {modalCtx}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <InboxOutlined style={{ marginRight: 8 }} />
          Requerimientos
        </Title>
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            onClick={exportarExcel}
            style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
          >
            Descargar Excel
          </Button>
          <ColumnasToggleButton<GrupoReq>
            columns={groupColumns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["__num", "ot", "actions_grupo"]}
          />
        </Space>
      </div>

      {/* KPIs visuales — resumen de requerimientos (por RQ / por item) */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="Total"
              icon={<UnorderedListOutlined style={{ color: brand.navy }} />}
              color={brand.navy}
              rq={stats.rqActivos}
              items={stats.itemsActivos}
            />
            <Text type="secondary" style={{ fontSize: 10, display: "block", marginTop: 4 }}>
              Cant: <b>{stats.cantidadTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
              {" · "}
              Prom: <b>{stats.cantidadPromedio.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
            </Text>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="Pend. aprobación"
              icon={<ClockCircleOutlined style={{ color: "#faad14" }} />}
              color="#faad14"
              rq={stats.rqSinAprob}
              items={stats.sinAprob}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="Pend. generar PO"
              icon={<FileAddOutlined style={{ color: "#1890ff" }} />}
              color="#1890ff"
              rq={stats.rqPorSolicitar}
              items={stats.porSolicitar}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="Por llegar"
              icon={<TruckOutlined style={{ color: "#722ed1" }} />}
              color="#722ed1"
              rq={stats.rqPorLlegar}
              items={stats.porLlegar}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="En stock"
              icon={<DatabaseOutlined style={{ color: "#52c41a" }} />}
              color="#52c41a"
              rq={stats.rqEnStock}
              items={stats.enStock}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiRqItem
              title="Sin stock"
              icon={<WarningOutlined style={{ color: stats.sinStock > 0 ? "#cf1322" : "#bfbfbf" }} />}
              color={stats.sinStock > 0 ? "#cf1322" : "#bfbfbf"}
              rq={stats.rqSinStock}
              items={stats.sinStock}
            />
          </Card>
        </Col>
        <Col xs={24} sm={16} md={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <KpiPrecioGlobal
              total={stats.precioPorMoneda}
              catalogo={stats.precioCatalogoPorMoneda}
              real={stats.precioRealPorMoneda}
            />
          </Card>
        </Col>
      </Row>

      {/* Selector de vista por estado del requerimiento */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Segmented
          block
          value={filterStatusReq ?? "__all"}
          onChange={(v) => {
            setFilterStatusReq(v === "__all" ? undefined : (v as string));
            setPage(1);
          }}
          options={[
            { value: "__all", label: "Todos" },
            { value: "BORRADOR", label: "Borrador" },
            { value: "SIN_APROBACION", label: "Sin aprobación" },
            { value: "APROBADO", label: "Aprobados" },
            { value: "DESAPROBADO", label: "Desaprobados" },
            { value: "ANULADO", label: "Anulados" },
          ]}
        />
      </Card>

      {/* Filtros */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={6}>
            <Input
              placeholder="Buscar (descripción, nro req, OC, material)…"
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Input
              placeholder="OT"
              value={filterOt}
              onChange={(e) => { setFilterOt(e.target.value); setPage(1); }}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Select
              placeholder="Estado REQ"
              value={filterStatusReq}
              onChange={(v) => { setFilterStatusReq(v); setPage(1); }}
              options={statusReqOpts}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select
              placeholder="Estado OC"
              value={filterStatusOc}
              onChange={(v) => { setFilterStatusOc(v); setPage(1); }}
              options={statusOcOpts}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select
              placeholder="Tipo"
              value={filterTipo}
              onChange={(v) => { setFilterTipo(v); setPage(1); }}
              options={[
                { value: "MAC", label: "MAC" },
                { value: "CAD", label: "CAD" },
                { value: "SER", label: "SER" },
              ]}
              allowClear style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              placeholder="Proveedor"
              value={filterProveedor}
              onChange={(v) => { setFilterProveedor(v); setPage(1); }}
              options={proveedoresOpts}
              allowClear showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <DatePicker.RangePicker
              value={filterFechas as [dayjs.Dayjs, dayjs.Dayjs] | null}
              onChange={(v) => { setFilterFechas(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null); setPage(1); }}
              placeholder={["Desde", "Hasta"]}
              format="DD/MM/YYYY"
              style={{ width: "100%" }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Button icon={<ReloadOutlined />} onClick={clearFilters}>Limpiar</Button>
          </Col>
        </Row>
      </Card>

      {/* Bulk toolbar */}
      {selectedKeys.length > 0 && (
        <Card
          size="small"
          styles={{ body: { padding: 10 } }}
          style={{ marginBottom: 12, borderColor: brand.cyan, background: "#E6FFFB" }}
        >
          <Row align="middle" gutter={12}>
            <Col flex="auto">
              <Space>
                <Tag color={brand.cyan} style={{ fontWeight: 600 }}>{selectedKeys.length} seleccionado(s)</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Aprobables: {elegiblesAprobar.length}
                </Text>
              </Space>
            </Col>
            <Col>
              <Space>
                {isAdmin && elegiblesAprobar.length > 0 && (
                  <Popconfirm
                    title={`Aprobar ${elegiblesAprobar.length} requerimiento(s)`}
                    onConfirm={aprobarBulk}
                    okText="Aprobar" cancelText="Cancelar"
                  >
                    <Button type="primary" icon={<CheckOutlined />}>
                      Aprobar ({elegiblesAprobar.length})
                    </Button>
                  </Popconfirm>
                )}
                <Button onClick={() => setSelectedKeys([])}>Cancelar</Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {!isAdmin && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          title="Modo lectura para aprobar"
          description="Solo administradores pueden aprobar/desaprobar/anular requerimientos. Vos podés ver y filtrar."
        />
      )}

      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha solicitud" value={rangoSol} onChange={setRangoSol} />
        </Col>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha requerida" value={rangoReq} onChange={setRangoReq} />
        </Col>
      </Row>

      {rows.length === 0 && !loading ? (
        <Empty description="No hay requerimientos con esos filtros." />
      ) : (
        <Table<GrupoReq>
          rowKey="key"
          columns={visibleColumns(groupColumnsResizable, ocultas)}
          components={tableComponents}
          dataSource={grupos.filter((g) =>
            dentroDeRango(g, "fecha_solicitud", rangoSol) &&
            dentroDeRango(g, "fecha_requerida", rangoReq)
          )}
          loading={loading}
          size="small"
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: `items (${grupos.length} requerimiento(s))`,
            placement: ["topEnd", "bottomEnd"],
          })}
          scroll={{ x: 1500 }}
        />
      )}

      {/* Modal Editar (admin) */}
      <Modal
        title={`Editar ${editingRow?.nro_req ?? ""}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={onSaveEdit}
        confirmLoading={editSaving}
        okText="Guardar" cancelText="Cancelar"
        width={620}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          {editingRow?.tipo_codigo === "MAC" && (
            <Form.Item name="material_codigo" label="Material">
              <Select
                showSearch optionFilterProp="label" allowClear
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, max: 500 }]}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unidad_medida" label="Unidad">
                <Input placeholder="UNIDAD" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select
                  showSearch allowClear optionFilterProp="label"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fecha_requerida" label="Fecha requerida">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

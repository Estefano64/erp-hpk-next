"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Typography,
  Card,
  Table,
  Tag,
  Space,
  Button,
  Empty,
  Input,
  Select,
  Drawer,
  Descriptions,
  Tooltip,
  Progress,
  Tree,
  ColorPicker,
  Tabs,
  App,
} from "antd";
import {
  AppstoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  BgColorsOutlined,
  SettingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType, ColumnGroupType, ColumnType } from "antd/es/table/interface";
import dayjs from "dayjs";
import Link from "next/link";
import { brand } from "@/lib/theme";
import { useResponsive } from "@/lib/responsive";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  STICKY_HEADER,
  filtroPorColumna,
  useColumnasRedimensionables,
  paginacionEstandar,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface ComponenteCat { componente_id: number; codigo: string; nombre: string; color: string | null }

// Paleta rotativa para componentes sin color asignado en BD. Los códigos se
// hashean a un índice de la paleta para que el color sea estable entre cargas.
const PALETA_FALLBACK = [
  "#1677FF", "#52C41A", "#FAAD14", "#cf1322", "#722ED1",
  "#13c2c2", "#fa541c", "#eb2f96", "#2f54eb", "#a0d911",
];
function colorFallback(codigo: string): string {
  let h = 0;
  for (let i = 0; i < codigo.length; i++) h = (h * 31 + codigo.charCodeAt(i)) | 0;
  return PALETA_FALLBACK[Math.abs(h) % PALETA_FALLBACK.length];
}
function colorDeComponente(c: { codigo: string; color: string | null }): string {
  return c.color && c.color.trim() ? c.color : colorFallback(c.codigo);
}
interface OperacionCat {
  codigo: string;
  nombre: string;
  componente_codigo: string | null;
  clasificacion: string;
}
interface EstadoCat { codigo: string; nombre: string; color: string | null }

interface OTRow {
  id: number;
  ot: number | null;
  descripcion: string | null;
  np: string | null;
  equipo_codigo: string | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  modelo: string | null;
  modelo_nombre: string | null;
  prioridad_codigo: string | null;
  prioridad_nombre: string | null;
  prioridad_nivel: number | null;
  fecha_recepcion: string | null;
  fecha_entrega: string | null;
  fecha_requerimiento: string | null;
  ot_status: string | null;
  plan: Record<string, { estado: string | null; externo: boolean | null }>;
  progreso: { total: number; realizadas: number };
}

function prioridadColor(nivel: number | null | undefined): string {
  if (nivel == null) return "default";
  if (nivel <= 1) return "red";
  if (nivel === 2) return "orange";
  if (nivel === 3) return "gold";
  return "blue";
}

// Color por defecto si el catálogo de status_tarea no tiene `color` asignado.
// Convención acordada con el equipo:
//   abierto → amarillo, programado → verde, realizado → azul,
//   correctivo → rojo, cancelado → gris.
const DEFAULT_ESTADO_COLOR: Record<string, string> = {
  abierto: "#FAAD14",
  programado: "#52C41A",
  realizado: "#1677FF",
  correctivo: "#cf1322",
  cancelado: "#8c8c8c",
  "en proceso": "#FA8C16",
  pausado: "#722ED1",
};

// Abreviatura de 2 letras para mostrar dentro de la celda (estilo Excel: OK / PR / X / TS).
function abreviarEstado(codigo: string | null): string {
  if (!codigo) return "—";
  const c = codigo.trim().toUpperCase();
  if (c === "REALIZADO" || c === "OK" || c === "HECHO") return "OK";
  if (c === "EN PROCESO" || c === "PR" || c === "PROCESO") return "PR";
  if (c === "ABIERTO" || c === "FALTA" || c === "X") return "X";
  if (c === "PROGRAMADO" || c === "TS" || c.startsWith("TRABAJO")) return "TS";
  if (c === "PAUSADO") return "PA";
  return c.slice(0, 3);
}

export default function ProgramacionDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [componentes, setComponentes] = useState<ComponenteCat[]>([]);
  const [operaciones, setOperaciones] = useState<OperacionCat[]>([]);
  const [estados, setEstados] = useState<EstadoCat[]>([]);
  const [ots, setOts] = useState<OTRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [filtroComponente, setFiltroComponente] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<OTRow | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("programacion-dashboard-cols-v1");
  // Vista configurable: lista de operacion_codigos ocultos (persistida en localStorage).
  // Si null = ver todas (default). Si array vacío = todas ocultas. Si array poblado = ocultar esas.
  const [opsOcultas, setOpsOcultas] = useState<string[]>([]);
  const [opsOcultasHidratado, setOpsOcultasHidratado] = useState(false);
  // Orden de componentes (lista de códigos) — por USUARIO en localStorage.
  // Si vacío → orden del backend. Si poblado → códigos ahí van primero en ese
  // orden, luego los no listados al final (típicamente extras nuevos).
  const [componentesOrden, setComponentesOrden] = useState<string[]>([]);
  const [componentesOrdenHidratado, setComponentesOrdenHidratado] = useState(false);
  const [vistaConfigOpen, setVistaConfigOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("programacion-dashboard-ops-ocultas-v1");
      if (raw) setOpsOcultas(JSON.parse(raw));
      const ordenRaw = localStorage.getItem("programacion-dashboard-componentes-orden-v1");
      if (ordenRaw) setComponentesOrden(JSON.parse(ordenRaw));
    } catch { /* ignore */ }
    setOpsOcultasHidratado(true);
    setComponentesOrdenHidratado(true);
  }, []);
  useEffect(() => {
    if (!opsOcultasHidratado) return;
    try { localStorage.setItem("programacion-dashboard-ops-ocultas-v1", JSON.stringify(opsOcultas)); } catch { /* ignore */ }
  }, [opsOcultas, opsOcultasHidratado]);
  useEffect(() => {
    if (!componentesOrdenHidratado) return;
    try { localStorage.setItem("programacion-dashboard-componentes-orden-v1", JSON.stringify(componentesOrden)); } catch { /* ignore */ }
  }, [componentesOrden, componentesOrdenHidratado]);

  // Componentes ordenados según preferencia del usuario.
  const componentesOrdenados = useMemo<ComponenteCat[]>(() => {
    if (componentesOrden.length === 0) return componentes;
    const byCod = new Map(componentes.map((c) => [c.codigo, c]));
    const out: ComponenteCat[] = [];
    for (const cod of componentesOrden) {
      const c = byCod.get(cod);
      if (c) { out.push(c); byCod.delete(cod); }
    }
    // Componentes no listados (extras nuevos) al final.
    for (const c of byCod.values()) out.push(c);
    return out;
  }, [componentes, componentesOrden]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operaciones/programacion-dashboard");
      if (res.ok) {
        const j = await res.json();
        setComponentes(j.componentes ?? []);
        setOperaciones(j.operaciones ?? []);
        setEstados(j.estados ?? []);
        setOts(j.ots ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const estadoMap = useMemo(() => {
    const m = new Map<string, EstadoCat>();
    for (const e of estados) m.set(e.codigo, e);
    return m;
  }, [estados]);

  // Mapeo de presets antd (lo que guarda el catálogo status_tarea) a hex real,
  // porque para `backgroundColor` necesitamos un color CSS válido (no "success").
  const ANTD_PRESET_TO_HEX: Record<string, string> = {
    success: "#52C41A",
    warning: "#FAAD14",
    error: "#cf1322",
    processing: "#1677FF",
    blue: "#1677FF",
    default: "#8c8c8c",
    volcano: "#fa541c",
    purple: "#722ED1",
    magenta: "#eb2f96",
    red: "#cf1322",
    green: "#52C41A",
    cyan: "#13c2c2",
    geekblue: "#2f54eb",
    gold: "#faad14",
    orange: "#fa8c16",
    lime: "#a0d911",
  };
  const colorDeEstado = useCallback((codigo: string | null): string => {
    if (!codigo) return "transparent";
    const e = estadoMap.get(codigo);
    if (e?.color) {
      // Si el color guardado es un preset de antd, lo convertimos a hex.
      // Si ya es hex / rgb / etc., lo devolvemos tal cual.
      return ANTD_PRESET_TO_HEX[e.color.toLowerCase()] ?? e.color;
    }
    return DEFAULT_ESTADO_COLOR[codigo.toLowerCase()] ?? "#d9d9d9";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoMap]);

  // Filas filtradas por búsqueda libre
  const otsFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ots;
    return ots.filter((o) =>
      String(o.ot ?? "").toLowerCase().includes(q) ||
      (o.descripcion ?? "").toLowerCase().includes(q) ||
      (o.cliente_nombre ?? "").toLowerCase().includes(q) ||
      (o.equipo_codigo ?? "").toLowerCase().includes(q) ||
      (o.modelo ?? "").toLowerCase().includes(q),
    );
  }, [ots, search]);

  // Agrupar operaciones por componente para construir las columnas anidadas
  const opsOcultasSet = useMemo(() => new Set(opsOcultas), [opsOcultas]);
  const operacionesPorComponente = useMemo(() => {
    const m = new Map<string, OperacionCat[]>();
    for (const op of operaciones) {
      if (filtroComponente && op.componente_codigo !== filtroComponente) continue;
      if (opsOcultasSet.has(op.codigo)) continue; // filtro de vista configurable
      const k = op.componente_codigo ?? "__SIN_COMP__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(op);
    }
    return m;
  }, [operaciones, filtroComponente, opsOcultasSet]);

  // Renderer de celda de operación: muestra abreviatura sobre fondo del color del estado.
  const renderCelda = (estado: string | null, externo: boolean | null) => {
    if (!estado) return <div style={{ width: "100%", textAlign: "center", color: "#bbb" }}>—</div>;
    const color = colorDeEstado(estado);
    const abr = abreviarEstado(estado);
    return (
      <Tooltip title={`${estados.find((e) => e.codigo === estado)?.nombre ?? estado}${externo ? " · Tercero 🤝" : ""}`}>
        <div
          style={{
            background: color,
            color: brand.white,
            fontWeight: 600,
            fontSize: 10,
            textAlign: "center",
            borderRadius: 2,
            padding: "1px 4px",
            minHeight: 18,
            lineHeight: "16px",
            position: "relative",
            backgroundImage: externo
              ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 4px, transparent 4px 8px)"
              : undefined,
            boxShadow: externo ? "inset 0 0 0 1px #FAAD14" : undefined,
          }}
        >
          {abr}
        </div>
      </Tooltip>
    );
  };

  // Columnas info de OT (fijas a la izquierda)
  const infoColumns: ColumnsType<OTRow> = [
    {
      key: "ot",
      title: "HP&K",
      dataIndex: "ot",
      width: 110,
      align: "left",
      sorter: (a, b) => Number(a.ot ?? 0) - Number(b.ot ?? 0),
      ...filtroPorColumna(otsFiltradas, "ot"),
      render: (v: number | null, r) => (
        <Link href={`/ordenes-trabajo/${r.id}`} style={{ fontSize: 11, fontWeight: 600, color: brand.navy }}>
          {v ?? `#${r.id}`}
        </Link>
      ),
    },
    {
      key: "cliente_nombre",
      title: "Mina/Cliente",
      dataIndex: "cliente_nombre",
      width: 130,
      align: "left",
      sorter: (a, b) => (a.cliente_nombre ?? "").localeCompare(b.cliente_nombre ?? ""),
      ...filtroPorColumna(otsFiltradas, "cliente_nombre"),
      render: (_, r) => <span style={{ fontSize: 11 }}>{r.cliente_codigo ?? r.cliente_nombre ?? "—"}</span>,
    },
    {
      key: "descripcion",
      title: "Descripción",
      dataIndex: "descripcion",
      width: 220,
      ellipsis: true,
      align: "left",
      sorter: (a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? ""),
      ...filtroPorColumna(otsFiltradas, "descripcion"),
      render: (v: string | null) => <span style={{ fontSize: 11 }}>{v ?? "—"}</span>,
    },
    {
      key: "modelo",
      title: "Flota",
      dataIndex: "modelo",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.modelo ?? "").localeCompare(b.modelo ?? ""),
      ...filtroPorColumna(otsFiltradas, "modelo"),
      render: (_, r) => (
        <Tooltip title={r.modelo_nombre ?? undefined}>
          <span style={{ fontSize: 11 }}>{r.modelo ?? "—"}</span>
        </Tooltip>
      ),
    },
    {
      key: "np",
      title: "N/P",
      dataIndex: "np",
      width: 130,
      align: "left",
      ellipsis: true,
      sorter: (a, b) => (a.np ?? "").localeCompare(b.np ?? ""),
      ...filtroPorColumna(otsFiltradas, "np"),
      render: (v: string | null) => <span style={{ fontSize: 11 }}>{v ?? "—"}</span>,
    },
    {
      key: "prioridad",
      title: "Prioridad",
      dataIndex: "prioridad_codigo",
      width: 100,
      align: "center",
      sorter: (a, b) => (a.prioridad_nivel ?? 99) - (b.prioridad_nivel ?? 99),
      ...filtroPorColumna(otsFiltradas, "prioridad_codigo"),
      render: (_, r) => r.prioridad_codigo
        ? <Tag color={prioridadColor(r.prioridad_nivel)} style={{ fontSize: 10, margin: 0 }}>{r.prioridad_codigo}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "fecha_recepcion",
      title: "F. Ingreso OT",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.fecha_recepcion ?? "").localeCompare(b.fecha_recepcion ?? ""),
      render: (_, r) => r.fecha_recepcion ? <span style={{ fontSize: 11 }}>{dayjs(r.fecha_recepcion).format("DD/MM/YY")}</span> : <Text type="secondary">—</Text>,
    },
    {
      key: "fecha_entrega",
      title: "Fecha entrega est.",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.fecha_entrega ?? "").localeCompare(b.fecha_entrega ?? ""),
      render: (_, r) => r.fecha_entrega ? <span style={{ fontSize: 11 }}>{dayjs(r.fecha_entrega).format("DD/MM/YY")}</span> : <Text type="secondary">—</Text>,
    },
    {
      key: "ot_status",
      title: "Status OT",
      dataIndex: "ot_status",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.ot_status ?? "").localeCompare(b.ot_status ?? ""),
      ...filtroPorColumna(otsFiltradas, "ot_status"),
      render: (_, r) => r.ot_status ? <Tag style={{ fontSize: 10, margin: 0 }}>{r.ot_status}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      key: "progreso",
      title: "Progreso tareas",
      width: 140,
      align: "center",
      sorter: (a, b) => {
        const pa = a.progreso.total > 0 ? a.progreso.realizadas / a.progreso.total : 0;
        const pb = b.progreso.total > 0 ? b.progreso.realizadas / b.progreso.total : 0;
        return pa - pb;
      },
      render: (_, r) => {
        const { total, realizadas } = r.progreso;
        if (total === 0) return <Text type="secondary" style={{ fontSize: 11 }}>Sin tareas</Text>;
        const pct = Math.round((realizadas / total) * 100);
        return (
          <Tooltip title={`${realizadas}/${total} tareas realizadas (${pct}%)`}>
            <div style={{ lineHeight: 1.1 }}>
              <Progress percent={pct} size="small" status={pct === 100 ? "success" : "active"} showInfo={false} />
              <div style={{ fontSize: 10, color: "#666" }}>{realizadas}/{total} ({pct}%)</div>
            </div>
          </Tooltip>
        );
      },
    },
  ];

  // Columnas dinámicas: 3 niveles → Componente → STD/NO_STD → Operación.
  // Cada celda muestra el estado de la operación en esa OT.
  const operacionColumns: ColumnsType<OTRow> = useMemo(() => {
    const cols: ColumnsType<OTRow> = [];
    for (const comp of componentesOrdenados) {
      const ops = operacionesPorComponente.get(comp.codigo) ?? [];
      if (ops.length === 0) continue;
      const compColor = colorDeComponente(comp);

      // Separar por clasificación
      const opsSTD = ops.filter((o) => (o.clasificacion ?? "STD").toUpperCase() === "STD");
      const opsNSTD = ops.filter((o) => (o.clasificacion ?? "").toUpperCase() === "NO_STD");

      const buildOpCol = (op: OperacionCat): ColumnType<OTRow> => ({
        key: `op-${comp.codigo}-${op.codigo}`,
        title: (
          <Tooltip title={`${op.nombre}${op.clasificacion ? ` (${op.clasificacion})` : ""}`}>
            <div style={{ fontSize: 10, lineHeight: 1.1, writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "3px 0", whiteSpace: "nowrap" }}>
              {op.nombre}
            </div>
          </Tooltip>
        ),
        width: 38,
        align: "center" as const,
        render: (_: unknown, r: OTRow) => {
          // El backend normaliza las claves de planMap (trim + uppercase) para
          // que coincidan aunque la planificación tenga casing distinto.
          const key = `${comp.codigo.trim().toUpperCase()}__${op.codigo.trim().toUpperCase()}`;
          const cell = r.plan[key];
          return renderCelda(cell?.estado ?? null, cell?.externo ?? null);
        },
      });

      // Subgrupos por clasificación
      const subgrupos: ColumnsType<OTRow> = [];
      if (opsSTD.length > 0) {
        subgrupos.push({
          key: `comp-${comp.codigo}-std`,
          title: (
            <div style={{ fontSize: 10, fontWeight: 600, color: "#389E0D", letterSpacing: 0.3 }}>
              Estándar
            </div>
          ),
          children: opsSTD.map(buildOpCol),
        } as ColumnGroupType<OTRow>);
      }
      if (opsNSTD.length > 0) {
        subgrupos.push({
          key: `comp-${comp.codigo}-nstd`,
          title: (
            <div style={{ fontSize: 10, fontWeight: 600, color: "#D46B08", letterSpacing: 0.3 }}>
              No estándar
            </div>
          ),
          children: opsNSTD.map(buildOpCol),
        } as ColumnGroupType<OTRow>);
      }

      const groupCol: ColumnGroupType<OTRow> = {
        key: `comp-${comp.codigo}`,
        title: (
          <div style={{
            fontWeight: 700,
            color: brand.white,
            fontSize: 11,
            letterSpacing: 0.5,
            background: compColor,
            padding: "4px 8px",
            borderRadius: 4,
            display: "inline-block",
          }}>
            {comp.nombre}
          </div>
        ),
        children: subgrupos.length > 0 ? subgrupos : [],
      };
      cols.push(groupCol);
    }
    return cols;
  }, [componentesOrdenados, operacionesPorComponente, estados, colorDeEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<OTRow> = [...infoColumns, ...operacionColumns];

  return (
    <div>
      {/* Encabezado compacto: título + filtros + acciones en una sola fila para
          no comerle espacio vertical a la matriz. */}
      <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 10 } }}>
        <Space wrap>
          <Title level={5} style={{ margin: 0, color: brand.navy, marginRight: 4 }}>
            <AppstoreOutlined style={{ marginRight: 6 }} />
            Dashboard de Planificación
          </Title>
          <Tooltip title="Matriz de OTs activas × operaciones del catálogo. Cada celda muestra el estado actual de esa operación en la OT.">
            <InfoCircleOutlined style={{ color: brand.textSecondary, marginRight: 4 }} />
          </Tooltip>
          <Input
            placeholder="Buscar OT, descripción, cliente, equipo…"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 300 }}
          />
          <Select
            placeholder="Filtrar componente"
            allowClear showSearch optionFilterProp="label"
            value={filtroComponente ?? undefined}
            onChange={(v) => setFiltroComponente(v ?? null)}
            options={componentes.map((c) => ({ value: c.codigo, label: c.nombre }))}
            style={{ minWidth: 200 }}
            suffixIcon={<FilterOutlined />}
          />
          <ColumnasToggleButton<OTRow>
            columns={infoColumns}
            ocultas={ocultas}
            setOcultas={setOcultas}
            obligatorias={["ot"]}
          />
          <Button
            icon={<SettingOutlined />}
            onClick={() => setVistaConfigOpen(true)}
          >
            Configurar vista{opsOcultas.length > 0 ? ` (${opsOcultas.length} ocultas)` : ""}
          </Button>
          <Tooltip
            title={
              <div style={{ fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Leyenda de estados</div>
                {estados.map((e) => (
                  <div key={e.codigo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ display: "inline-block", width: 16, height: 12, borderRadius: 2, background: colorDeEstado(e.codigo) }} />
                    <span><b>{abreviarEstado(e.codigo)}</b> — {e.nombre}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      display: "inline-block", width: 16, height: 12, borderRadius: 2, background: "#8c8c8c",
                      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 6px)",
                      boxShadow: "inset 0 0 0 1px #FAAD14",
                    }} />
                    <span>🤝 Trabajo a tercero</span>
                  </div>
                </div>
              </div>
            }
            placement="bottomLeft"
          >
            <Button icon={<BgColorsOutlined />}>Leyenda</Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refrescar
          </Button>
        </Space>
      </Card>

      {otsFiltradas.length === 0 && !loading ? (
        <Empty description="No hay OTs activas." />
      ) : (
        <TablaProgramacion
          columns={visibleColumns(columns, ocultas)}
          data={otsFiltradas}
          loading={loading}
          onRowClick={(r) => setDetalle(r)}
          page={page}
          pageSize={pageSize}
          onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
        />
      )}

      <Drawer
        title={detalle ? `Detalle OT ${detalle.ot ?? `#${detalle.id}`}` : ""}
        open={!!detalle}
        onClose={() => setDetalle(null)}
        size={560}
      >
        {detalle && (
          <div>
            <Descriptions size="small" column={1} bordered styles={{ label: { fontWeight: 600, width: 140 } }}>
              <Descriptions.Item label="HP&K">{detalle.ot ?? `#${detalle.id}`}</Descriptions.Item>
              <Descriptions.Item label="Cliente">{detalle.cliente_nombre ?? detalle.cliente_codigo ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Descripción">{detalle.descripcion ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Modelo">{detalle.modelo_nombre ?? detalle.modelo ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Equipo">{detalle.equipo_codigo ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Estado OT">{detalle.ot_status ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Fecha entrega">
                {detalle.fecha_entrega ? dayjs(detalle.fecha_entrega).format("DD/MM/YYYY") : "—"}
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Link href={`/ordenes-trabajo/${detalle.id}`}>
                <Button type="primary">Ver detalle completo de la OT</Button>
              </Link>
            </div>
          </div>
        )}
      </Drawer>

      {/* Drawer: configuración de vista — elegir qué componentes / clasificaciones / operaciones mostrar */}
      <ConfigurarVistaDrawer
        open={vistaConfigOpen}
        onClose={() => setVistaConfigOpen(false)}
        componentes={componentes}
        componentesOrden={componentesOrden}
        setComponentesOrden={setComponentesOrden}
        operaciones={operaciones}
        opsOcultas={opsOcultas}
        setOpsOcultas={setOpsOcultas}
        onColorChanged={fetchData}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Drawer de configuración con 3 tabs:
//   - Vista (qué operaciones se ven, persistencia local por usuario)
//   - Orden (orden de componentes en la matriz, local por usuario)
//   - Colores (color por componente, PERSISTE EN BD — compartido)
// ───────────────────────────────────────────────────────────────────────────
function ConfigurarVistaDrawer({
  open, onClose, componentes, componentesOrden, setComponentesOrden,
  operaciones, opsOcultas, setOpsOcultas, onColorChanged,
}: {
  open: boolean;
  onClose: () => void;
  componentes: ComponenteCat[];
  componentesOrden: string[];
  setComponentesOrden: (next: string[]) => void;
  operaciones: OperacionCat[];
  opsOcultas: string[];
  setOpsOcultas: (next: string[]) => void;
  onColorChanged: () => void;
}) {
  const { screens } = useResponsive();
  const { message } = App.useApp();
  // Build tree
  const treeData = useMemo(() => {
    return componentes
      .map((c) => {
        const opsDeComp = operaciones.filter((o) => o.componente_codigo === c.codigo);
        if (opsDeComp.length === 0) return null;
        const opsSTD = opsDeComp.filter((o) => (o.clasificacion ?? "STD").toUpperCase() === "STD");
        const opsNSTD = opsDeComp.filter((o) => (o.clasificacion ?? "").toUpperCase() === "NO_STD");
        const children: { title: string; key: string; children?: { title: string; key: string }[] }[] = [];
        if (opsSTD.length > 0) {
          children.push({
            title: `Estándar (${opsSTD.length})`,
            key: `cls-${c.codigo}-STD`,
            children: opsSTD.map((o) => ({ title: o.nombre, key: `op-${o.codigo}` })),
          });
        }
        if (opsNSTD.length > 0) {
          children.push({
            title: `No estándar (${opsNSTD.length})`,
            key: `cls-${c.codigo}-NO_STD`,
            children: opsNSTD.map((o) => ({ title: o.nombre, key: `op-${o.codigo}` })),
          });
        }
        return { title: c.nombre, key: `comp-${c.codigo}`, children };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);
  }, [componentes, operaciones]);

  // Keys visibles = todos los leaves NO en opsOcultas
  const allOpKeys = useMemo(() => operaciones.map((o) => `op-${o.codigo}`), [operaciones]);
  const checkedKeys = useMemo(() => {
    const ocultas = new Set(opsOcultas.map((c) => `op-${c}`));
    return allOpKeys.filter((k) => !ocultas.has(k));
  }, [allOpKeys, opsOcultas]);

  function onCheck(checked: React.Key[] | { checked: React.Key[]; halfChecked: React.Key[] }) {
    const keys = Array.isArray(checked) ? checked : checked.checked;
    const visibleOps = new Set(
      keys.filter((k) => String(k).startsWith("op-")).map((k) => String(k).substring(3)),
    );
    const nuevasOcultas = operaciones.map((o) => o.codigo).filter((cod) => !visibleOps.has(cod));
    setOpsOcultas(nuevasOcultas);
  }

  function mostrarTodas() { setOpsOcultas([]); }
  function ocultarTodas() { setOpsOcultas(operaciones.map((o) => o.codigo)); }

  // ── ORDEN ──
  // Lista de componentes en orden actual (override del usuario o catálogo).
  const componentesOrdenados = useMemo<ComponenteCat[]>(() => {
    if (componentesOrden.length === 0) return componentes;
    const byCod = new Map(componentes.map((c) => [c.codigo, c]));
    const out: ComponenteCat[] = [];
    for (const cod of componentesOrden) {
      const c = byCod.get(cod);
      if (c) { out.push(c); byCod.delete(cod); }
    }
    for (const c of byCod.values()) out.push(c);
    return out;
  }, [componentes, componentesOrden]);

  function moverComponente(codigo: string, delta: -1 | 1) {
    const codigos = componentesOrdenados.map((c) => c.codigo);
    const idx = codigos.indexOf(codigo);
    const nuevoIdx = idx + delta;
    if (idx < 0 || nuevoIdx < 0 || nuevoIdx >= codigos.length) return;
    [codigos[idx], codigos[nuevoIdx]] = [codigos[nuevoIdx], codigos[idx]];
    setComponentesOrden(codigos);
  }

  // ── COLORES ──
  // Se guarda en BD. Solo los componentes con componente_id > 0 (no los extras)
  // pueden actualizarse — los extras solo tienen color local (fallback paleta).
  async function actualizarColor(comp: ComponenteCat, color: string | null) {
    if (comp.componente_id <= 0) {
      message.warning("Este componente no está en el catálogo, no se puede guardar el color en BD.");
      return;
    }
    try {
      const res = await fetch(`/api/catalogos/componente?id=${comp.componente_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: comp.codigo,
          nombre: comp.nombre,
          color: color ?? "",
          activo: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error guardando color");
      }
      message.success("Color guardado");
      onColorChanged();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error guardando color");
    }
  }

  return (
    <Drawer
      title="Configurar vista del dashboard"
      open={open}
      onClose={onClose}
      width={screens.md ? 520 : "100%"}
      placement="right"
    >
      <Tabs
        defaultActiveKey="vista"
        items={[
          {
            key: "vista",
            label: "Vista",
            children: (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 6 }}>
                  <Button size="small" onClick={mostrarTodas}>Mostrar todas</Button>
                  <Button size="small" onClick={ocultarTodas} danger>Ocultar todas</Button>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  Elegí qué operaciones querés ver. Tu selección queda guardada por navegador.
                </Text>
                <Tree
                  checkable
                  treeData={treeData}
                  checkedKeys={checkedKeys}
                  onCheck={onCheck}
                  defaultExpandAll
                  selectable={false}
                />
              </div>
            ),
          },
          {
            key: "orden",
            label: "Orden",
            children: (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  Reordená los componentes con las flechas. El orden es solo para vos (se guarda por navegador).
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {componentesOrdenados.map((c, i) => (
                    <div
                      key={c.codigo}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        border: `1px solid ${brand.border}`,
                        borderRadius: 4,
                        background: brand.white,
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: colorDeComponente(c) }} />
                      <Text strong style={{ flex: 1, fontSize: 13 }}>{c.nombre}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{c.codigo}</Text>
                      <Button
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={i === 0}
                        onClick={() => moverComponente(c.codigo, -1)}
                      />
                      <Button
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={i === componentesOrdenados.length - 1}
                        onClick={() => moverComponente(c.codigo, 1)}
                      />
                    </div>
                  ))}
                </div>
                <Button size="small" style={{ marginTop: 12 }} onClick={() => setComponentesOrden([])}>
                  Restablecer al orden por defecto
                </Button>
              </div>
            ),
          },
          {
            key: "colores",
            label: "Colores",
            children: (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  El color es compartido por todos los usuarios. Se aplica al header del componente en la matriz.
                </Text>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {componentesOrdenados.map((c) => (
                    <div
                      key={c.codigo}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        border: `1px solid ${brand.border}`,
                        borderRadius: 4,
                        background: brand.white,
                      }}
                    >
                      <ColorPicker
                        value={colorDeComponente(c)}
                        onChangeComplete={(col) => actualizarColor(c, col.toHexString())}
                        disabled={c.componente_id <= 0}
                      />
                      <Text strong style={{ flex: 1, fontSize: 13 }}>{c.nombre}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{c.codigo}</Text>
                      {c.componente_id <= 0 && (
                        <Tag color="default" style={{ fontSize: 10 }}>extra</Tag>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function TablaProgramacion({
  columns, data, loading, onRowClick, page, pageSize, onPageChange,
}: {
  columns: ColumnsType<OTRow>; data: OTRow[]; loading: boolean;
  onRowClick: (r: OTRow) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number, s: number) => void;
}) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<OTRow>(
    columns, "programacion-dashboard-v1",
  );
  return (
    <TableDragWrapper>
      <Table<OTRow>
        rowKey="id"
        size="small"
        columns={columnas}
        components={components}
        dataSource={data}
        loading={loading}
        bordered
        sticky={STICKY_HEADER}
        scroll={{ x: "max-content", y: "calc(100vh - 210px)" }}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: onPageChange,
          label: "OTs",
        })}
        onRow={(r) => ({ onClick: () => onRowClick(r), style: { cursor: "pointer" } })}
      />
    </TableDragWrapper>
  );
}

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
} from "antd";
import {
  AppstoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  BgColorsOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { ColumnsType, ColumnGroupType, ColumnType } from "antd/es/table/interface";
import dayjs from "dayjs";
import Link from "next/link";
import { brand } from "@/lib/theme";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  STICKY_HEADER,
  filtroPorColumna,
} from "@/lib/tables";

const { Title, Text } = Typography;

interface ComponenteCat { componente_id: number; codigo: string; nombre: string }
interface OperacionCat {
  codigo: string;
  nombre: string;
  componente_codigo: string | null;
  clasificacion: string;
}
interface EstadoCat { codigo: string; nombre: string; color: string | null }

interface OTRow {
  id: number;
  ot: string | null;
  descripcion: string | null;
  np: string | null;
  equipo_codigo: string | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  modelo: string | null;
  modelo_nombre: string | null;
  fecha_recepcion: string | null;
  fecha_entrega: string | null;
  fecha_requerimiento: string | null;
  ot_status: string | null;
  plan: Record<string, { estado: string | null; externo: boolean | null }>;
  progreso: { total: number; realizadas: number };
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
  const [search, setSearch] = useState("");
  const [filtroComponente, setFiltroComponente] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<OTRow | null>(null);
  const { ocultas, setOcultas } = useColumnasOcultas("programacion-dashboard-cols-v1");
  // Vista configurable: lista de operacion_codigos ocultos (persistida en localStorage).
  // Si null = ver todas (default). Si array vacío = todas ocultas. Si array poblado = ocultar esas.
  const [opsOcultas, setOpsOcultas] = useState<string[]>([]);
  const [opsOcultasHidratado, setOpsOcultasHidratado] = useState(false);
  const [vistaConfigOpen, setVistaConfigOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("programacion-dashboard-ops-ocultas-v1");
      if (raw) setOpsOcultas(JSON.parse(raw));
    } catch { /* ignore */ }
    setOpsOcultasHidratado(true);
  }, []);
  useEffect(() => {
    if (!opsOcultasHidratado) return;
    try { localStorage.setItem("programacion-dashboard-ops-ocultas-v1", JSON.stringify(opsOcultas)); } catch { /* ignore */ }
  }, [opsOcultas, opsOcultasHidratado]);

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
      (o.ot ?? "").toLowerCase().includes(q) ||
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
            color: "#fff",
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
      fixed: "left",
      align: "left",
      sorter: (a, b) => (a.ot ?? "").localeCompare(b.ot ?? ""),
      ...filtroPorColumna(otsFiltradas, "ot"),
      render: (v: string | null, r) => (
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
      title: "Modelo",
      dataIndex: "modelo",
      width: 90,
      align: "center",
      sorter: (a, b) => (a.modelo ?? "").localeCompare(b.modelo ?? ""),
      ...filtroPorColumna(otsFiltradas, "modelo"),
      render: (_, r) => <span style={{ fontSize: 11 }}>{r.modelo ?? "—"}</span>,
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
    for (const comp of componentes) {
      const ops = operacionesPorComponente.get(comp.codigo) ?? [];
      if (ops.length === 0) continue;

      // Separar por clasificación
      const opsSTD = ops.filter((o) => (o.clasificacion ?? "STD").toUpperCase() === "STD");
      const opsNSTD = ops.filter((o) => (o.clasificacion ?? "").toUpperCase() === "NO_STD");

      const buildOpCol = (op: OperacionCat): ColumnType<OTRow> => ({
        key: `op-${comp.codigo}-${op.codigo}`,
        title: (
          <Tooltip title={`${op.nombre}${op.clasificacion ? ` (${op.clasificacion})` : ""}`}>
            <div style={{ fontSize: 10, lineHeight: 1.1, writingMode: "vertical-rl", transform: "rotate(180deg)", padding: "6px 0", whiteSpace: "nowrap" }}>
              {op.nombre}
            </div>
          </Tooltip>
        ),
        width: 38,
        align: "center" as const,
        render: (_: unknown, r: OTRow) => {
          const key = `${comp.codigo}__${op.codigo}`;
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
          <div style={{ fontWeight: 700, color: brand.navy, fontSize: 11, letterSpacing: 0.5 }}>
            {comp.nombre}
          </div>
        ),
        children: subgrupos.length > 0 ? subgrupos : [],
      };
      cols.push(groupCol);
    }
    return cols;
  }, [componentes, operacionesPorComponente, estados, colorDeEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<OTRow> = [...infoColumns, ...operacionColumns];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <AppstoreOutlined style={{ marginRight: 8 }} />
          Dashboard de Planificación
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Matriz de OTs activas × operaciones del catálogo. Cada celda muestra el estado actual de esa operación en la OT.
      </Text>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Space wrap>
          <Input
            placeholder="Buscar OT, descripción, cliente, equipo…"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 320 }}
          />
          <Select
            placeholder="Filtrar componente"
            allowClear
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
        </Space>
      </Card>

      {otsFiltradas.length === 0 && !loading ? (
        <Empty description="No hay OTs activas." />
      ) : (
        <Table<OTRow>
          rowKey="id"
          size="small"
          columns={visibleColumns(columns, ocultas)}
          dataSource={otsFiltradas}
          loading={loading}
          bordered
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content", y: "calc(100vh - 320px)" }}
          pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} OTs` }}
          onRow={(r) => ({ onClick: () => setDetalle(r), style: { cursor: "pointer" } })}
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
        operaciones={operaciones}
        opsOcultas={opsOcultas}
        setOpsOcultas={setOpsOcultas}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Drawer para configurar qué columnas operación se ven en el dashboard.
// Estructura del árbol: Componente → Estándar/No estándar → Operación.
// Internamente trackea operaciones OCULTAS (más simple para "todas por default visibles").
// ───────────────────────────────────────────────────────────────────────────
function ConfigurarVistaDrawer({
  open, onClose, componentes, operaciones, opsOcultas, setOpsOcultas,
}: {
  open: boolean;
  onClose: () => void;
  componentes: ComponenteCat[];
  operaciones: OperacionCat[];
  opsOcultas: string[];
  setOpsOcultas: (next: string[]) => void;
}) {
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
    // Filtramos solo las hojas (op-*)
    const visibleOps = new Set(
      keys.filter((k) => String(k).startsWith("op-")).map((k) => String(k).substring(3)),
    );
    const nuevasOcultas = operaciones.map((o) => o.codigo).filter((cod) => !visibleOps.has(cod));
    setOpsOcultas(nuevasOcultas);
  }

  function mostrarTodas() { setOpsOcultas([]); }
  function ocultarTodas() { setOpsOcultas(operaciones.map((o) => o.codigo)); }

  return (
    <Drawer
      title="Configurar vista del dashboard"
      open={open}
      onClose={onClose}
      width={460}
      placement="right"
      extra={
        <Space>
          <Button size="small" onClick={mostrarTodas}>Mostrar todas</Button>
          <Button size="small" onClick={ocultarTodas} danger>Ocultar todas</Button>
        </Space>
      }
    >
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Elegí qué componentes y operaciones querés ver en la matriz. Tu selección queda guardada
        para próximas sesiones (por navegador).
      </Text>
      <Tree
        checkable
        treeData={treeData}
        checkedKeys={checkedKeys}
        onCheck={onCheck}
        defaultExpandAll
        selectable={false}
      />
    </Drawer>
  );
}

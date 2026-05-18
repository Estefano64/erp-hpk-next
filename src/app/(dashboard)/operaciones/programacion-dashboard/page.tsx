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
} from "antd";
import {
  AppstoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  BgColorsOutlined,
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

interface ComponenteCat { codigo: string; nombre: string }
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
const DEFAULT_ESTADO_COLOR: Record<string, string> = {
  abierto: "#bfbfbf",
  programado: "#1677FF",
  "en proceso": "#FA8C16",
  realizado: "#52C41A",
  pausado: "#cf1322",
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

  const colorDeEstado = useCallback((codigo: string | null): string => {
    if (!codigo) return "transparent";
    const e = estadoMap.get(codigo);
    if (e?.color) return e.color;
    return DEFAULT_ESTADO_COLOR[codigo.toLowerCase()] ?? "#d9d9d9";
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
  const operacionesPorComponente = useMemo(() => {
    const m = new Map<string, OperacionCat[]>();
    for (const op of operaciones) {
      if (filtroComponente && op.componente_codigo !== filtroComponente) continue;
      const k = op.componente_codigo ?? "__SIN_COMP__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(op);
    }
    return m;
  }, [operaciones, filtroComponente]);

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

  // Columnas dinámicas: una columna padre por componente, hijas por operación
  const operacionColumns: ColumnsType<OTRow> = useMemo(() => {
    const cols: ColumnsType<OTRow> = [];
    for (const comp of componentes) {
      const ops = operacionesPorComponente.get(comp.codigo) ?? [];
      if (ops.length === 0) continue;
      const childrenCols: ColumnsType<OTRow> = ops.map((op): ColumnType<OTRow> => ({
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
      }));
      const groupCol: ColumnGroupType<OTRow> = {
        key: `comp-${comp.codigo}`,
        title: (
          <div style={{ fontWeight: 700, color: brand.navy, fontSize: 11, letterSpacing: 0.5 }}>
            {comp.nombre}
          </div>
        ),
        children: childrenCols,
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
          <Tooltip
            title={
              <div style={{ fontSize: 11 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Leyenda de estados</div>
                {estados.map((e) => (
                  <div key={e.codigo} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ display: "inline-block", width: 16, height: 12, borderRadius: 2, background: e.color ?? DEFAULT_ESTADO_COLOR[e.codigo.toLowerCase()] ?? "#d9d9d9" }} />
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
    </div>
  );
}

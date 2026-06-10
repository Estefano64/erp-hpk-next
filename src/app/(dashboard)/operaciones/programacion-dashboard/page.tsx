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
  Segmented,
  Skeleton,
  DatePicker,
  Row,
  Col,
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
  FileExcelOutlined,
} from "@ant-design/icons";
import type { ColumnsType, ColumnGroupType, ColumnType } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { dateOnlyLocal } from "@/lib/dates";
import { motivoPausa } from "@/lib/motivos-pausa";
import Link from "next/link";
import * as XLSX from "xlsx";

dayjs.extend(isoWeek);

// Código ISO de semana "YYYYWww" — mismo formato que semana_plan/semana_base.
function semanaCodigo(d: Dayjs): string {
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}
import { brand, radius, shadow, space } from "@/lib/theme";
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

// Estado "global" de la OT derivado del progreso de tareas (para KPIs / filtros).
function estadoGlobalOT(o: OTRow): "sin_empezar" | "en_proceso" | "terminada" {
  if (o.progreso.total === 0 || o.progreso.realizadas === 0) return "sin_empezar";
  if (o.progreso.realizadas >= o.progreso.total) return "terminada";
  return "en_proceso";
}
// Atrasada = tiene fecha de entrega vencida y NO está terminada.
function otAtrasada(o: OTRow): boolean {
  if (!o.fecha_entrega) return false;
  if (o.progreso.total > 0 && o.progreso.realizadas >= o.progreso.total) return false;
  // dateOnlyLocal: la fecha viene como medianoche UTC; con dayjs directo caía
  // al día anterior en Lima y la OT salía atrasada un día antes de tiempo.
  return dayjs(dateOnlyLocal(o.fecha_entrega)).isBefore(dayjs(), "day");
}
// ¿Tiene alguna operación tercerizada?
function otTieneTercero(o: OTRow): boolean {
  for (const k in o.plan) { if (o.plan[k]?.externo) return true; }
  return false;
}

type QuickFilter = "todas" | "sin_empezar" | "en_proceso" | "terminada" | "atrasadas" | "terceros";

// Tarjeta KPI clickable que además actúa de filtro rápido (rec. 1 + 3).
function Kpi({ label, value, color, active, onClick }: {
  label: string; value: React.ReactNode; color?: string; active?: boolean; onClick?: () => void;
}) {
  const c = color ?? brand.navy;
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        background: active ? c : brand.white,
        border: `1px solid ${active ? c : brand.border}`,
        borderRadius: radius.md,
        padding: "6px 14px",
        minWidth: 92,
        lineHeight: 1.15,
        boxShadow: shadow.sm,
        transition: "all .15s",
        flex: "0 0 auto",
      }}
    >
      <div style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.85)" : brand.textSecondary }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: active ? brand.white : c }}>{value}</div>
    </div>
  );
}

// ── Rendimiento por operario (semana). Mide justo: cumplimiento del plan +
//    correctivos (crédito) + eficiencia (horas est/real). Usa /api/operaciones/rendimiento. ──
interface RendimientoOperario {
  operario: string;
  planAsignadas: number; planCumplidas: number; pendientes: number;
  correctivos: number; cargaReal: number;
  cumplimiento: number | null; eficiencia: number | null;
  horasEst: number; horasRealPlan: number; horasRealCorrectivos: number;
}

function RendimientoOperarios({ isMobile }: { isMobile: boolean }) {
  const { message } = App.useApp();
  const [semanaDate, setSemanaDate] = useState<Dayjs>(() => dayjs().startOf("isoWeek"));
  const [rows, setRows] = useState<RendimientoOperario[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const semana = semanaCodigo(semanaDate);

  const fetchR = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/operaciones/rendimiento?semana=${encodeURIComponent(semana)}`);
      if (!res.ok) throw new Error("Error al cargar rendimiento");
      const data = await res.json();
      setRows((data.operarios ?? []) as RendimientoOperario[]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [semana, message]);
  useEffect(() => { fetchR(); }, [fetchR]);

  const tot = useMemo(() => {
    const planAsig = rows.reduce((s, r) => s + r.planAsignadas, 0);
    const planCump = rows.reduce((s, r) => s + r.planCumplidas, 0);
    const corr = rows.reduce((s, r) => s + r.correctivos, 0);
    return { planAsig, planCump, corr, cumpl: planAsig > 0 ? Math.round((planCump / planAsig) * 100) : 0, operarios: rows.length };
  }, [rows]);

  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const cumplColor = (v: number | null) => (v == null ? brand.textSecondary : v >= 0.85 ? brand.success : v >= 0.6 ? brand.warning : brand.error);
  const efColor = (v: number | null) => (v == null ? brand.textSecondary : v >= 1 ? brand.success : v >= 0.8 ? brand.warning : brand.error);

  const columns: ColumnsType<RendimientoOperario> = [
    { title: "Operario", dataIndex: "operario", key: "operario", fixed: "left", width: 210, render: (s: string) => <Text strong>{s}</Text> },
    {
      title: <Tooltip title="Tareas del plan cumplidas / asignadas en la semana">Plan</Tooltip>,
      key: "plan", width: 110, align: "center",
      render: (_: unknown, r) => <span>{r.planCumplidas}<Text type="secondary"> / {r.planAsignadas}</Text></span>,
    },
    {
      title: "Cumplimiento", dataIndex: "cumplimiento", key: "cumplimiento", width: 150,
      sorter: (a, b) => (a.cumplimiento ?? -1) - (b.cumplimiento ?? -1),
      render: (v: number | null) => (
        <Tooltip title="% de tareas del plan que completó">
          <Progress percent={v == null ? 0 : Math.round(v * 100)} size="small" strokeColor={cumplColor(v)} format={() => pct(v)} />
        </Tooltip>
      ),
    },
    {
      title: <Tooltip title="Tareas del plan que quedaron sin completar">Pendientes</Tooltip>,
      dataIndex: "pendientes", key: "pendientes", width: 110, align: "center",
      render: (v: number) => (v > 0 ? <Tag color="warning" style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">0</Text>),
    },
    {
      title: <Tooltip title="Correctivos (emergencias) que hizo fuera del plan — crédito extra">Correctivos</Tooltip>,
      dataIndex: "correctivos", key: "correctivos", width: 120, align: "center",
      sorter: (a, b) => a.correctivos - b.correctivos,
      render: (v: number) => (v > 0 ? <Tag color="red" style={{ margin: 0 }}>+{v}</Tag> : <Text type="secondary">0</Text>),
    },
    {
      title: <Tooltip title="Total que sacó: tareas del plan cumplidas + correctivos">Carga real</Tooltip>,
      dataIndex: "cargaReal", key: "cargaReal", width: 110, align: "center",
      defaultSortOrder: "descend", sorter: (a, b) => a.cargaReal - b.cargaReal,
      render: (v: number) => <Text strong style={{ fontSize: 15 }}>{v}</Text>,
    },
    {
      title: <Tooltip title="Horas estimadas / horas reales de lo cumplido. >100% = más rápido que lo planeado.">Eficiencia</Tooltip>,
      dataIndex: "eficiencia", key: "eficiencia", width: 120, align: "center",
      sorter: (a, b) => (a.eficiencia ?? -1) - (b.eficiencia ?? -1),
      render: (v: number | null) => <span style={{ color: efColor(v), fontWeight: 600 }}>{pct(v)}</span>,
    },
    {
      title: "Horas (real / est)", key: "horas", width: 150, align: "center",
      render: (_: unknown, r) => <Text type="secondary" style={{ fontSize: 12 }}>{r.horasRealPlan}h / {r.horasEst}h</Text>,
    },
  ];

  const header = (
    <Card size="small" style={{ marginBottom: space.sm }} styles={{ body: { padding: 10 } }}>
      <Space wrap>
        <DatePicker
          picker="week"
          value={semanaDate}
          onChange={(d) => d && setSemanaDate(d.startOf("isoWeek"))}
          format={(v) => `Semana ${v.isoWeek()}, ${v.isoWeekYear()}`}
          allowClear={false}
          style={{ minWidth: 180 }}
        />
        <Button onClick={() => setSemanaDate(dayjs().startOf("isoWeek"))}>Esta semana</Button>
        <Button icon={<ReloadOutlined />} onClick={fetchR} loading={loading}>Refrescar</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>{semana}</Text>
      </Space>
    </Card>
  );

  const kpis = (
    <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginBottom: space.sm }}>
      <Kpi label="Operarios" value={tot.operarios} color={brand.navy} />
      <Kpi label="Plan cumplido" value={`${tot.planCump}/${tot.planAsig}`} color={brand.cyan} />
      <Kpi label="Cumplimiento" value={`${tot.cumpl}%`} color={tot.cumpl >= 85 ? brand.success : tot.cumpl >= 60 ? brand.warning : brand.error} />
      <Kpi label="Correctivos" value={tot.corr} color={brand.error} />
    </div>
  );

  return (
    <>
      {header}
      {kpis}
      {rows.length === 0 ? (
        <Empty description={loading ? "Cargando…" : "Sin actividad de operarios en esta semana."} />
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          {rows.map((r) => (
            <Card key={r.operario} size="small" styles={{ body: { padding: 12 } }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Text strong style={{ color: brand.navy }}>{r.operario}</Text>
                <Text strong>Carga real: {r.cargaReal}</Text>
              </div>
              <Progress percent={r.cumplimiento == null ? 0 : Math.round(r.cumplimiento * 100)} size="small" strokeColor={cumplColor(r.cumplimiento)} format={() => `Plan ${r.planCumplidas}/${r.planAsignadas} · ${pct(r.cumplimiento)}`} />
              <div style={{ fontSize: 12, color: brand.textSecondary, marginTop: 6 }}>
                {r.correctivos > 0 && <Tag color="red" style={{ margin: 0, marginRight: 6 }}>+{r.correctivos} correctivos</Tag>}
                Eficiencia <span style={{ color: efColor(r.eficiencia), fontWeight: 600 }}>{pct(r.eficiencia)}</span> · {r.horasRealPlan}h/{r.horasEst}h
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card size="small" styles={{ body: { padding: 0 } }}>
          <Table<RendimientoOperario>
            rowKey="operario"
            columns={columns}
            dataSource={rows}
            loading={loading}
            size="small"
            scroll={{ x: 1080 }}
            pagination={paginacionEstandar({ current: page, pageSize, total: rows.length, onChange: (p, s) => { setPage(p); setPageSize(s); }, label: "operarios" })}
          />
        </Card>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tab RESUMEN — la pantalla "de cada mañana" del planner. Cuatro paneles que
   responden: ¿quién trabaja ahora? · ¿cómo va la semana vs lo enviado? ·
   ¿dónde se pierden horas (motivos de pausa)? · ¿qué vence o está atrasado?
   Se refresca solo cada 60s ("Trabajando ahora" es en vivo).
   ═══════════════════════════════════════════════════════════════════════════ */
interface ResumenData {
  trabajandoAhora: {
    tecnico: string; inicio: string; transcurrido_h: number; tarea: string;
    componente: string; horas_estimadas: number | null; es_correctivo: boolean;
    ot: number | null; ot_id: number | null;
  }[];
  libres: string[];
  semana: {
    codigo: string; total: number; realizadas: number; enviadas: number;
    operarios: { nombre: string; total: number; realizadas: number; enProceso: number; desviadas: number; fueraDePlan: number; pct: number }[];
  };
  pausas: { motivo: string; horas: number; veces: number }[];
  alertas: {
    atrasadas: { id: number; ot: number | null; descripcion: string | null; cliente: string | null; fecha: string }[];
    atrasadasTotal: number;
    porVencer: { id: number; ot: number | null; descripcion: string | null; cliente: string | null; fecha: string }[];
    porVencerTotal: number;
    poolSinAsignar: number;
  };
}

function ResumenPlanner() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchResumen = useCallback(async () => {
    try {
      const res = await fetch("/api/operaciones/resumen-planner");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchResumen();
    const id = setInterval(fetchResumen, 60_000);
    return () => clearInterval(id);
  }, [fetchResumen]);

  if (loading && !data) return <Skeleton active title={false} paragraph={{ rows: 10 }} style={{ padding: 16 }} />;
  if (!data) return <Empty description="No se pudo cargar el resumen." />;

  const tituloCard = (icono: string, texto: string, extra?: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 14 }}>{icono} {texto}</span>
      {extra}
    </div>
  );
  const fila: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
    borderBottom: `1px solid ${brand.border}`, fontSize: 12,
  };
  const maxPausa = Math.max(1, ...data.pausas.map((p) => p.horas));
  const diasDiff = (fecha: string) => dayjs().startOf("day").diff(dayjs(dateOnlyLocal(fecha)), "day");

  return (
    <Row gutter={[12, 12]}>
      {/* ── Trabajando ahora (en vivo) ── */}
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={tituloCard("▶", `Trabajando ahora (${data.trabajandoAhora.length})`,
            <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>en vivo · se actualiza solo</Tag>)}
          styles={{ body: { padding: "8px 14px", maxHeight: 360, overflowY: "auto" } }}
        >
          {data.trabajandoAhora.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nadie tiene una tarea en curso." />
          ) : data.trabajandoAhora.map((s, i) => {
            const sobre = s.horas_estimadas != null && s.horas_estimadas > 0 && s.transcurrido_h > s.horas_estimadas;
            return (
              <div key={i} style={fila}>
                <span style={{ flex: "0 0 200px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tecnico}</span>
                <span style={{ flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.es_correctivo && "🚨 "}
                  {s.ot_id != null
                    ? <Link href={`/ordenes-trabajo/${s.ot_id}`} style={{ color: brand.navy, fontWeight: 600 }}>OT {s.ot}</Link>
                    : <Tag style={{ margin: 0, fontSize: 10 }}>S/OT</Tag>}
                  {" "}· {s.componente} — {s.tarea}
                </span>
                <Tooltip title={`Arrancó ${dayjs(s.inicio).format("HH:mm")}${s.horas_estimadas != null ? ` · estimado ${s.horas_estimadas.toFixed(1)}h` : ""}`}>
                  <Tag color={sobre ? "error" : "cyan"} style={{ margin: 0, fontFamily: "monospace" }}>
                    {s.transcurrido_h.toFixed(1)}h{s.horas_estimadas != null ? ` / ${s.horas_estimadas.toFixed(1)}h` : ""}
                  </Tag>
                </Tooltip>
              </div>
            );
          })}
          {data.libres.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: brand.textSecondary }}>
              <Tooltip title={data.libres.join(" · ")}>
                <span>⚠ <strong>{data.libres.length}</strong> operario(s) sin tarea en curso: {data.libres.slice(0, 3).join(", ")}{data.libres.length > 3 ? "…" : ""}</span>
              </Tooltip>
            </div>
          )}
        </Card>
      </Col>

      {/* ── Semana enviada vs real ── */}
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={tituloCard("📌", `Semana ${data.semana.codigo} — plan vs real`,
            <Link href="/operaciones/programacion-semanal" style={{ fontSize: 12 }}>Abrir Gantt →</Link>)}
          styles={{ body: { padding: "8px 14px", maxHeight: 360, overflowY: "auto" } }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Progress
              percent={data.semana.total > 0 ? Math.round((data.semana.realizadas / data.semana.total) * 100) : 0}
              size="small"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{data.semana.realizadas}/{data.semana.total} tareas</span>
          </div>
          {data.semana.operarios.map((o) => (
            <div key={o.nombre} style={fila}>
              <span style={{ flex: "0 0 200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nombre}</span>
              <Progress percent={o.pct} size="small" style={{ flex: 1, minWidth: 80 }} />
              <span style={{ flex: "0 0 auto", fontSize: 11, color: brand.textSecondary, whiteSpace: "nowrap" }}>
                {o.realizadas}/{o.total}
                {o.enProceso > 0 && <Tooltip title="En proceso ahora"><span style={{ marginLeft: 6 }}>▶{o.enProceso}</span></Tooltip>}
                {o.desviadas > 0 && <Tooltip title="Distintas a lo enviado (movidas)"><span style={{ marginLeft: 6, color: brand.warning }}>↷{o.desviadas}</span></Tooltip>}
                {o.fueraDePlan > 0 && <Tooltip title="Agregadas después de enviar la semana"><span style={{ marginLeft: 6, color: brand.warning }}>＋{o.fueraDePlan}</span></Tooltip>}
              </span>
            </div>
          ))}
          {data.semana.operarios.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin tareas esta semana." />
          )}
        </Card>
      </Col>

      {/* ── Pausas de la semana por motivo ── */}
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={tituloCard("⏸", "Horas de pausa por motivo (semana)",
            <Tooltip title="Hueco entre que el técnico pausó y retomó (mismo día). Sale de los motivos que eligen al pausar.">
              <Tag style={{ margin: 0, fontSize: 10 }}>¿qué frena al taller?</Tag>
            </Tooltip>)}
          styles={{ body: { padding: "8px 14px" } }}
        >
          {data.pausas.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin pausas registradas esta semana." />
          ) : data.pausas.map((p) => {
            const m = motivoPausa(p.motivo);
            return (
              <div key={p.motivo} style={{ ...fila, borderBottom: "none", padding: "3px 0" }}>
                <span style={{ flex: "0 0 220px", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m?.label ?? "Sin motivo (registros viejos)"}
                </span>
                <div style={{ flex: 1, background: brand.bgPage, borderRadius: 3, height: 14 }}>
                  <div style={{ width: `${Math.round((p.horas / maxPausa) * 100)}%`, minWidth: 4, height: 14, borderRadius: 3, background: brand.cyan }} />
                </div>
                <span style={{ flex: "0 0 90px", textAlign: "right", fontSize: 12, fontWeight: 600 }}>{p.horas.toFixed(1)}h · {p.veces}×</span>
              </div>
            );
          })}
        </Card>
      </Col>

      {/* ── Alertas: vencimientos y pool ── */}
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={tituloCard("🔥", "Para hoy",
            <Link href="/operaciones/programacion-semanal" style={{ fontSize: 12 }}>
              {data.alertas.poolSinAsignar} tarea(s) sin programar →
            </Link>)}
          styles={{ body: { padding: "8px 14px", maxHeight: 360, overflowY: "auto" } }}
        >
          {data.alertas.atrasadasTotal > 0 && (
            <>
              <Text strong style={{ fontSize: 12, color: brand.error }}>Atrasadas ({data.alertas.atrasadasTotal})</Text>
              {data.alertas.atrasadas.slice(0, 6).map((o) => (
                <div key={o.id} style={fila}>
                  <Link href={`/ordenes-trabajo/${o.id}`} style={{ flex: "0 0 70px", fontWeight: 600, color: brand.navy }}>OT {o.ot ?? o.id}</Link>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente ?? "—"} · {o.descripcion ?? ""}</span>
                  <Tag color="error" style={{ margin: 0, fontSize: 10 }}>hace {diasDiff(o.fecha)}d</Tag>
                </div>
              ))}
            </>
          )}
          <Text strong style={{ fontSize: 12, display: "block", marginTop: data.alertas.atrasadasTotal > 0 ? 10 : 0 }}>
            Vencen en 7 días ({data.alertas.porVencerTotal})
          </Text>
          {data.alertas.porVencer.length === 0 ? (
            <div style={{ fontSize: 12, color: brand.textSecondary, padding: "4px 0" }}>Nada por vencer esta semana. 🎉</div>
          ) : data.alertas.porVencer.slice(0, 6).map((o) => {
            const d = -diasDiff(o.fecha);
            return (
              <div key={o.id} style={fila}>
                <Link href={`/ordenes-trabajo/${o.id}`} style={{ flex: "0 0 70px", fontWeight: 600, color: brand.navy }}>OT {o.ot ?? o.id}</Link>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente ?? "—"} · {o.descripcion ?? ""}</span>
                <Tag color={d <= 1 ? "error" : d <= 3 ? "warning" : "default"} style={{ margin: 0, fontSize: 10 }}>
                  {d === 0 ? "HOY" : d === 1 ? "mañana" : `en ${d}d`}
                </Tag>
              </div>
            );
          })}
        </Card>
      </Col>
    </Row>
  );
}

export default function ProgramacionDashboardPage() {
  const { screens } = useResponsive();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [componentes, setComponentes] = useState<ComponenteCat[]>([]);
  const [operaciones, setOperaciones] = useState<OperacionCat[]>([]);
  const [estados, setEstados] = useState<EstadoCat[]>([]);
  const [ots, setOts] = useState<OTRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [filtroComponente, setFiltroComponente] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todas");
  const [leyendaVisible, setLeyendaVisible] = useState(true);
  const [densidad, setDensidad] = useState<"compacto" | "comodo">("compacto");
  // Componentes (grupos de columnas) colapsados → muestran una sola columna resumen.
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set());
  const toggleGrupo = useCallback((cod: string) => {
    setGruposColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  }, []);
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
  // Vista principal: matriz de OTs (default) o rendimiento por operario.
  // "resumen" es el landing: la pantalla de cada mañana del planner (en vivo).
  const [vistaTab, setVistaTab] = useState<"resumen" | "matriz" | "rendimiento">("resumen");
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

  // KPIs sobre el set buscado (no el quickFilter, para que sean estables).
  const kpis = useMemo(() => {
    let sinEmpezar = 0, enProceso = 0, terminadas = 0, atrasadas = 0, terceros = 0;
    let totTareas = 0, totReal = 0;
    for (const o of otsFiltradas) {
      const e = estadoGlobalOT(o);
      if (e === "sin_empezar") sinEmpezar++; else if (e === "en_proceso") enProceso++; else terminadas++;
      if (otAtrasada(o)) atrasadas++;
      if (otTieneTercero(o)) terceros++;
      totTareas += o.progreso.total; totReal += o.progreso.realizadas;
    }
    return {
      activas: otsFiltradas.length,
      avance: totTareas > 0 ? Math.round((totReal / totTareas) * 100) : 0,
      sinEmpezar, enProceso, terminadas, atrasadas, terceros,
    };
  }, [otsFiltradas]);

  // Lista visible = búsqueda + quickFilter, ordenada por urgencia
  // (atrasadas primero, luego prioridad, luego fecha de entrega).
  const otsVisibles = useMemo(() => {
    const filtradas = otsFiltradas.filter((o) => {
      switch (quickFilter) {
        case "sin_empezar": return estadoGlobalOT(o) === "sin_empezar";
        case "en_proceso": return estadoGlobalOT(o) === "en_proceso";
        case "terminada": return estadoGlobalOT(o) === "terminada";
        case "atrasadas": return otAtrasada(o);
        case "terceros": return otTieneTercero(o);
        default: return true;
      }
    });
    return [...filtradas].sort((a, b) => {
      const atrA = otAtrasada(a) ? 0 : 1, atrB = otAtrasada(b) ? 0 : 1;
      if (atrA !== atrB) return atrA - atrB;
      const pa = a.prioridad_nivel ?? 99, pb = b.prioridad_nivel ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.fecha_entrega ?? "9999").localeCompare(b.fecha_entrega ?? "9999");
    });
  }, [otsFiltradas, quickFilter]);

  const cargandoInicial = loading && ots.length === 0;

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
    if (!estado) return <div style={{ width: "100%", textAlign: "center", color: brand.textSecondary }}>—</div>;
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
      width: 90,
      align: "left",
      fixed: "left",
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
              <div style={{ fontSize: 10, color: brand.textSecondary }}>{realizadas}/{total} ({pct}%)</div>
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

      // Grupo COLAPSADO: una sola columna-resumen (realizadas/total de sus ops).
      if (gruposColapsados.has(comp.codigo)) {
        cols.push({
          key: `comp-${comp.codigo}-collapsed`,
          width: 48,
          align: "center" as const,
          title: (
            <div
              onClick={() => toggleGrupo(comp.codigo)}
              title={`Expandir ${comp.nombre}`}
              style={{ cursor: "pointer", fontWeight: 700, color: brand.white, fontSize: 10, background: compColor, padding: "4px 2px", borderRadius: 4, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}
            >
              ▸ {comp.nombre}
            </div>
          ),
          render: (_: unknown, r: OTRow) => {
            let tot = 0, ok = 0;
            for (const op of ops) {
              const key = `${comp.codigo.trim().toUpperCase()}__${op.codigo.trim().toUpperCase()}`;
              const cell = r.plan[key];
              if (cell?.estado) { tot++; if (String(cell.estado).toLowerCase() === "realizado") ok++; }
            }
            if (tot === 0) return <span style={{ color: brand.textSecondary, fontSize: 10 }}>—</span>;
            return <span style={{ fontSize: 10, fontWeight: 700, color: ok >= tot ? brand.success : brand.textSecondary }}>{ok}/{tot}</span>;
          },
        } as ColumnType<OTRow>);
        continue;
      }

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
          <div
            onClick={() => toggleGrupo(comp.codigo)}
            title={`Colapsar ${comp.nombre}`}
            style={{
              cursor: "pointer",
              fontWeight: 700,
              color: brand.white,
              fontSize: 11,
              letterSpacing: 0.5,
              background: compColor,
              padding: "4px 8px",
              borderRadius: 4,
              display: "inline-block",
            }}>
            {comp.nombre} <span style={{ opacity: 0.85 }}>▾</span>
          </div>
        ),
        children: subgrupos.length > 0 ? subgrupos : [],
      };
      cols.push(groupCol);
    }
    return cols;
  }, [componentesOrdenados, operacionesPorComponente, estados, colorDeEstado, gruposColapsados, toggleGrupo]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<OTRow> = [...infoColumns, ...operacionColumns];

  // Export client-side de la matriz a .xlsx (una columna por operación visible).
  const exportarMatriz = useCallback(() => {
    const rows = otsVisibles.map((o) => {
      const r: Record<string, string | number> = {
        "OT HP&K": o.ot ?? `#${o.id}`,
        "Cliente": o.cliente_nombre ?? o.cliente_codigo ?? "",
        "Descripción": o.descripcion ?? "",
        "Flota": o.modelo ?? "",
        "N/P": o.np ?? "",
        "Prioridad": o.prioridad_codigo ?? "",
        "F. Ingreso": o.fecha_recepcion ? dayjs(o.fecha_recepcion).format("DD/MM/YYYY") : "",
        "Fecha entrega": o.fecha_entrega ? dayjs(o.fecha_entrega).format("DD/MM/YYYY") : "",
        "Status OT": o.ot_status ?? "",
        "Avance": o.progreso.total > 0 ? `${o.progreso.realizadas}/${o.progreso.total}` : "",
      };
      for (const comp of componentesOrdenados) {
        for (const op of operacionesPorComponente.get(comp.codigo) ?? []) {
          const key = `${comp.codigo.trim().toUpperCase()}__${op.codigo.trim().toUpperCase()}`;
          const cell = o.plan[key];
          r[`${comp.nombre} · ${op.nombre}`] = cell?.estado
            ? `${estadoMap.get(cell.estado)?.nombre ?? cell.estado}${cell.externo ? " (tercero)" : ""}`
            : "";
        }
      }
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Planificación");
    XLSX.writeFile(wb, `Planificacion-${dayjs().format("YYYYMMDD-HHmm")}.xlsx`);
  }, [otsVisibles, componentesOrdenados, operacionesPorComponente, estadoMap]);

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
          <Segmented
            value={vistaTab}
            onChange={(v) => setVistaTab(v as "resumen" | "matriz" | "rendimiento")}
            options={[
              { label: "Resumen", value: "resumen" },
              { label: "Matriz de OTs", value: "matriz" },
              { label: "Rendimiento", value: "rendimiento" },
            ]}
          />
          {vistaTab === "matriz" && (<>
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
          <Button
            icon={<BgColorsOutlined />}
            type={leyendaVisible ? "primary" : "default"}
            onClick={() => setLeyendaVisible((v) => !v)}
          >
            Leyenda
          </Button>
          <Segmented
            size="small"
            value={densidad}
            onChange={(v) => setDensidad(v as "compacto" | "comodo")}
            options={[{ label: "Compacto", value: "compacto" }, { label: "Cómodo", value: "comodo" }]}
          />
          {gruposColapsados.size > 0 && (
            <Button onClick={() => setGruposColapsados(new Set())}>
              Expandir grupos ({gruposColapsados.size})
            </Button>
          )}
          <Button icon={<FileExcelOutlined />} onClick={exportarMatriz} disabled={otsVisibles.length === 0}>
            Exportar
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
            Refrescar
          </Button>
          </>)}
        </Space>
      </Card>

      {vistaTab === "resumen" ? (
        <ResumenPlanner />
      ) : vistaTab === "rendimiento" ? (
        <RendimientoOperarios isMobile={isMobile} />
      ) : cargandoInicial ? (
        <Skeleton active title={false} paragraph={{ rows: 10 }} style={{ padding: 16 }} />
      ) : (
        <>
      {/* ── KPIs (también filtran la matriz) ── */}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap", marginBottom: space.sm }}>
        <Kpi label="OTs activas" value={kpis.activas} active={quickFilter === "todas"} onClick={() => setQuickFilter("todas")} />
        <Kpi label="Avance global" value={`${kpis.avance}%`} color={brand.cyan} />
        <Kpi label="Sin empezar" value={kpis.sinEmpezar} color={brand.warning} active={quickFilter === "sin_empezar"} onClick={() => setQuickFilter((q) => q === "sin_empezar" ? "todas" : "sin_empezar")} />
        <Kpi label="En proceso" value={kpis.enProceso} color="#FA8C16" active={quickFilter === "en_proceso"} onClick={() => setQuickFilter((q) => q === "en_proceso" ? "todas" : "en_proceso")} />
        <Kpi label="Terminadas" value={kpis.terminadas} color={brand.success} active={quickFilter === "terminada"} onClick={() => setQuickFilter((q) => q === "terminada" ? "todas" : "terminada")} />
        <Kpi label="Atrasadas" value={kpis.atrasadas} color={brand.error} active={quickFilter === "atrasadas"} onClick={() => setQuickFilter((q) => q === "atrasadas" ? "todas" : "atrasadas")} />
        <Kpi label="A tercero 🤝" value={kpis.terceros} color={brand.navy} active={quickFilter === "terceros"} onClick={() => setQuickFilter((q) => q === "terceros" ? "todas" : "terceros")} />
      </div>

      {/* ── Leyenda de estados (visible/colapsable) ── */}
      {leyendaVisible && (
        <Card size="small" style={{ marginBottom: space.sm }} styles={{ body: { padding: "6px 12px" } }}>
          <Space wrap size={14}>
            <Text style={{ fontSize: 11, fontWeight: 600, color: brand.textSecondary }}>Estados:</Text>
            {estados.map((e) => (
              <span key={e.codigo} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <span style={{ display: "inline-block", width: 18, height: 13, borderRadius: 2, background: colorDeEstado(e.codigo), color: brand.white, fontSize: 8, fontWeight: 700, textAlign: "center", lineHeight: "13px" }}>{abreviarEstado(e.codigo)}</span>
                {e.nombre}
              </span>
            ))}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ display: "inline-block", width: 18, height: 13, borderRadius: 2, background: brand.textSecondary, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 6px)", boxShadow: `inset 0 0 0 1px ${brand.warning}` }} />
              🤝 Trabajo a tercero
            </span>
          </Space>
        </Card>
      )}

      {otsVisibles.length === 0 ? (
        <Empty description={quickFilter === "todas" ? "No hay OTs activas." : "No hay OTs que coincidan con el filtro."} />
      ) : isMobile ? (
        /* ── Fallback mobile: lista de tarjetas por OT (avance + estados resumidos) ── */
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          {otsVisibles.map((o) => {
            const pct = o.progreso.total > 0 ? Math.round((o.progreso.realizadas / o.progreso.total) * 100) : 0;
            const atrasada = otAtrasada(o);
            return (
              <Card
                key={o.id}
                size="small"
                onClick={() => setDetalle(o)}
                style={{ cursor: "pointer", borderLeft: atrasada ? `3px solid ${brand.error}` : `3px solid ${brand.border}` }}
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text strong style={{ color: brand.navy }}>OT {o.ot ?? `#${o.id}`}</Text>
                  <Space size={4}>
                    {o.prioridad_codigo && <Tag color={prioridadColor(o.prioridad_nivel)} style={{ margin: 0 }}>{o.prioridad_codigo}</Tag>}
                    {atrasada && <Tag color="error" style={{ margin: 0 }}>Atrasada</Tag>}
                  </Space>
                </div>
                <div style={{ fontSize: 12, color: brand.textSecondary, marginBottom: 6 }}>
                  {o.cliente_nombre ?? o.cliente_codigo ?? "—"} · {o.modelo ?? "—"}{o.descripcion ? ` · ${o.descripcion}` : ""}
                </div>
                <Progress percent={pct} size="small" status={pct === 100 ? "success" : "active"} />
                <div style={{ fontSize: 11, color: brand.textSecondary, marginBottom: 6 }}>{o.progreso.realizadas}/{o.progreso.total} tareas</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {componentesOrdenados.map((comp) => {
                    let tot = 0, ok = 0;
                    for (const op of operacionesPorComponente.get(comp.codigo) ?? []) {
                      const key = `${comp.codigo.trim().toUpperCase()}__${op.codigo.trim().toUpperCase()}`;
                      const cell = o.plan[key];
                      if (cell?.estado) { tot++; if (String(cell.estado).toLowerCase() === "realizado") ok++; }
                    }
                    if (tot === 0) return null;
                    return <Tag key={comp.codigo} color={ok >= tot ? "success" : "default"} style={{ margin: 0, fontSize: 10 }}>{comp.nombre} {ok}/{tot}</Tag>;
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <TablaProgramacion
          columns={visibleColumns(columns, ocultas)}
          data={otsVisibles}
          loading={loading}
          densidad={densidad}
          onRowClick={(r) => setDetalle(r)}
          page={page}
          pageSize={pageSize}
          onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
        />
      )}
        </>
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
  columns, data, loading, densidad, onRowClick, page, pageSize, onPageChange,
}: {
  columns: ColumnsType<OTRow>; data: OTRow[]; loading: boolean;
  densidad: "compacto" | "comodo";
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
      <div className="pdash-tabla">
        <Table<OTRow>
          rowKey="id"
          size={densidad === "comodo" ? "middle" : "small"}
          columns={columnas}
          components={components}
          dataSource={data}
          loading={loading}
          bordered
          sticky={STICKY_HEADER}
          scroll={{ x: "max-content", y: "calc(100vh - 280px)" }}
          rowClassName={(r, idx) => `${idx % 2 === 1 ? "pdash-zebra" : ""} ${otAtrasada(r) ? "pdash-overdue" : ""}`.trim()}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total: data.length,
            onChange: onPageChange,
            label: "OTs",
          })}
          onRow={(r) => ({ onClick: () => onRowClick(r), style: { cursor: "pointer" } })}
        />
      </div>
      <style jsx global>{`
        .pdash-tabla .pdash-zebra > td { background: #FAFBFC; }
        .pdash-tabla .pdash-overdue > td:first-child { box-shadow: inset 3px 0 0 ${brand.error}; }
        .pdash-tabla .pdash-overdue > td { background: rgba(207, 19, 34, 0.04); }
        .pdash-tabla .ant-table-tbody > tr:hover > td { background: rgba(17, 160, 182, 0.10) !important; }
      `}</style>
    </TableDragWrapper>
  );
}

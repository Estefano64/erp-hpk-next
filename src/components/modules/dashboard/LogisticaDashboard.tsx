"use client";

// Dashboard de Logística.
// Fase 1: layout + filtros (sin data).
// Fase 2 (this commit): sección Requerimientos conectada al endpoint
//   /api/dashboard/logistica/requerimientos con KPIs + 4 charts + toggles
//   (vista General/Ítem + tipo Todos/Repuestos/Servicios).
//
// Basado en mockup dashboard_logistica.html (Chart.js + Tabler icons).

import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, Typography, Segmented, Select, Tag, Row, Col, Empty, Space, Spin, Statistic } from "antd";
import {
  FileTextOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  ToolOutlined,
  DollarOutlined,
  CalendarOutlined,
  FilterOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Cell,
} from "recharts";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

type Modo = "anio" | "mes" | "sem";

// Lista de años: del 2024 al año actual + 1.
function aniosDisponibles(): number[] {
  const actual = dayjs().year();
  const desde = 2024;
  const arr: number[] = [];
  for (let y = actual + 1; y >= desde; y--) arr.push(y);
  return arr;
}

const MESES = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" }, { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" }, { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" }, { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" }, { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

function semanasDisponibles(anio: number): { value: number; label: string }[] {
  // ISO week: usualmente 52 o 53 por año.
  const max = dayjs(`${anio}-12-28`).isoWeek();
  return Array.from({ length: max }, (_, i) => ({ value: i + 1, label: `Semana ${i + 1}` }));
}

// Card placeholder para una sección que aún no tiene data conectada.
function SeccionPlaceholder({
  icon, iconBg, label, titulo, descripcion,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: iconBg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            {label}
          </div>
          <Title level={5} style={{ margin: 0 }}>{titulo}</Title>
        </div>
      </div>
      <Card>
        <Empty
          description={
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>{descripcion}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                (KPIs y gráficos se conectan en la próxima fase)
              </Text>
            </div>
          }
        />
      </Card>
    </div>
  );
}

export default function LogisticaDashboard() {
  const [modo, setModo] = useState<Modo>("mes");
  const anioActual = dayjs().year();
  const mesActual = dayjs().month() + 1;
  const semanaActual = dayjs().isoWeek();
  const [anio, setAnio] = useState<number>(anioActual);
  const [mes, setMes] = useState<number>(mesActual);
  const [semana, setSemana] = useState<number>(semanaActual);

  const anios = useMemo(() => aniosDisponibles(), []);
  const semanas = useMemo(() => semanasDisponibles(anio), [anio]);

  // Texto del contexto activo — se muestra como tag debajo de los filtros y
  // se usará como rótulo en los charts.
  const ctxTexto = useMemo(() => {
    if (modo === "anio") return `Año: ${anio}`;
    if (modo === "mes") {
      const m = MESES.find((x) => x.value === mes)?.label ?? mes;
      return `Mes: ${m} ${anio}`;
    }
    return `Semana ${semana} · ${anio}`;
  }, [modo, anio, mes, semana]);

  return (
    <div style={{ padding: "8px 4px" }}>
      {/* Top bar: título + filtros */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 14, marginBottom: 12,
      }}>
        <Space size={10} align="center">
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: brand.bgPage,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CalendarOutlined style={{ fontSize: 21, color: brand.navy }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, color: brand.navy }}>
              Dashboard Logística
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Resumen del área · indicadores y movimiento
            </Text>
          </div>
        </Space>

        <Space wrap size={14}>
          <Segmented
            value={modo}
            onChange={(v) => setModo(v as Modo)}
            options={[
              { value: "anio", label: "Año" },
              { value: "mes", label: "Mes" },
              { value: "sem", label: "Semana" },
            ]}
          />
          <Space size={6} align="center">
            <FilterOutlined style={{ color: brand.textSecondary }} />
            <Select
              value={anio}
              onChange={setAnio}
              options={anios.map((y) => ({ value: y, label: String(y) }))}
              style={{ width: 100 }}
            />
            <Select
              value={mes}
              onChange={setMes}
              disabled={modo !== "mes"}
              options={MESES}
              style={{ width: 130 }}
            />
            <Select
              value={semana}
              onChange={setSemana}
              disabled={modo !== "sem"}
              options={semanas}
              style={{ width: 130 }}
            />
          </Space>
        </Space>
      </div>

      <Tag color="blue" style={{ marginBottom: 18, padding: "4px 10px" }}>
        <FilterOutlined /> Filtro activo · {ctxTexto}
      </Tag>

      {/* Secciones */}
      <Row gutter={[16, 0]}>
        <Col span={24}>
          <SeccionRequerimientos modo={modo} anio={anio} mes={mes} sem={semana} />
        </Col>
        <Col span={24}>
          <SeccionOC modo={modo} anio={anio} mes={mes} sem={semana} />
        </Col>
        <Col span={24}>
          <SeccionInventario modo={modo} anio={anio} mes={mes} sem={semana} />
        </Col>
        <Col span={24}>
          <SeccionOT modo={modo} anio={anio} mes={mes} sem={semana} />
        </Col>
        <Col span={24}>
          <SeccionFacturacion modo={modo} anio={anio} mes={mes} sem={semana} />
        </Col>
      </Row>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección: Requerimientos
//
// Fetch a /api/dashboard/logistica/requerimientos con los filtros del header
// + dos toggles propios:
//   - vista: "gen" (por nro_req único) vs "item" (por OTRepuesto.id)
//   - tipo: "all" / "rep" (MAC+CAD) / "serv" (SER)
//
// Renderiza 3 KPI Cards + 4 BarCharts horizontales con recharts.
// ───────────────────────────────────────────────────────────────────────────
interface ReqResp {
  kpis: { emitidos: number; aprobados: number; enProceso: number; l1Label: string };
  porMes: number[];
  porSemana: { label: string; value: number }[];
  porOt: number[];
  porTiempo: number[];
}

const MES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const TIEMPO_LABELS = ["1-3d", "4-6d", "7-10d", "+10d"];
const OT_LABELS = ["1", "2", "3", "4", "5+"];

function SeccionRequerimientos({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [vista, setVista] = useState<"gen" | "item">("gen");
  const [tipo, setTipo] = useState<"all" | "rep" | "serv">("all");
  const [data, setData] = useState<ReqResp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        modo, anio: String(anio), vista, tipo,
      });
      if (modo === "mes") params.set("mes", String(mes));
      if (modo === "sem") params.set("sem", String(sem));
      const res = await fetch(`/api/dashboard/logistica/requerimientos?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [modo, anio, mes, sem, vista, tipo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const porMesData = useMemo(
    () => (data?.porMes ?? []).map((v, i) => ({ name: MES_LABELS[i], value: v })),
    [data?.porMes],
  );
  const porOtData = useMemo(
    () => (data?.porOt ?? []).map((v, i) => ({ name: OT_LABELS[i], value: v })),
    [data?.porOt],
  );
  const porTiempoData = useMemo(
    () => (data?.porTiempo ?? []).map((v, i) => ({ name: TIEMPO_LABELS[i], value: v })),
    [data?.porTiempo],
  );

  // Colores degradados para el chart "por OT" (mejor → peor) y "por tiempo"
  const COLORS_DEGRADADOS = ["#1D9E75", "#97C459", "#EF9F27", "#E24B4A", "#791F1F"];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`, flexWrap: "wrap",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#E7E9F2",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FileTextOutlined style={{ fontSize: 17, color: brand.navy }} />
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            Ciclo de compras
          </div>
          <Title level={5} style={{ margin: 0 }}>Requerimientos</Title>
        </div>
        <Space style={{ marginLeft: "auto" }} size={10} wrap>
          <Segmented
            size="small"
            value={vista}
            onChange={(v) => setVista(v as "gen" | "item")}
            options={[
              { value: "gen", label: "General" },
              { value: "item", label: "Ítem" },
            ]}
          />
          <Segmented
            size="small"
            value={tipo}
            onChange={(v) => setTipo(v as "all" | "rep" | "serv")}
            options={[
              { value: "all", label: "Todos" },
              { value: "rep", label: "Repuestos" },
              { value: "serv", label: "Servicios" },
            ]}
          />
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          {/* KPIs */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={8}>
              <Card>
                <Statistic
                  title={data.kpis.l1Label}
                  value={data.kpis.emitidos}
                  prefix={<FileTextOutlined style={{ color: brand.navy }} />}
                  styles={{ content: { color: brand.navy, fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card>
                <Statistic
                  title="Aprobados"
                  value={data.kpis.aprobados}
                  prefix={<CheckCircleOutlined style={{ color: "#1D9E75" }} />}
                  styles={{ content: { color: "#1D9E75", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card>
                <Statistic
                  title="En proceso"
                  value={data.kpis.enProceso}
                  prefix={<ClockCircleOutlined style={{ color: "#EF9F27" }} />}
                  styles={{ content: { color: "#EF9F27", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
          </Row>

          {/* Charts */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Card title="Emitidos por mes" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" fill={brand.navy} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Emitidos por semana (mes seleccionado)" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  {(data.porSemana?.length ?? 0) === 0 ? (
                    <Empty description="Cambiá a modo Mes para ver el detalle semanal" />
                  ) : (
                    <ResponsiveContainer>
                      <BarChart data={data.porSemana}>
                        <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ReTooltip />
                        <Bar dataKey="value" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Reqs/Ítems por OT" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porOtData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {porOtData.map((_, i) => (
                          <Cell key={i} fill={COLORS_DEGRADADOS[i] ?? brand.navy} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Tiempo de aprobación" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porTiempoData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {porTiempoData.map((_, i) => (
                          <Cell key={i} fill={COLORS_DEGRADADOS[i] ?? brand.navy} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección: Orden de compra (OC)
//
// Fetch a /api/dashboard/logistica/oc con los filtros del header + toggle de
// tipo (Todos/Repuestos/Servicios).
//
// Renderiza: 3 KPIs (colocadas/costo/ticket) + barra apilada de estado +
// top 5 proveedores + 3 charts (cantidad mes, costo mes, tiempo) + tiempo
// promedio para colocar OC.
// ───────────────────────────────────────────────────────────────────────────
interface OCResp {
  kpis: { colocadas: number; costoTotal: number; ticketPromedio: number; moneda: string };
  estado: { recibidas: number; enProceso: number; pendientes: number; anuladas: number };
  topProveedores: { nombre: string; monto: number }[];
  porMesCantidad: number[];
  porMesCosto: number[];
  porTiempo: number[];
  tiempoPromedio: number;
}

const TIEMPO_OC_LABELS = ["Mismo día", "1-2d", "3-5d", "6-10d", "+10d"];

function fmtMoneda(n: number, moneda: string): string {
  const simbolo = moneda === "SOL" || moneda === "PEN" ? "S/" : "$";
  return `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function SeccionOC({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [tipo, setTipo] = useState<"all" | "rep" | "serv">("all");
  const [data, setData] = useState<OCResp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ modo, anio: String(anio), tipo });
      if (modo === "mes") params.set("mes", String(mes));
      if (modo === "sem") params.set("sem", String(sem));
      const res = await fetch(`/api/dashboard/logistica/oc?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [modo, anio, mes, sem, tipo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const porMesCantData = useMemo(
    () => (data?.porMesCantidad ?? []).map((v, i) => ({ name: MES_LABELS[i], value: v })),
    [data?.porMesCantidad],
  );
  const porMesCostoData = useMemo(
    () => (data?.porMesCosto ?? []).map((v, i) => ({ name: MES_LABELS[i], value: v })),
    [data?.porMesCosto],
  );
  const porTiempoData = useMemo(
    () => (data?.porTiempo ?? []).map((v, i) => ({ name: TIEMPO_OC_LABELS[i], value: v })),
    [data?.porTiempo],
  );

  const COLORS_TIEMPO = ["#1D9E75", "#97C459", "#EF9F27", "#E24B4A", "#791F1F"];
  const estadoTotal = data ? (data.estado.recibidas + data.estado.enProceso + data.estado.pendientes + data.estado.anuladas) : 0;
  const maxProv = data && data.topProveedores.length > 0 ? data.topProveedores[0].monto : 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`, flexWrap: "wrap",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#EEEDFE",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ShoppingCartOutlined style={{ fontSize: 17, color: "#3C3489" }} />
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            Ciclo de compras
          </div>
          <Title level={5} style={{ margin: 0 }}>Orden de compra</Title>
        </div>
        <Segmented
          size="small"
          value={tipo}
          onChange={(v) => setTipo(v as "all" | "rep" | "serv")}
          options={[
            { value: "all", label: "Todos" },
            { value: "rep", label: "Repuestos" },
            { value: "serv", label: "Servicios" },
          ]}
          style={{ marginLeft: "auto" }}
        />
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          {/* KPIs + Estado */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="OCs colocadas"
                  value={data.kpis.colocadas}
                  prefix={<ShoppingCartOutlined style={{ color: "#3C3489" }} />}
                  styles={{ content: { color: "#3C3489", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="Costo total"
                  value={data.kpis.costoTotal}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: brand.navy, fontSize: 20, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="Ticket promedio"
                  value={data.kpis.ticketPromedio}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: brand.textSecondary, fontSize: 18, fontWeight: 500 } }}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Tiempo prom. para colocar OC"
                  value={data.tiempoPromedio}
                  precision={1}
                  suffix="d"
                  prefix={<ClockCircleOutlined style={{ color: "#1D9E75" }} />}
                  styles={{ content: { color: "#1D9E75", fontSize: 20, fontWeight: 600 } }}
                />
              </Card>
            </Col>
          </Row>

          {/* Barra apilada de estado + Top proveedores */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <Card title="Estado de las OC" size="small">
                {estadoTotal === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin OCs en el rango" />
                ) : (
                  <>
                    <Space size={14} style={{ marginBottom: 8 }} wrap>
                      <span style={{ fontSize: 12 }}><span style={{ display: "inline-block", width: 10, height: 10, background: "#1D9E75", borderRadius: 2, marginRight: 4 }} />Recibidas: <b>{data.estado.recibidas}</b></span>
                      <span style={{ fontSize: 12 }}><span style={{ display: "inline-block", width: 10, height: 10, background: brand.navy, borderRadius: 2, marginRight: 4 }} />En proceso: <b>{data.estado.enProceso}</b></span>
                      <span style={{ fontSize: 12 }}><span style={{ display: "inline-block", width: 10, height: 10, background: "#EF9F27", borderRadius: 2, marginRight: 4 }} />Pendientes: <b>{data.estado.pendientes}</b></span>
                      <span style={{ fontSize: 12 }}><span style={{ display: "inline-block", width: 10, height: 10, background: "#E24B4A", borderRadius: 2, marginRight: 4 }} />Anuladas: <b>{data.estado.anuladas}</b></span>
                    </Space>
                    <div style={{ display: "flex", height: 34, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ background: "#1D9E75", width: `${(data.estado.recibidas / estadoTotal) * 100}%`, display: "flex", alignItems: "center", justifyContent: "center", color: "#04342C", fontSize: 12, fontWeight: 600 }}>{data.estado.recibidas || ""}</div>
                      <div style={{ background: brand.navy, width: `${(data.estado.enProceso / estadoTotal) * 100}%`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600 }}>{data.estado.enProceso || ""}</div>
                      <div style={{ background: "#EF9F27", width: `${(data.estado.pendientes / estadoTotal) * 100}%`, display: "flex", alignItems: "center", justifyContent: "center", color: "#412402", fontSize: 12, fontWeight: 600 }}>{data.estado.pendientes || ""}</div>
                      <div style={{ background: "#E24B4A", width: `${(data.estado.anuladas / estadoTotal) * 100}%`, display: "flex", alignItems: "center", justifyContent: "center", color: "#501313", fontSize: 12, fontWeight: 600 }}>{data.estado.anuladas || ""}</div>
                    </div>
                  </>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Top 5 proveedores por monto" size="small">
                {data.topProveedores.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  <div>
                    {data.topProveedores.map((p, i) => (
                      <div key={p.nombre} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 0", borderBottom: i < data.topProveedores.length - 1 ? `1px solid ${brand.border}` : "none",
                      }}>
                        <div style={{
                          width: 21, height: 21, borderRadius: 6, background: "#DCF0F5", color: "#0090B4",
                          fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, fontSize: 12 }}>{p.nombre}</div>
                        <div style={{ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ background: "#0090B4", height: "100%", width: `${maxProv > 0 ? (p.monto / maxProv) * 100 : 0}%` }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, minWidth: 90, textAlign: "right" }}>
                          {fmtMoneda(p.monto, data.kpis.moneda)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* Charts mensuales + tiempo */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Card title="OC colocadas por mes · cantidad" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesCantData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" fill="#3C3489" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title={`OC colocadas por mes · costo (${data.kpis.moneda})`} size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesCostoData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <ReTooltip formatter={(v) => fmtMoneda(Number(v), data.kpis.moneda)} />
                      <Bar dataKey="value" fill="#EF9F27" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card title="Tiempo para colocar OC" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porTiempoData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {porTiempoData.map((_, i) => (
                          <Cell key={i} fill={COLORS_TIEMPO[i] ?? brand.navy} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección: Inventario
//
// Fetch a /api/dashboard/logistica/inventario con los filtros del header +
// dos toggles propios:
//   - cat: "all" / "cat" / "nocat"
//   - unidad: "np" / "cant"
//
// Renderiza: 4 KPIs (stock, valorización, ingresos, salidas) + chart de
// valorización/ingresos/salidas por mes + top 10 productos más movidos.
// ───────────────────────────────────────────────────────────────────────────
interface InvResp {
  kpis: {
    stock: number; valorizacion: number; ingresos: number; ingresosQ: number;
    salidas: number; salidasQ: number; moneda: string;
  };
  porMesValorizacion: number[];
  porMesIngresos: number[];
  porMesSalidas: number[];
  topProductos: { codigo: string; np: string | null; descripcion: string; salidaQ: number; salidaMonto: number }[];
}

function SeccionInventario({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [catFilter, setCatFilter] = useState<"all" | "cat" | "nocat">("all");
  const [unidad, setUnidad] = useState<"np" | "cant">("np");
  const [data, setData] = useState<InvResp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        modo, anio: String(anio), cat: catFilter, unidad,
      });
      if (modo === "mes") params.set("mes", String(mes));
      if (modo === "sem") params.set("sem", String(sem));
      const res = await fetch(`/api/dashboard/logistica/inventario?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [modo, anio, mes, sem, catFilter, unidad]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const porMesData = useMemo(() => {
    if (!data) return [];
    return MES_LABELS.map((name, i) => ({
      name,
      valorizacion: data.porMesValorizacion[i] ?? 0,
      ingresos: data.porMesIngresos[i] ?? 0,
      salidas: data.porMesSalidas[i] ?? 0,
    }));
  }, [data]);

  const topData = useMemo(() => {
    if (!data) return [];
    return data.topProductos.map((p) => ({
      name: p.codigo,
      codigo: p.codigo,
      np: p.np,
      descripcion: p.descripcion,
      monto: p.salidaMonto,
      value: p.salidaQ,
    }));
  }, [data]);

  const unidadLbl = unidad === "np" ? "(NP únicos)" : "(cantidad)";

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`, flexWrap: "wrap",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#EAF3DE",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <InboxOutlined style={{ fontSize: 17, color: "#3B6D11" }} />
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            Almacén
          </div>
          <Title level={5} style={{ margin: 0 }}>Inventario</Title>
        </div>
        <Space style={{ marginLeft: "auto" }} size={10} wrap>
          <Segmented
            size="small"
            value={catFilter}
            onChange={(v) => setCatFilter(v as "all" | "cat" | "nocat")}
            options={[
              { value: "all", label: "Todos" },
              { value: "cat", label: "Catalogados" },
              { value: "nocat", label: "No catalogados" },
            ]}
          />
          <Segmented
            size="small"
            value={unidad}
            onChange={(v) => setUnidad(v as "np" | "cant")}
            options={[
              { value: "np", label: "NP" },
              { value: "cant", label: "Cantidad" },
            ]}
          />
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title={`Stock actual ${unidadLbl}`}
                  value={data.kpis.stock}
                  prefix={<InboxOutlined style={{ color: "#3B6D11" }} />}
                  styles={{ content: { color: "#3B6D11", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="Valorización actual"
                  value={data.kpis.valorizacion}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: brand.navy, fontSize: 20, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title={`Ingresos ${unidadLbl}`}
                  value={data.kpis.ingresos}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#1D9E75", fontSize: 18, fontWeight: 600 } }}
                />
                {data.kpis.ingresosQ > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {data.kpis.ingresosQ} {unidad === "np" ? "NP" : "piezas"}
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title={`Salidas ${unidadLbl}`}
                  value={data.kpis.salidas}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#854F0B", fontSize: 18, fontWeight: 600 } }}
                />
                {data.kpis.salidasQ > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {data.kpis.salidasQ} {unidad === "np" ? "NP" : "piezas"}
                  </Text>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space size={12}>
                    <span>Valorización y movimientos por mes</span>
                    <Space size={8} style={{ fontSize: 11, color: brand.textSecondary, fontWeight: 400 }}>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#97C459", borderRadius: 2, marginRight: 4 }} />Valoriz.</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#1D9E75", borderRadius: 2, marginRight: 4 }} />Ingresos</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#E24B4A", borderRadius: 2, marginRight: 4 }} />Salidas</span>
                    </Space>
                  </Space>
                }
                size="small"
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <ReTooltip formatter={(v) => fmtMoneda(Number(v), data.kpis.moneda)} />
                      <Bar dataKey="valorizacion" fill="#97C459" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ingresos" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="salidas" fill="#E24B4A" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                title="Top 10 productos más movidos · salidas"
                size="small"
                styles={{ body: { padding: 12 } }}
              >
                {topData.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin salidas en el rango" />
                ) : (
                  <>
                    <div style={{ width: "100%", height: 240 }}>
                      <ResponsiveContainer>
                        <BarChart data={topData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke="rgba(0,0,0,0.07)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                          <ReTooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0].payload as {
                                codigo: string; np: string | null; descripcion: string;
                                value: number; monto: number;
                              };
                              return (
                                <div style={{
                                  background: "#fff", border: `1px solid ${brand.border}`,
                                  borderRadius: 6, padding: "8px 10px", maxWidth: 280,
                                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                }}>
                                  <div style={{ fontWeight: 600, fontSize: 12, color: brand.navy }}>
                                    {p.codigo}
                                  </div>
                                  {p.np && (
                                    <div style={{ fontSize: 11, color: brand.textSecondary, marginTop: 2 }}>
                                      <strong>NP:</strong> {p.np}
                                    </div>
                                  )}
                                  {p.descripcion && (
                                    <div style={{ fontSize: 11, color: brand.textPrimary, marginTop: 2, whiteSpace: "normal" }}>
                                      {p.descripcion}
                                    </div>
                                  )}
                                  <div style={{ fontSize: 11, color: "#0090B4", marginTop: 4, fontWeight: 600 }}>
                                    Salidas: {p.value}
                                    {p.monto > 0 && (
                                      <span style={{ color: brand.textSecondary, fontWeight: 400, marginLeft: 6 }}>
                                        ({fmtMoneda(p.monto, data.kpis.moneda)})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="value" fill="#0090B4" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{
                      marginTop: 8, borderTop: `1px solid ${brand.border}`, paddingTop: 8,
                      maxHeight: 140, overflowY: "auto",
                    }}>
                      {topData.map((p) => (
                        <div key={p.codigo} style={{
                          display: "flex", gap: 8, alignItems: "baseline",
                          fontSize: 11, padding: "3px 0",
                          borderBottom: `1px dashed ${brand.border}`,
                        }}>
                          <span style={{ fontWeight: 600, color: brand.navy, minWidth: 68 }}>{p.codigo}</span>
                          {p.np && (
                            <span style={{ color: brand.textSecondary, minWidth: 90 }}>
                              <strong>NP:</strong> {p.np}
                            </span>
                          )}
                          <span style={{ color: brand.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={p.descripcion}
                          >
                            {p.descripcion || "—"}
                          </span>
                          <span style={{ color: "#0090B4", fontWeight: 600 }}>{p.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección: Órdenes de trabajo (OT)
// ───────────────────────────────────────────────────────────────────────────
interface OTResp {
  estadoAlmacen: { completas: number; incompletas: number };
  tiempoAlmacen: number[];
  avanceMes: { entregadasArmado: number; despachadas: number; facturadas: number };
}

const TIEMPO_ALMACEN_LABELS = ["1-3d", "4-7d", "8-14d", "15-30d", "+30d"];

function SeccionOT({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [data, setData] = useState<OTResp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ modo, anio: String(anio) });
      if (modo === "mes") params.set("mes", String(mes));
      if (modo === "sem") params.set("sem", String(sem));
      const res = await fetch(`/api/dashboard/logistica/ot?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [modo, anio, mes, sem]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tiempoData = useMemo(
    () => (data?.tiempoAlmacen ?? []).map((v, i) => ({ name: TIEMPO_ALMACEN_LABELS[i], value: v })),
    [data?.tiempoAlmacen],
  );
  const avanceData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Entregadas armado", value: data.avanceMes.entregadasArmado },
      { name: "Despachadas", value: data.avanceMes.despachadas },
      { name: "Facturadas", value: data.avanceMes.facturadas },
    ];
  }, [data]);
  const estadoData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Completas", value: data.estadoAlmacen.completas },
      { name: "Incompletas", value: data.estadoAlmacen.incompletas },
    ];
  }, [data]);

  const COLORS_TIEMPO_ALM = ["#1D9E75", "#97C459", "#EF9F27", "#E24B4A", "#791F1F"];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#FAEEDA",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ToolOutlined style={{ fontSize: 17, color: "#854F0B" }} />
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            Logística
          </div>
          <Title level={5} style={{ margin: 0 }}>Órdenes de trabajo</Title>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card
              title={`OT abiertas · estado almacén (${data.estadoAlmacen.completas + data.estadoAlmacen.incompletas})`}
              size="small"
              styles={{ body: { padding: 12 } }}
            >
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={estadoData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill="#1D9E75" />
                      <Cell fill="#EF9F27" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="OT despachadas · tiempo en almacén" size="small" styles={{ body: { padding: 12 } }}>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={tiempoData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {tiempoData.map((_, i) => (
                        <Cell key={i} fill={COLORS_TIEMPO_ALM[i] ?? brand.navy} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card title="Avance del rango (hitos)" size="small" styles={{ body: { padding: 12 } }}>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={avanceData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ReTooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill="#3C3489" />
                      <Cell fill="#0090B4" />
                      <Cell fill="#1D9E75" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sección: Facturación
// ───────────────────────────────────────────────────────────────────────────
interface FactResp {
  kpis: { total: number; rep: number; bien: number; serv: number; moneda: string; repPct: number; bienPct: number; servPct: number };
  porMes: { rep: number[]; bien: number[]; serv: number[] };
}

function SeccionFacturacion({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [tipo, setTipo] = useState<"all" | "rep" | "bien" | "serv">("all");
  const [data, setData] = useState<FactResp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ modo, anio: String(anio), tipo });
      if (modo === "mes") params.set("mes", String(mes));
      if (modo === "sem") params.set("sem", String(sem));
      const res = await fetch(`/api/dashboard/logistica/facturacion?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [modo, anio, mes, sem, tipo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const porMesData = useMemo(() => {
    if (!data) return [];
    return MES_LABELS.map((name, i) => ({
      name,
      rep: data.porMes.rep[i] ?? 0,
      bien: data.porMes.bien[i] ?? 0,
      serv: data.porMes.serv[i] ?? 0,
    }));
  }, [data]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        marginBottom: 12, paddingBottom: 8,
        borderBottom: `1px solid ${brand.border}`, flexWrap: "wrap",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: "#FCEBEB",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <DollarOutlined style={{ fontSize: 17, color: "#A32D2D" }} />
        </div>
        <div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: brand.textSecondary,
          }}>
            Ciclo de compras
          </div>
          <Title level={5} style={{ margin: 0 }}>Facturación</Title>
        </div>
        <Segmented
          size="small"
          value={tipo}
          onChange={(v) => setTipo(v as "all" | "rep" | "bien" | "serv")}
          options={[
            { value: "all", label: "Todas" },
            { value: "rep", label: "Reparación" },
            { value: "bien", label: "Bien" },
            { value: "serv", label: "Servicio" },
          ]}
          style={{ marginLeft: "auto" }}
        />
      </div>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Facturación del rango (sin IGV)"
                  value={data.kpis.total}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#A32D2D", fontSize: 20, fontWeight: 700 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="OT Reparación"
                  value={data.kpis.rep}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#185FA5", fontSize: 18, fontWeight: 600 } }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>Participación: {data.kpis.repPct.toFixed(0)}%</Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="OT Bien"
                  value={data.kpis.bien}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#0F6E56", fontSize: 18, fontWeight: 600 } }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>Participación: {data.kpis.bienPct.toFixed(0)}%</Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Statistic
                  title="OT Servicio"
                  value={data.kpis.serv}
                  precision={0}
                  prefix={data.kpis.moneda === "SOL" || data.kpis.moneda === "PEN" ? "S/" : "$"}
                  styles={{ content: { color: "#854F0B", fontSize: 18, fontWeight: 600 } }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>Participación: {data.kpis.servPct.toFixed(0)}%</Text>
              </Card>
            </Col>
          </Row>

          <Card title="Facturación mensual · sin IGV" size="small" styles={{ body: { padding: 12 } }}>
            <Space size={14} style={{ marginBottom: 6, fontSize: 12, color: brand.textSecondary }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#185FA5", borderRadius: 2, marginRight: 4 }} />Reparación</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0F6E56", borderRadius: 2, marginRight: 4 }} />Bien</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#854F0B", borderRadius: 2, marginRight: 4 }} />Servicio</span>
            </Space>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={porMesData}>
                  <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <ReTooltip formatter={(v) => fmtMoneda(Number(v), data.kpis.moneda)} />
                  <Bar dataKey="rep" stackId="a" fill="#185FA5" />
                  <Bar dataKey="bien" stackId="a" fill="#0F6E56" />
                  <Bar dataKey="serv" stackId="a" fill="#854F0B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

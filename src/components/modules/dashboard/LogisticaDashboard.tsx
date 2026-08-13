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
  tiempoAprobacionPromedio: number;
  tiempoAprobacionMediana: number;
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
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
                        <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
              <Card title={vista === "gen" ? "Requerimientos por OT" : "Ítems por OT"} size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porOtData}>
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
              <Card
                title="Tiempo de aprobación"
                extra={(data.tiempoAprobacionPromedio ?? 0) > 0 && (
                  <Text style={{ fontSize: 12, color: "#1D9E75", fontWeight: 600 }}>
                    <ClockCircleOutlined /> Prom: {data.tiempoAprobacionPromedio.toFixed(1)} d · Med: {(data.tiempoAprobacionMediana ?? 0).toFixed(0)} d
                  </Text>
                )}
                size="small"
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porTiempoData}>
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
// Montos separados por moneda — la API nunca suma USD con soles.
type MontoDualT = { usd: number; sol: number };
type MonedaSel = "usd" | "sol";

interface OCResp {
  kpis: { colocadas: number; costo: MontoDualT; ticket: MontoDualT };
  estado: { recibidas: number; enProceso: number; pendientes: number; anuladas: number };
  topProveedores: { nombre: string; usd: number; sol: number }[];
  porMesCantidad: number[];
  porMesCosto: { usd: number[]; sol: number[] };
  porTiempo: number[];
  tiempoPromedio: number;
  tiempoMediana: number;
}

const TIEMPO_OC_LABELS = ["Mismo día", "1-2d", "3-5d", "6-10d", "+10d"];

function fmtMoneda(n: number, moneda: string): string {
  const simbolo = moneda === "SOL" || moneda === "PEN" || moneda === "sol" ? "S/" : "$";
  return `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Opciones del toggle de moneda que llevan las secciones con montos.
const MONEDA_OPTS = [
  { value: "usd", label: "$ USD" },
  { value: "sol", label: "S/ Soles" },
];

// Muestra un monto en cada moneda, en líneas separadas (nunca sumados).
// Si una moneda está en cero se omite su línea — salvo que ambas estén en
// cero, en cuyo caso se muestra "$ 0" para no dejar la card vacía.
function MontoDual({ usd, sol, color, fontSize = 20 }: {
  usd: number; sol: number; color: string; fontSize?: number;
}) {
  const ambasCero = usd === 0 && sol === 0;
  return (
    <div style={{ marginTop: 4 }}>
      {(usd !== 0 || ambasCero) && (
        <div style={{ color, fontSize, fontWeight: 600, lineHeight: 1.3 }}>
          {fmtMoneda(usd, "usd")}
        </div>
      )}
      {sol !== 0 && (
        <div style={{ color, fontSize: usd !== 0 ? fontSize - 4 : fontSize, fontWeight: 600, lineHeight: 1.3 }}>
          {fmtMoneda(sol, "sol")}
        </div>
      )}
    </div>
  );
}

function SeccionOC({
  modo, anio, mes, sem,
}: {
  modo: Modo; anio: number; mes: number; sem: number;
}) {
  const [tipo, setTipo] = useState<"all" | "rep" | "serv">("all");
  const [monedaSel, setMonedaSel] = useState<MonedaSel>("usd");
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
  // Costo mensual con ambas monedas lado a lado (barras agrupadas) — los
  // soles siempre visibles sin depender del toggle.
  const porMesCostoData = useMemo(
    () => MES_LABELS.map((name, i) => ({
      name,
      usd: data?.porMesCosto?.usd?.[i] ?? 0,
      sol: data?.porMesCosto?.sol?.[i] ?? 0,
    })),
    [data?.porMesCosto],
  );
  const porTiempoData = useMemo(
    () => (data?.porTiempo ?? []).map((v, i) => ({ name: TIEMPO_OC_LABELS[i], value: v })),
    [data?.porTiempo],
  );

  // Ranking de proveedores en la moneda elegida — no se comparan monedas.
  const topProv = useMemo(() => {
    const arr = (data?.topProveedores ?? []).filter((p) => p[monedaSel] > 0);
    arr.sort((a, b) => b[monedaSel] - a[monedaSel]);
    return arr.slice(0, 5);
  }, [data?.topProveedores, monedaSel]);

  const COLORS_TIEMPO = ["#1D9E75", "#97C459", "#EF9F27", "#E24B4A", "#791F1F"];
  const estadoTotal = data ? (data.estado.recibidas + data.estado.enProceso + data.estado.pendientes + data.estado.anuladas) : 0;
  const maxProv = topProv.length > 0 ? topProv[0][monedaSel] : 0;

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
        <Space style={{ marginLeft: "auto" }} size={10} wrap>
          <Segmented
            size="small"
            value={monedaSel}
            onChange={(v) => setMonedaSel(v as MonedaSel)}
            options={MONEDA_OPTS}
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
                <Text type="secondary" style={{ fontSize: 14 }}>Costo total (sin anuladas)</Text>
                <MontoDual usd={data.kpis.costo.usd} sol={data.kpis.costo.sol} color={brand.navy} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>Ticket promedio</Text>
                <MontoDual usd={data.kpis.ticket.usd} sol={data.kpis.ticket.sol} color={brand.textSecondary} fontSize={18} />
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
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Mediana: {(data.tiempoMediana ?? 0).toFixed(0)} d
                </Text>
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
              <Card title={`Top 5 proveedores por monto (${monedaSel === "usd" ? "USD" : "S/"})`} size="small">
                {topProv.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Sin OCs en ${monedaSel === "usd" ? "dólares" : "soles"} en el rango`} />
                ) : (
                  <div>
                    {topProv.map((p, i) => {
                      const otro = monedaSel === "usd" ? p.sol : p.usd;
                      return (
                        <div key={p.nombre} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "7px 0", borderBottom: i < topProv.length - 1 ? `1px solid ${brand.border}` : "none",
                        }}>
                          <div style={{
                            width: 21, height: 21, borderRadius: 6, background: "#DCF0F5", color: "#0090B4",
                            fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, fontSize: 12 }}>{p.nombre}</div>
                          <div style={{ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ background: "#0090B4", height: "100%", width: `${maxProv > 0 ? (p[monedaSel] / maxProv) * 100 : 0}%` }} />
                          </div>
                          <div style={{ minWidth: 90, textAlign: "right" }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtMoneda(p[monedaSel], monedaSel)}</div>
                            {otro > 0 && (
                              <div style={{ fontSize: 10, color: brand.textSecondary }}>
                                + {fmtMoneda(otro, monedaSel === "usd" ? "sol" : "usd")}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
              <Card
                title="OC colocadas por mes · costo"
                extra={
                  <Space size={8} style={{ fontSize: 11, color: brand.textSecondary }}>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#EF9F27", borderRadius: 2, marginRight: 4 }} />$ USD</span>
                    <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0090B4", borderRadius: 2, marginRight: 4 }} />S/ Soles</span>
                  </Space>
                }
                size="small"
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesCostoData}>
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <ReTooltip formatter={(v, name) => [fmtMoneda(Number(v), name === "S/ Soles" ? "sol" : "usd"), String(name)]} />
                      <Bar dataKey="usd" name="$ USD" fill="#EF9F27" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sol" name="S/ Soles" fill="#0090B4" radius={[4, 4, 0, 0]} />
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
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
    stock: number; valorizacion: MontoDualT; ingresos: MontoDualT; ingresosQ: number;
    salidas: MontoDualT; salidasQ: number;
  };
  porMesIngresos: { usd: number[]; sol: number[] };
  porMesSalidas: { usd: number[]; sol: number[] };
  topProductos: { codigo: string; np: string | null; descripcion: string; salidaQ: number; salidaMonto: number; moneda: string }[];
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

  // Ingresos y salidas por mes, cada moneda como barra propia (sin sumar).
  // La "valorización mensual" se quitó del chart: era el valor de HOY
  // repetido plano en cada mes (no hay snapshots históricos) — aparentaba
  // una serie histórica que no existe. La valorización real queda como KPI.
  const porMesData = useMemo(() => {
    if (!data) return [];
    return MES_LABELS.map((name, i) => ({
      name,
      ing_usd: data.porMesIngresos.usd?.[i] ?? 0,
      ing_sol: data.porMesIngresos.sol?.[i] ?? 0,
      sal_usd: data.porMesSalidas.usd?.[i] ?? 0,
      sal_sol: data.porMesSalidas.sol?.[i] ?? 0,
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
      moneda: p.moneda,
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
                <Text type="secondary" style={{ fontSize: 14 }}>Valorización actual</Text>
                <MontoDual usd={data.kpis.valorizacion.usd} sol={data.kpis.valorizacion.sol} color={brand.navy} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>{`Ingresos ${unidadLbl}`}</Text>
                <MontoDual usd={data.kpis.ingresos.usd} sol={data.kpis.ingresos.sol} color="#1D9E75" fontSize={18} />
                {data.kpis.ingresosQ > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {data.kpis.ingresosQ} {unidad === "np" ? "NP" : "piezas"}
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>{`Salidas ${unidadLbl}`}</Text>
                <MontoDual usd={data.kpis.salidas.usd} sol={data.kpis.salidas.sol} color="#854F0B" fontSize={18} />
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
                    <span>Ingresos y salidas por mes</span>
                    <Space size={8} style={{ fontSize: 11, color: brand.textSecondary, fontWeight: 400 }}>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#1D9E75", borderRadius: 2, marginRight: 4 }} />Ing. $</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#8FD4BD", borderRadius: 2, marginRight: 4 }} />Ing. S/</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#E24B4A", borderRadius: 2, marginRight: 4 }} />Sal. $</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#F2A6A5", borderRadius: 2, marginRight: 4 }} />Sal. S/</span>
                    </Space>
                  </Space>
                }
                size="small"
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={porMesData}>
                      <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <ReTooltip formatter={(v, name) => [fmtMoneda(Number(v), String(name).includes("S/") ? "sol" : "usd"), String(name)]} />
                      <Bar dataKey="ing_usd" name="Ingresos $" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="ing_sol" name="Ingresos S/" fill="#8FD4BD" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sal_usd" name="Salidas $" fill="#E24B4A" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="sal_sol" name="Salidas S/" fill="#F2A6A5" radius={[4, 4, 0, 0]} />
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
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer>
                      <BarChart data={topData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid stroke="var(--erp-chart-grid)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <ReTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as {
                              codigo: string; np: string | null; descripcion: string;
                              value: number; monto: number; moneda: string;
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
                                      ({fmtMoneda(p.monto, p.moneda)})
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
  tiempoAlmacenPromedio: number;
  tiempoAlmacenMediana: number;
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
                    <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
            <Card
              title="OT despachadas · tiempo en almacén"
              extra={(data.tiempoAlmacenPromedio ?? 0) > 0 && (
                <Text style={{ fontSize: 12, color: "#1D9E75", fontWeight: 600 }}>
                  <ClockCircleOutlined /> Prom: {data.tiempoAlmacenPromedio.toFixed(1)} d · Med: {(data.tiempoAlmacenMediana ?? 0).toFixed(0)} d
                </Text>
              )}
              size="small"
              styles={{ body: { padding: 12 } }}
            >
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={tiempoData}>
                    <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
                    <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
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
type FactKpisMoneda = {
  total: number; rep: number; bien: number; serv: number;
  repPct: number; bienPct: number; servPct: number;
};
interface FactResp {
  kpis: { usd: FactKpisMoneda; sol: FactKpisMoneda };
  porMes: {
    usd: { rep: number[]; bien: number[]; serv: number[] };
    sol: { rep: number[]; bien: number[]; serv: number[] };
  };
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

  // Dos pilas por mes (una por moneda), cada una apilada por tipo de OT.
  // Los montos de monedas distintas nunca se suman ni se apilan juntos.
  const porMesData = useMemo(() => {
    if (!data) return [];
    return MES_LABELS.map((name, i) => ({
      name,
      usd_rep: data.porMes.usd?.rep[i] ?? 0,
      usd_bien: data.porMes.usd?.bien[i] ?? 0,
      usd_serv: data.porMes.usd?.serv[i] ?? 0,
      sol_rep: data.porMes.sol?.rep[i] ?? 0,
      sol_bien: data.porMes.sol?.bien[i] ?? 0,
      sol_serv: data.porMes.sol?.serv[i] ?? 0,
    }));
  }, [data]);

  // Participación por tipo, calculada dentro de cada moneda por separado.
  const partLinea = (usdPct: number, solPct: number) => {
    const partes: string[] = [];
    if ((data?.kpis.usd.total ?? 0) > 0) partes.push(`${usdPct.toFixed(0)}% $`);
    if ((data?.kpis.sol.total ?? 0) > 0) partes.push(`${solPct.toFixed(0)}% S/`);
    return partes.length > 0 ? partes.join(" · ") : "—";
  };

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
                <Text type="secondary" style={{ fontSize: 14 }}>Facturación del rango (sin IGV)</Text>
                <MontoDual usd={data.kpis.usd.total} sol={data.kpis.sol.total} color="#A32D2D" />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>OT Reparación</Text>
                <MontoDual usd={data.kpis.usd.rep} sol={data.kpis.sol.rep} color="#185FA5" fontSize={18} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Participación: {partLinea(data.kpis.usd.repPct, data.kpis.sol.repPct)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>OT Bien</Text>
                <MontoDual usd={data.kpis.usd.bien} sol={data.kpis.sol.bien} color="#0F6E56" fontSize={18} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Participación: {partLinea(data.kpis.usd.bienPct, data.kpis.sol.bienPct)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card>
                <Text type="secondary" style={{ fontSize: 14 }}>OT Servicio</Text>
                <MontoDual usd={data.kpis.usd.serv} sol={data.kpis.sol.serv} color="#854F0B" fontSize={18} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Participación: {partLinea(data.kpis.usd.servPct, data.kpis.sol.servPct)}
                </Text>
              </Card>
            </Col>
          </Row>

          <Card title="Facturación mensual · sin IGV (pila izquierda $, derecha S/)" size="small" styles={{ body: { padding: 12 } }}>
            <Space size={14} style={{ marginBottom: 6, fontSize: 12, color: brand.textSecondary }} wrap>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#185FA5", borderRadius: 2, marginRight: 4 }} />Reparación $</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#0F6E56", borderRadius: 2, marginRight: 4 }} />Bien $</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#854F0B", borderRadius: 2, marginRight: 4 }} />Servicio $</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#8FB8DD", borderRadius: 2, marginRight: 4 }} />Reparación S/</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#7FC4B2", borderRadius: 2, marginRight: 4 }} />Bien S/</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#D8A76A", borderRadius: 2, marginRight: 4 }} />Servicio S/</span>
            </Space>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={porMesData}>
                  <CartesianGrid stroke="var(--erp-chart-grid)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <ReTooltip formatter={(v, name) => [fmtMoneda(Number(v), String(name).includes("S/") ? "sol" : "usd"), String(name)]} />
                  <Bar dataKey="usd_rep" name="Reparación $" stackId="usd" fill="#185FA5" />
                  <Bar dataKey="usd_bien" name="Bien $" stackId="usd" fill="#0F6E56" />
                  <Bar dataKey="usd_serv" name="Servicio $" stackId="usd" fill="#854F0B" />
                  <Bar dataKey="sol_rep" name="Reparación S/" stackId="sol" fill="#8FB8DD" />
                  <Bar dataKey="sol_bien" name="Bien S/" stackId="sol" fill="#7FC4B2" />
                  <Bar dataKey="sol_serv" name="Servicio S/" stackId="sol" fill="#D8A76A" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

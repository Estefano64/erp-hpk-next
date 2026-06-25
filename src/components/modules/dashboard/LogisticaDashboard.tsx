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
          <SeccionPlaceholder
            icon={<InboxOutlined style={{ fontSize: 17, color: "#3B6D11" }} />}
            iconBg="#EAF3DE"
            label="Almacén"
            titulo="Inventario"
            descripcion="Stock / valorización / ingresos / salidas + 2 gráficos (valorización mensual + top productos movidos)"
          />
        </Col>
        <Col span={24}>
          <SeccionPlaceholder
            icon={<ToolOutlined style={{ fontSize: 17, color: "#854F0B" }} />}
            iconBg="#FAEEDA"
            label="Logística"
            titulo="Órdenes de trabajo"
            descripcion="OT abiertas (estado almacén) + tiempo en almacén + avance del mes"
          />
        </Col>
        <Col span={24}>
          <SeccionPlaceholder
            icon={<DollarOutlined style={{ fontSize: 17, color: "#A32D2D" }} />}
            iconBg="#FCEBEB"
            label="Ciclo de compras"
            titulo="Facturación"
            descripcion="Total + por tipo de OT (Reparación / Bien / Servicio) + gráfico mensual con filtros"
          />
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

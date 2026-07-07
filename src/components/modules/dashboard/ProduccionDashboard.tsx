"use client";

// Dashboard de Producción (KPIs de taller).
//
// Réplica del dashboard Excel "STATUS 2026 HPK kpi" del área de producción:
// WIP por status y por modelo, ingresos/entregas de componentes por mes,
// estándar vs no estándar, días promedio en taller y de evaluación por
// cliente, y componentes reparados (histórico) del modelo seleccionado.
//
// Data: /api/dashboard/produccion?anio=&modelo= (un solo endpoint, agregados SQL).
// Mismo patrón visual que LogisticaDashboard (antd + recharts + tokens de theme).

import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, Typography, Select, Tag, Row, Col, Empty, Space, Spin, Statistic } from "antd";
import {
  ToolOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  FilterOutlined,
  BuildOutlined,
} from "@ant-design/icons";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Cell,
} from "recharts";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";

const { Title, Text } = Typography;

interface ProdResp {
  kpis: {
    enTaller: number;
    ingresosAnio: number;
    entregadosAnio: number;
    promDiasTaller: number;
    promDiasEvaluacion: number;
  };
  wipPorStatus: { status: string; n: number }[];
  wipPorModelo: { modelo: string; n: number }[];
  tipoReparacion: { tipo: string; n: number }[];
  ingresosPorMes: number[];
  entregadosPorMes: number[];
  diasTallerPorCliente: { cliente: string; dias: number; n: number }[];
  diasEvaluacionPorCliente: { cliente: string; dias: number; n: number }[];
  componentesModelo: { componente: string; n: number }[];
  modelos: string[];
  meta: { anio: number; modelo: string | null };
}

const MES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Ramp secuencial de la marca (claro → navy) para las etapas del flujo de
// taller. Validado (banda de luminosidad, ΔL adyacente, contraste ≥2:1).
const RAMP_NAVY = ["#A9B4D0", "#8494BB", "#5F74A5", "#3A4F80", "#1C2B5B"];

const STATUS_CORTO: Record<string, string> = {
  "Pdt Evaluación": "Pdt Eval.",
  "Programado Evaluación": "Prog. Eval.",
  "Pdt proceso": "Pdt Proceso",
  "Programado Proceso": "Prog. Proceso",
  "Terminado": "Terminado",
};

// Estándar/No estándar: identidad fija por categoría (nunca por posición).
const TIPO_META: Record<string, { label: string; color: string }> = {
  ESTANDAR: { label: "Estándar", color: brand.cyan },
  NO_ESTANDAR: { label: "No estándar", color: brand.navy },
  "SIN DATO": { label: "Sin dato", color: "#B9BDC7" },
};
const TIPO_ORDEN = ["ESTANDAR", "NO_ESTANDAR", "SIN DATO"];

// Lista de años: la data de OTs arranca en 2020.
function aniosDisponibles(): number[] {
  const actual = dayjs().year();
  const arr: number[] = [];
  for (let y = actual; y >= 2020; y--) arr.push(y);
  return arr;
}

// Card contenedora de un chart, con altura fija o proporcional a las filas.
function ChartCard({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
  return (
    <Card title={title} size="small" styles={{ body: { padding: 12 } }}>
      <div style={{ width: "100%", height }}>{children}</div>
    </Card>
  );
}

// Barra horizontal genérica (categorías con nombres largos: clientes, modelos,
// componentes). Altura proporcional al número de filas.
function BarrasHorizontales({
  data, color, sufijo,
}: {
  data: { name: string; value: number; n?: number }[];
  color: string;
  sufijo?: string;
}) {
  if (data.length === 0) return <Empty style={{ marginTop: 24 }} />;
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid stroke="rgba(0,0,0,0.07)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={150} />
        <ReTooltip
          formatter={(v, _name, item) => {
            const n = (item?.payload as { n?: number } | undefined)?.n;
            const base = `${v}${sufijo ?? ""}`;
            return [n != null ? `${base} · ${n} OTs` : base, ""];
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ProduccionDashboard() {
  const anioActual = dayjs().year();
  const [anio, setAnio] = useState<number>(anioActual);
  const [modelo, setModelo] = useState<string | null>(null);
  const [data, setData] = useState<ProdResp | null>(null);
  const [loading, setLoading] = useState(false);

  const anios = useMemo(() => aniosDisponibles(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ anio: String(anio) });
      if (modelo) params.set("modelo", modelo);
      const res = await fetch(`/api/dashboard/produccion?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [anio, modelo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const wipStatusData = useMemo(
    () => (data?.wipPorStatus ?? []).map((r) => ({ name: STATUS_CORTO[r.status] ?? r.status, value: r.n })),
    [data?.wipPorStatus],
  );
  const tipoData = useMemo(
    () => TIPO_ORDEN
      .map((t) => ({
        key: t,
        name: TIPO_META[t].label,
        color: TIPO_META[t].color,
        value: data?.tipoReparacion.find((r) => r.tipo === t)?.n ?? 0,
      }))
      .filter((r) => r.value > 0),
    [data?.tipoReparacion],
  );
  const ingresosData = useMemo(
    () => (data?.ingresosPorMes ?? []).map((v, i) => ({ name: MES_LABELS[i], value: v })),
    [data?.ingresosPorMes],
  );
  const entregadosData = useMemo(
    () => (data?.entregadosPorMes ?? []).map((v, i) => ({ name: MES_LABELS[i], value: v })),
    [data?.entregadosPorMes],
  );
  const wipModeloData = useMemo(
    () => (data?.wipPorModelo ?? []).map((r) => ({ name: r.modelo, value: r.n })),
    [data?.wipPorModelo],
  );
  const diasTallerData = useMemo(
    () => (data?.diasTallerPorCliente ?? []).map((r) => ({ name: r.cliente, value: Math.round(r.dias * 10) / 10, n: r.n })),
    [data?.diasTallerPorCliente],
  );
  const diasEvalData = useMemo(
    () => (data?.diasEvaluacionPorCliente ?? []).map((r) => ({ name: r.cliente, value: Math.round(r.dias * 10) / 10, n: r.n })),
    [data?.diasEvaluacionPorCliente],
  );
  const componentesData = useMemo(
    () => (data?.componentesModelo ?? []).map((r) => ({ name: r.componente, value: r.n })),
    [data?.componentesModelo],
  );

  const modeloActivo = modelo ?? data?.meta.modelo ?? null;
  // Altura proporcional para las barras horizontales (26 px por fila).
  const alturaFilas = (n: number) => Math.max(200, n * 26);

  return (
    <div style={{ padding: "8px 4px" }}>
      {/* Top bar: título + filtro de año */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 14, marginBottom: 12,
      }}>
        <Space size={10} align="center">
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: brand.bgPage,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BuildOutlined style={{ fontSize: 21, color: brand.navy }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, color: brand.navy }}>
              Dashboard Producción
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Taller · ingresos, entregas y tiempos de componentes
            </Text>
          </div>
        </Space>

        <Space size={6} align="center">
          <FilterOutlined style={{ color: brand.textSecondary }} />
          <Select
            value={anio}
            onChange={setAnio}
            options={anios.map((y) => ({ value: y, label: String(y) }))}
            style={{ width: 100 }}
          />
        </Space>
      </div>

      <Tag color="blue" style={{ marginBottom: 18, padding: "4px 10px" }}>
        <FilterOutlined /> Filtro activo · Año: {anio} — lo que está en taller se muestra siempre al día de hoy
      </Tag>

      {loading && !data ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
      ) : !data ? (
        <Empty />
      ) : (
        <>
          {/* KPIs */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={8} xl={4}>
              <Card>
                <Statistic
                  title="En taller (hoy)"
                  value={data.kpis.enTaller}
                  prefix={<ToolOutlined style={{ color: brand.navy }} />}
                  styles={{ content: { color: brand.navy, fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Card>
                <Statistic
                  title={`Ingresos ${anio}`}
                  value={data.kpis.ingresosAnio}
                  prefix={<InboxOutlined style={{ color: brand.cyan }} />}
                  styles={{ content: { color: brand.cyan, fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8} xl={5}>
              <Card>
                <Statistic
                  title={`Entregados ${anio}`}
                  value={data.kpis.entregadosAnio}
                  prefix={<CheckCircleOutlined style={{ color: "#1D9E75" }} />}
                  styles={{ content: { color: "#1D9E75", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={12} xl={5}>
              <Card>
                <Statistic
                  title={`Prom. días en taller ${anio}`}
                  value={data.kpis.promDiasTaller}
                  precision={1}
                  suffix="días"
                  prefix={<ClockCircleOutlined style={{ color: "#EF9F27" }} />}
                  styles={{ content: { color: "#EF9F27", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
            <Col xs={12} md={12} xl={5}>
              <Card>
                <Statistic
                  title={`Prom. días de evaluación ${anio}`}
                  value={data.kpis.promDiasEvaluacion}
                  precision={1}
                  suffix="días"
                  prefix={<FileSearchOutlined style={{ color: "#EF9F27" }} />}
                  styles={{ content: { color: "#EF9F27", fontSize: 22, fontWeight: 600 } }}
                />
              </Card>
            </Col>
          </Row>

          {/* Fila 1: WIP por status + tipo de reparación */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={14}>
              <ChartCard title="Componentes en taller por status (hoy)" height={220}>
                <ResponsiveContainer>
                  <BarChart data={wipStatusData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {/* Ramp secuencial: el color codifica el avance en el flujo */}
                      {wipStatusData.map((_, i) => (
                        <Cell key={i} fill={RAMP_NAVY[i] ?? brand.navy} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
            <Col xs={24} md={10}>
              <ChartCard title={`Tipo de reparación (recibidos ${anio})`} height={220}>
                {tipoData.length === 0 ? <Empty style={{ marginTop: 24 }} /> : (
                  <ResponsiveContainer>
                    <BarChart data={tipoData}>
                      <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <ReTooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {tipoData.map((r) => <Cell key={r.key} fill={r.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Col>
          </Row>

          {/* Fila 2: ingresos y entregas por mes */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <ChartCard title={`Ingreso de componentes por mes (${anio})`} height={220}>
                <ResponsiveContainer>
                  <BarChart data={ingresosData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip />
                    <Bar dataKey="value" fill={brand.navy} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <ChartCard title={`Componentes entregados por mes (${anio})`} height={220}>
                <ResponsiveContainer>
                  <BarChart data={entregadosData}>
                    <CartesianGrid stroke="rgba(0,0,0,0.07)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip />
                    <Bar dataKey="value" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Col>
          </Row>

          {/* Fila 3: WIP por modelo + componentes reparados del modelo */}
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <ChartCard title="En taller por modelo (hoy)" height={alturaFilas(wipModeloData.length)}>
                <BarrasHorizontales data={wipModeloData} color={brand.navy} />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <Card
                size="small"
                styles={{ body: { padding: 12 } }}
                title="Componentes reparados por modelo (histórico)"
                extra={
                  <Select
                    size="small"
                    showSearch
                    value={modeloActivo}
                    onChange={(v) => setModelo(v)}
                    options={(data.modelos ?? []).map((m) => ({ value: m, label: m }))}
                    style={{ width: 140 }}
                    placeholder="Modelo"
                  />
                }
              >
                <div style={{ width: "100%", height: alturaFilas(componentesData.length) }}>
                  <BarrasHorizontales data={componentesData} color={brand.cyan} />
                </div>
              </Card>
            </Col>
          </Row>

          {/* Fila 4: tiempos promedio por cliente */}
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <ChartCard
                title={`Días promedio en taller por cliente (entregas ${anio})`}
                height={alturaFilas(diasTallerData.length)}
              >
                <BarrasHorizontales data={diasTallerData} color="#EF9F27" sufijo=" días" />
              </ChartCard>
            </Col>
            <Col xs={24} md={12}>
              <ChartCard
                title={`Días promedio de evaluación por cliente (${anio})`}
                height={alturaFilas(diasEvalData.length)}
              >
                <BarrasHorizontales data={diasEvalData} color="#8494BB" sufijo=" días" />
              </ChartCard>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

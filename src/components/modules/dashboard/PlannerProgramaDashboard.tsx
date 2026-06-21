"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, Row, Col, Select, Typography, Statistic, Table, Spin, Empty, Space } from "antd";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { brand } from "@/lib/theme";

const { Title, Text } = Typography;

interface Resp {
  semana: string;
  kpis: {
    tareasEvaluacion: number; tareasReparacion: number;
    evaluacion: { programado: number; realizado: number; pct: number };
    reparacion: { programado: number; realizado: number; pct: number };
  };
  curvaS: { dia: string; pctProgramado: number; pctRealizado: number }[];
  qtyPorDia: { dia: string; programado: number; realizado: number; correctivo: number }[];
  hhPorEquipo: { equipo: string; programado: number; realizado: number; correctivo: number }[];
  utilizacionTaller: { dia: string; disponibles: number; programadas: number; libres: number }[];
  totalTecnicos: number;
  jornadaHoras: number;
  semanas: string[];
}

const C_PROG = brand.navy;
const C_REAL = brand.success;
const C_CORR = brand.error;

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card size="small" title={<span style={{ fontSize: 13, fontWeight: 700, color: brand.navy }}>{title}</span>}
      style={{ marginBottom: 16, borderColor: brand.border }}>
      <div style={{ width: "100%", height: 280 }}>{children}</div>
    </Card>
  );
}

export default function PlannerProgramaDashboard() {
  const [semana, setSemana] = useState<string | undefined>();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (sem?: string) => {
    setLoading(true);
    try {
      const qs = sem ? `?semana=${encodeURIComponent(sem)}` : "";
      const res = await fetch(`/api/operaciones/programa-semanal-dashboard${qs}`);
      if (res.ok) {
        const j: Resp = await res.json();
        setData(j);
        setSemana(j.semana);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && !data) return <div style={{ padding: 24 }}><Spin /> Cargando programación…</div>;
  if (!data) return <Empty description="No se pudo cargar el dashboard de programación" />;

  const { kpis, curvaS, qtyPorDia, hhPorEquipo, utilizacionTaller } = data;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col><Title level={3} style={{ margin: 0 }}>Programación Semanal</Title></Col>
        <Col>
          <Space>
            <Text type="secondary">Semana:</Text>
            <Select
              style={{ width: 140 }}
              value={semana}
              onChange={(v) => fetchData(v)}
              options={(data.semanas ?? []).map((s) => ({ value: s, label: s }))}
              loading={loading}
            />
          </Space>
        </Col>
      </Row>

      {/* ── KPIs ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Semana" value={data.semana} valueStyle={{ color: brand.navy }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tareas Evaluación" value={kpis.tareasEvaluacion} valueStyle={{ color: brand.cyan }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tareas Reparación" value={kpis.tareasReparacion} valueStyle={{ color: brand.navy }} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Table
              size="small" pagination={false} showHeader
              rowKey="k"
              columns={[
                { title: "Resumen", dataIndex: "k", width: 90 },
                { title: "Prog.", dataIndex: "p", align: "right" as const },
                { title: "Real.", dataIndex: "r", align: "right" as const },
                { title: "%", dataIndex: "pct", align: "right" as const, render: (x: number) => `${x}%` },
              ]}
              dataSource={[
                { k: "Evaluación", p: kpis.evaluacion.programado, r: kpis.evaluacion.realizado, pct: kpis.evaluacion.pct },
                { k: "Reparación", p: kpis.reparacion.programado, r: kpis.reparacion.realizado, pct: kpis.reparacion.pct },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <ChartCard title="Curva S — Cumplimiento de plan semanal (%)">
            <ResponsiveContainer>
              <LineChart data={curvaS} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pctProgramado" name="% Programado" stroke={C_PROG} strokeWidth={2} />
                <Line type="monotone" dataKey="pctRealizado" name="% Realizado" stroke={C_REAL} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="Programado / Realizado / Correctivo (QTY por día)">
            <ResponsiveContainer>
              <BarChart data={qtyPorDia} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="programado" name="Programado" fill={C_PROG} />
                <Bar dataKey="realizado" name="Realizado" fill={C_REAL} />
                <Bar dataKey="correctivo" name="Correctivo" fill={C_CORR} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
      </Row>

      <ChartCard title={`Utilización HH – Taller (Disponibles = ${data.totalTecnicos} téc × ${data.jornadaHoras}h)`}>
        <ResponsiveContainer>
          <AreaChart data={utilizacionTaller} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="dia" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="programadas" name="HH Programadas" stackId="1" stroke={C_PROG} fill={C_PROG} fillOpacity={0.75} />
            <Area type="monotone" dataKey="libres" name="HH Libres" stackId="1" stroke={brand.cyan} fill={brand.cyan} fillOpacity={0.4} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Programado / Realizado / Correctivo (HH por equipo)">
        <ResponsiveContainer>
          <BarChart data={hhPorEquipo} margin={{ top: 8, right: 16, bottom: 40, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="equipo" fontSize={10} angle={-30} textAnchor="end" interval={0} height={60} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
            <Bar dataKey="programado" name="Programado" fill={C_PROG} />
            <Bar dataKey="realizado" name="Realizado" fill={C_REAL} />
            <Bar dataKey="correctivo" name="Correctivo" fill={C_CORR} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

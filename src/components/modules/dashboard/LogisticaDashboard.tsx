"use client";

// Dashboard de Logística — Fase 1: solo layout + filtros (sin data).
// Las 6 secciones (Requerimientos, OC, Inventario, OT, Facturación) están
// renderizadas como Cards placeholder. La data se conecta en fases siguientes
// vía endpoints /api/dashboard/logistica/* y charts con recharts.
//
// Basado en mockup dashboard_logistica.html (Chart.js + Tabler icons).

import { useMemo, useState } from "react";
import { Card, Typography, Segmented, Select, Tag, Row, Col, Empty, Space } from "antd";
import {
  FileTextOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  ToolOutlined,
  DollarOutlined,
  CalendarOutlined,
  FilterOutlined,
} from "@ant-design/icons";
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

      {/* Secciones (placeholders por ahora) */}
      <Row gutter={[16, 0]}>
        <Col span={24}>
          <SeccionPlaceholder
            icon={<FileTextOutlined style={{ fontSize: 17, color: brand.navy }} />}
            iconBg="#E7E9F2"
            label="Ciclo de compras"
            titulo="Requerimientos"
            descripcion="Emitidos / aprobados / en proceso + 4 gráficos (mensual, semanal, por OT, tiempo de aprobación)"
          />
        </Col>
        <Col span={24}>
          <SeccionPlaceholder
            icon={<ShoppingCartOutlined style={{ fontSize: 17, color: "#3C3489" }} />}
            iconBg="#EEEDFE"
            label="Ciclo de compras"
            titulo="Orden de compra"
            descripcion="OCs colocadas / costo / ticket promedio + estado + top proveedores + 3 gráficos (cantidad, costo, tiempo)"
          />
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

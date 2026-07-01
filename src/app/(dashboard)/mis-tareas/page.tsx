"use client";

// "Mis Tareas" — histórico completo de tareas (PlanificacionOT) del técnico
// autenticado. Paginación y filtros server-side contra /api/mi-trabajo/historico.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Card, Table, Tag, Input, Select, Row, Col, Statistic, App, Space, Button, DatePicker,
} from "antd";
import { ToolOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";
import { formatDateOnly } from "@/lib/dates";
import { paginacionEstandar, useAbortableFetch } from "@/lib/tables";
import { ExportarExcelButton } from "@/components/ExportarExcelButton";

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

interface TareaHist {
  id: number;
  ot_id: number;
  componente: string;
  operacion_codigo: string;
  descripcion: string;
  horas_estimadas: string | number | null;
  horas_reales: string | number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  estado: string | null;
  status_tarea: { codigo: string; nombre: string } | null;
  orden_trabajo: { ot: number | null; descripcion: string | null } | null;
}

// Refleja el catálogo StatusTarea.
const ESTADO_OPCIONES = [
  { value: "abierto", label: "Abierto" },
  { value: "programado", label: "Programado" },
  { value: "en_proceso", label: "En proceso" },
  { value: "pausado", label: "Pausado" },
  { value: "realizado", label: "Realizado" },
  { value: "correctivo", label: "Correctivo" },
  { value: "cancelado", label: "Cancelado" },
];

function estadoColor(estado: string | null): string {
  switch (estado) {
    case "realizado": return "success";
    case "en_proceso": return "processing";
    case "programado": return "blue";
    case "pausado": return "warning";
    case "cancelado": return "error";
    default: return "default";
  }
}

function eficiencia(est: string | number | null, real: string | number | null): number | null {
  const e = Number(est ?? 0), r = Number(real ?? 0);
  if (r <= 0 || e <= 0) return null;
  return Math.round((e / r) * 100);
}
function eficienciaColor(pct: number | null): string {
  if (pct == null) return brand.textSecondary;
  if (pct >= 100) return "#52c41a";
  if (pct >= 80) return "#faad14";
  return brand.error;
}

export default function MisTareasPage() {
  const { message: msg } = App.useApp();
  const [data, setData] = useState<TareaHist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [estado, setEstado] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [semana, setSemana] = useState<Dayjs | null>(null);

  const abortable = useAbortableFetch();
  const fetchData = useCallback(async () => {
    const controller = abortable.start();
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (estado) params.set("estado", estado);
      if (search) params.set("search", search);
      if (semana) {
        params.set("fecha_desde", semana.startOf("isoWeek").format("YYYY-MM-DD"));
        params.set("fecha_hasta", semana.endOf("isoWeek").format("YYYY-MM-DD") + "T23:59:59");
      }
      const res = await fetch(`/api/mi-trabajo/historico?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const json = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error(json.error ?? "Error");
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      if (abortable.isAbort(e)) return;
      msg.error(e instanceof Error ? e.message : "Error al cargar tareas");
    } finally {
      if (abortable.isCurrent(controller)) setLoading(false);
    }
  }, [page, pageSize, estado, search, semana, msg, abortable]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const realizadas = useMemo(() => data.filter((t) => t.estado === "realizado").length, [data]);
  const horasReales = useMemo(
    () => Math.round(data.reduce((acc, t) => acc + Number(t.horas_reales ?? 0), 0) * 10) / 10,
    [data],
  );

  const columns: ColumnsType<TareaHist> = useMemo(() => [
    {
      key: "ot", title: "OT", width: 110, fixed: "left",
      render: (_v, r) => <Tag color={brand.navy} style={{ margin: 0 }}>{r.orden_trabajo?.ot ?? `#${r.ot_id}`}</Tag>,
    },
    { key: "componente", title: "Componente", width: 120, render: (_v, r) => r.componente || "—" },
    { key: "operacion", title: "Operación", width: 110, render: (_v, r) => r.operacion_codigo || "—" },
    { key: "descripcion", title: "Descripción", ellipsis: true, render: (_v, r) => r.descripcion || <Text type="secondary">—</Text> },
    {
      key: "estado", title: "Estado", width: 110,
      render: (_v, r) => <Tag color={estadoColor(r.estado)} style={{ margin: 0 }}>{r.status_tarea?.nombre ?? r.estado ?? "—"}</Tag>,
    },
    {
      key: "ini_real", title: "Inicio real", width: 110,
      render: (_v, r) => r.fecha_inicio_real ? formatDateOnly(r.fecha_inicio_real) : <Text type="secondary">—</Text>,
    },
    {
      key: "fin_real", title: "Fin real", width: 110,
      render: (_v, r) => r.fecha_fin_real ? formatDateOnly(r.fecha_fin_real) : <Text type="secondary">—</Text>,
    },
    {
      key: "h_est", title: "H. est.", width: 80, align: "right",
      render: (_v, r) => r.horas_estimadas != null ? Number(r.horas_estimadas).toFixed(1) : "—",
    },
    {
      key: "h_real", title: "H. real", width: 80, align: "right",
      render: (_v, r) => r.horas_reales != null ? Number(r.horas_reales).toFixed(1) : "—",
    },
    {
      key: "efic", title: "Efic.", width: 80, align: "right",
      render: (_v, r) => {
        const pct = eficiencia(r.horas_estimadas, r.horas_reales);
        return pct != null ? <Text strong style={{ color: eficienciaColor(pct) }}>{pct}%</Text> : <Text type="secondary">—</Text>;
      },
    },
  ], []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ToolOutlined style={{ marginRight: 8 }} />
          Mis Tareas
        </Title>
        <Space>
          <ExportarExcelButton<TareaHist>
            endpoint="/api/mi-trabajo/historico"
            // El endpoint capea limit en 500; con el default (1000) el paginado
            // interno cortaría en la primera página.
            limit={500}
            filename="MisTareas"
            // Mismos filtros server-side que fetchData (sin page/limit).
            endpointParams={{
              estado,
              search,
              fecha_desde: semana ? semana.startOf("isoWeek").format("YYYY-MM-DD") : undefined,
              fecha_hasta: semana ? semana.endOf("isoWeek").format("YYYY-MM-DD") + "T23:59:59" : undefined,
            }}
            currentRows={data}
            columns={[
              { label: "OT", value: (r) => r.orden_trabajo?.ot ?? `#${r.ot_id}` },
              { label: "Componente", value: (r) => r.componente || "" },
              { label: "Operación", value: (r) => r.operacion_codigo || "" },
              { label: "Descripción", value: (r) => r.descripcion || "" },
              { label: "Estado", value: (r) => r.status_tarea?.nombre ?? r.estado ?? "" },
              { label: "Inicio real", value: (r) => r.fecha_inicio_real ? formatDateOnly(r.fecha_inicio_real) : "" },
              { label: "Fin real", value: (r) => r.fecha_fin_real ? formatDateOnly(r.fecha_fin_real) : "" },
              { label: "H. est.", value: (r) => r.horas_estimadas != null ? Number(r.horas_estimadas) : "" },
              { label: "H. real", value: (r) => r.horas_reales != null ? Number(r.horas_reales) : "" },
              { label: "Efic. (%)", value: (r) => eficiencia(r.horas_estimadas, r.horas_reales) ?? "" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={8}><Card size="small"><Statistic title="Tareas (filtro actual)" value={total} styles={{ content: { color: brand.navy } }} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Realizadas (página)" value={realizadas} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={8}><Card size="small"><Statistic title="Horas reales (página)" value={horasReales} styles={{ content: { color: brand.cyan } }} /></Card></Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <Input.Search
            placeholder="Buscar por OT, componente, operación…"
            allowClear
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onSearch={(v) => { setPage(1); setSearch(v.trim()); }}
            style={{ width: 280 }}
          />
          <Select
            placeholder="Estado"
            allowClear showSearch optionFilterProp="label"
            value={estado}
            onChange={(v) => { setPage(1); setEstado(v); }}
            options={ESTADO_OPCIONES}
            style={{ width: 160 }}
          />
          <DatePicker
            picker="week"
            placeholder="Filtrar por semana"
            value={semana}
            onChange={(v) => { setPage(1); setSemana(v); }}
            style={{ width: 200 }}
          />
          {semana && (
            <Button size="small" onClick={() => { setPage(1); setSemana(null); }}>Limpiar semana</Button>
          )}
        </Space>
        <Table<TareaHist>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={paginacionEstandar({
            current: page,
            pageSize,
            total,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            label: "tarea(s)",
          })}
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
}

"use client";

// Programación semanal de OT internas — análoga a la de OT externas pero
// usando el campo `semana_revision` de OrdenTrabajoInterna (formato ISO
// YYYY-Www). Permite navegar entre rangos de semanas y ver las OT internas
// asignadas a cada una.
//
// Hoy es solo vista: la asignación de semana se hace desde el detalle de la
// OT interna (campo Semana revisión). En una fase siguiente puede agregarse
// drag & drop entre semanas como tiene OT externa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Input, Empty, Tooltip, App,
  DatePicker, Row, Col, Statistic,
} from "antd";
import {
  CalendarOutlined, ReloadOutlined, SearchOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { brand } from "@/lib/theme";
import { formatOtInternaCodigo } from "@/lib/ot-formato";
import { STICKY_HEADER, paginacionEstandar, PAGINATION_PAGE_SIZE } from "@/lib/tables";

dayjs.extend(isoWeek);
const { Title, Text } = Typography;

interface OTInternaRow {
  id: number;
  ot: number | string | null;
  anio: number | null;
  descripcion: string | null;
  semana_revision: string | null;
  prioridad_atencion_codigo: string | null;
  ot_status_codigo: string | null;
  recursos_status_codigo: string | null;
  aprobacion_status_codigo: string | null;
  asignado_a: string | null;
  area_taller: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  fecha_cierre: string | null;
  equipo: { codigo: string; descripcion: string } | null;
  estrategia: { codigo: string; descripcion: string } | null;
  tipo_ot_interna: { codigo: string; nombre: string } | null;
  ot_status: { codigo: string; nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
}

interface SemanaGrupo {
  semana: string;
  count: number;
  items: OTInternaRow[];
}

// Formato ISO YYYY-Www a partir de un dayjs.
function isoWeekStr(d: dayjs.Dayjs): string {
  return `${d.isoWeekYear()}W${String(d.isoWeek()).padStart(2, "0")}`;
}

const PRIORIDAD_COLOR: Record<string, string> = {
  "1": "red", "2": "orange", "3": "default", "E": "volcano",
};
const APROBACION_COLOR: Record<string, string> = {
  BORRADOR: "default", SIN_APROBACION: "orange",
  APROBADA: "green", RECHAZADA: "red",
};

export default function ProgramacionSemanalInternasPage() {
  const router = useRouter();
  const { message } = App.useApp();
  // Semana focal: la "actual" por default. El usuario puede moverse
  // adelante/atrás o saltar a una fecha específica.
  const [semanaFocal, setSemanaFocal] = useState<dayjs.Dayjs>(dayjs());
  const [grupos, setGrupos] = useState<SemanaGrupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Rango: 4 semanas alrededor de la focal (2 atrás, 1 actual, 2 adelante).
  const semanaDesde = useMemo(() => isoWeekStr(semanaFocal.subtract(2, "week").startOf("isoWeek")), [semanaFocal]);
  const semanaHasta = useMemo(() => isoWeekStr(semanaFocal.add(2, "week").startOf("isoWeek")), [semanaFocal]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/por-semana?desde=${semanaDesde}&hasta=${semanaHasta}`);
      if (!res.ok) throw new Error("Error al cargar");
      const j = await res.json();
      setGrupos(j.data ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [semanaDesde, semanaHasta, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Aplica filtro libre sobre todos los grupos.
  const gruposFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grupos;
    return grupos
      .map((g) => ({
        ...g,
        items: g.items.filter((r) =>
          String(r.ot ?? "").toLowerCase().includes(q)
          || (r.descripcion ?? "").toLowerCase().includes(q)
          || (r.asignado_a ?? "").toLowerCase().includes(q)
          || (r.equipo?.codigo ?? "").toLowerCase().includes(q)
          || (r.estrategia?.codigo ?? "").toLowerCase().includes(q),
        ),
        count: 0,
      }))
      .map((g) => ({ ...g, count: g.items.length }))
      .filter((g) => g.items.length > 0);
  }, [grupos, search]);

  const totalEnRango = gruposFiltrados.reduce((s, g) => s + g.count, 0);
  const semanaActualStr = isoWeekStr(dayjs().startOf("isoWeek"));

  const columns: ColumnsType<OTInternaRow> = [
    {
      key: "ot", title: "Nro OT", width: 110, fixed: "left",
      render: (_, r) => (
        <a onClick={() => router.push(`/ordenes-trabajo-internas/${r.id}`)}>
          <Tag color={brand.cyan} style={{ margin: 0, fontWeight: 600 }}>
            {formatOtInternaCodigo(r.ot, `#${r.id}`)}
          </Tag>
        </a>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 110,
      render: (_, r) => r.tipo_ot_interna
        ? <Tag color={r.tipo_ot_interna.codigo === "PREVENTIVA" || r.tipo_ot_interna.codigo === "ESTRATEGICA" ? "blue" : "orange"}>{r.tipo_ot_interna.nombre}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "estado", title: "Estado", width: 110, align: "center",
      render: (_, r) => r.ot_status
        ? <Tag color={r.ot_status.codigo === "Abierta" ? "processing" : r.ot_status.codigo === "Cerrada" ? "success" : "default"}>{r.ot_status.nombre}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "aprob", title: "Aprob.", width: 100, align: "center",
      render: (_, r) => {
        const code = r.aprobacion_status_codigo ?? "BORRADOR";
        const color = APROBACION_COLOR[code] ?? "default";
        return <Tag color={color}>{code.replace("_", " ")}</Tag>;
      },
    },
    {
      key: "prio", title: "Prio", width: 70, align: "center",
      render: (_, r) => r.prioridad_atencion
        ? <Tag color={PRIORIDAD_COLOR[r.prioridad_atencion.codigo] ?? "default"}>{r.prioridad_atencion.codigo}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "equipo", title: "Equipo", width: 200, ellipsis: true,
      render: (_, r) => r.equipo
        ? <span style={{ fontSize: 12 }}><Tag style={{ margin: 0 }}>{r.equipo.codigo}</Tag> {r.equipo.descripcion}</span>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "estrategia", title: "Estrategia", width: 110,
      render: (_, r) => r.estrategia
        ? <Tag color="blue" style={{ margin: 0 }}>{r.estrategia.codigo}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      key: "asignado", title: "Asignado a", width: 160, ellipsis: true,
      render: (_, r) => r.asignado_a ?? <Text type="secondary">—</Text>,
    },
    {
      key: "descripcion", title: "Descripción", ellipsis: true,
      render: (_, r) => r.descripcion ?? <Text type="secondary">—</Text>,
    },
    {
      key: "plan", title: "Plan", width: 165, align: "center",
      render: (_, r) => r.fecha_inicio_plan || r.fecha_fin_plan ? (
        <div style={{ fontSize: 11 }}>
          {r.fecha_inicio_plan ? dayjs(r.fecha_inicio_plan).format("DD/MM") : "—"} →
          {" "}{r.fecha_fin_plan ? dayjs(r.fecha_fin_plan).format("DD/MM") : "—"}
        </div>
      ) : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Title level={4} style={{ margin: 0, color: brand.navy }}>
          <ToolOutlined style={{ marginRight: 8 }} />
          Programación semanal — OT Internas
        </Title>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setSemanaFocal((s) => s.subtract(1, "week"))}>
            Semana anterior
          </Button>
          <DatePicker
            picker="week"
            value={semanaFocal}
            onChange={(d) => d && setSemanaFocal(d)}
            format={(d) => isoWeekStr(d)}
            allowClear={false}
          />
          <Button icon={<ArrowRightOutlined />} onClick={() => setSemanaFocal((s) => s.add(1, "week"))}>
            Semana siguiente
          </Button>
          <Button onClick={() => setSemanaFocal(dayjs())}>Hoy</Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Refrescar</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="OTs en rango" value={totalEnRango} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Semanas con OTs" value={gruposFiltrados.length} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Semana focal" value={isoWeekStr(semanaFocal)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Semana actual" value={semanaActualStr} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 10 } }}>
        <Input
          placeholder="Buscar por nro OT, equipo, asignado, descripción…"
          prefix={<SearchOutlined />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 380 }}
        />
        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
          Mostrando rango {semanaDesde} → {semanaHasta}. Cambiá la semana focal para moverte.
        </Text>
      </Card>

      {gruposFiltrados.length === 0 && !loading ? (
        <Empty
          description={
            <div>
              <div>Sin OT internas en este rango</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Asigná <b>Semana revisión</b> en el detalle de las OT internas para que aparezcan acá.
              </Text>
            </div>
          }
          style={{ padding: 40 }}
        />
      ) : (
        gruposFiltrados.map((g) => (
          <Card
            key={g.semana}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space>
                <CalendarOutlined />
                <Text strong>{g.semana}</Text>
                {g.semana === semanaActualStr && <Tag color="processing">actual</Tag>}
                <Tooltip title="Cantidad de OTs en esta semana">
                  <Tag>{g.count}</Tag>
                </Tooltip>
              </Space>
            }
          >
            <Table<OTInternaRow>
              rowKey="id"
              size="small"
              sticky={STICKY_HEADER}
              dataSource={g.items}
              columns={columns}
              loading={loading}
              scroll={{ x: "max-content" }}
              pagination={paginacionEstandar({
                current: 1,
                pageSize: PAGINATION_PAGE_SIZE,
                total: g.items.length,
                onChange: () => {},
                label: "OTs internas",
              })}
            />
          </Card>
        ))
      )}
    </div>
  );
}

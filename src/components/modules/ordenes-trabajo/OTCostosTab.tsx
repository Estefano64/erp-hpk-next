"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, Table, Tag, Typography, Spin, Empty, Row, Col, Statistic, Space, Tooltip } from "antd";
import { DollarOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand, space } from "@/lib/theme";

const { Text, Title } = Typography;

interface MonedaTotales {
  [moneda: string]: number;
}

interface ItemRow {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  material_codigo: string | null;
  descripcion: string;
  cantidad: number;
  cantidad_recibida: number;
  precio_unitario: number;
  moneda: string;
  subtotal: number;
  subtotal_ejecutado: number;
  subtotal_proyectado: number;
  status_req: string | null;
  status_oc: string | null;
}

interface OCRow {
  id: number;
  numero_po: string;
  proveedor: string | null;
  status_oc: string | null;
  moneda: string;
  total: number;
  total_recibido: number;
  fecha_solicitud: string | null;
  fecha_entrega_real: string | null;
}

interface HHRow {
  planificacion_id: number;
  descripcion: string;
  tecnico: string;
  horas_normales: number;
  horas_extras: number;
  costo_hora_hombre: number;
  costo_hora_extra: number;
  moneda: string;
  subtotal: number;
}

interface CostosResponse {
  ejecutado: {
    materiales: { items: ItemRow[]; total_por_moneda: MonedaTotales };
    servicios: { items: ItemRow[]; total_por_moneda: MonedaTotales };
    hh: { items: HHRow[]; total_por_moneda: MonedaTotales };
    ocs: { items: OCRow[]; total_por_moneda: MonedaTotales };
    total_por_moneda: MonedaTotales;
  };
  proyectado: {
    materiales: { items: ItemRow[]; total_por_moneda: MonedaTotales };
    servicios: { items: ItemRow[]; total_por_moneda: MonedaTotales };
    total_por_moneda: MonedaTotales;
  };
}

interface Props {
  otId: number;
  // "externa" | "interna" — controla qué endpoint consulta. Default externa
  // por compat con los callsites existentes.
  kind?: "externa" | "interna";
}

function fmt(monto: number, moneda: string): string {
  // Format en es-PE — separador de miles + 2 decimales.
  const n = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto);
  const simbolo = moneda === "USD" ? "US$ " : moneda === "PEN" ? "S/ " : `${moneda} `;
  return `${simbolo}${n}`;
}

function MonedasTotalesInline({ totales }: { totales: MonedaTotales }) {
  const entries = Object.entries(totales).filter(([, v]) => v !== 0);
  if (entries.length === 0) return <Text type="secondary">—</Text>;
  return (
    <Space wrap size={4}>
      {entries.map(([m, v]) => (
        <Tag key={m} color={m === "USD" ? "blue" : m === "PEN" ? "gold" : "default"} style={{ margin: 0, fontFamily: "monospace" }}>
          {fmt(v, m)}
        </Tag>
      ))}
    </Space>
  );
}

const ITEM_COLUMNS: ColumnsType<ItemRow> = [
  { title: "Req", dataIndex: "nro_req", key: "nro_req", width: 120, render: (v: string | null, r) => v ? `${v}.${r.item_req ?? ""}` : "—" },
  { title: "Código", dataIndex: "material_codigo", key: "material_codigo", width: 130, render: (v: string | null) => v ?? <Text type="secondary">—</Text> },
  { title: "Descripción", dataIndex: "descripcion", key: "descripcion", ellipsis: true },
  { title: "Cant", dataIndex: "cantidad", key: "cantidad", align: "right", width: 80, render: (v: number) => v.toFixed(2) },
  { title: "Recibido", dataIndex: "cantidad_recibida", key: "cantidad_recibida", align: "right", width: 90, render: (v: number) => v.toFixed(2) },
  { title: "Precio U.", dataIndex: "precio_unitario", key: "precio_unitario", align: "right", width: 110, render: (v: number, r) => fmt(v, r.moneda) },
  { title: "Subtotal", key: "subtotal", align: "right", width: 130, render: (_, r) => <Text strong>{fmt(r.subtotal_ejecutado || r.subtotal_proyectado || r.subtotal, r.moneda)}</Text> },
];

const HH_COLUMNS: ColumnsType<HHRow> = [
  { title: "Tarea", dataIndex: "descripcion", key: "descripcion", ellipsis: true },
  { title: "Técnico", dataIndex: "tecnico", key: "tecnico", width: 180 },
  { title: "Horas Normales", dataIndex: "horas_normales", key: "horas_normales", align: "right", width: 130, render: (v: number) => v.toFixed(2) },
  { title: "Horas Extras", dataIndex: "horas_extras", key: "horas_extras", align: "right", width: 110, render: (v: number) => v > 0 ? v.toFixed(2) : "—" },
  { title: "$/h Normal", dataIndex: "costo_hora_hombre", key: "chh", align: "right", width: 110, render: (v: number, r) => fmt(v, r.moneda) },
  { title: "$/h Extra", dataIndex: "costo_hora_extra", key: "che", align: "right", width: 110, render: (v: number, r) => v > 0 ? fmt(v, r.moneda) : "—" },
  { title: "Subtotal", dataIndex: "subtotal", key: "subtotal", align: "right", width: 130, render: (v: number, r) => <Text strong>{fmt(v, r.moneda)}</Text> },
];

const OC_COLUMNS: ColumnsType<OCRow> = [
  { title: "Nro PO", dataIndex: "numero_po", key: "numero_po", width: 110 },
  { title: "Proveedor", dataIndex: "proveedor", key: "proveedor", ellipsis: true },
  {
    title: "Estado", dataIndex: "status_oc", key: "status_oc", width: 120,
    render: (v: string | null) => v ? <Tag color={v === "ENTREGADO" || v === "COMPLETO" ? "success" : v === "PROCESO" ? "processing" : v === "INCOMPLETO" ? "warning" : "default"}>{v}</Tag> : "—",
  },
  { title: "Total OC", key: "total", align: "right", width: 130, render: (_, r) => fmt(r.total, r.moneda) },
  { title: "Recibido", key: "recibido", align: "right", width: 130, render: (_, r) => fmt(r.total_recibido, r.moneda) },
];

export default function OTCostosTab({ otId, kind = "externa" }: Props) {
  const [data, setData] = useState<CostosResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCostos = async () => {
    setLoading(true);
    try {
      const base = kind === "interna" ? "ordenes-trabajo-internas" : "ordenes-trabajo";
      const res = await fetch(`/api/${base}/${otId}/costos`);
      const json = await res.json();
      if (res.ok) setData(json.data as CostosResponse);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (otId) fetchCostos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otId]);

  const hayDatos = useMemo(() => {
    if (!data) return false;
    const e = data.ejecutado;
    const p = data.proyectado;
    return (
      e.materiales.items.length > 0
      || e.servicios.items.length > 0
      || e.hh.items.length > 0
      || e.ocs.items.length > 0
      || p.materiales.items.length > 0
      || p.servicios.items.length > 0
    );
  }, [data]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin />
      </div>
    );
  }

  if (!data || !hayDatos) {
    return (
      <Empty
        image={<DollarOutlined style={{ fontSize: 48, color: brand.textSecondary }} />}
        description={
          <Space orientation="vertical" size={4} style={{ textAlign: "center" }}>
            <Text>Sin costos registrados todavía</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Los costos aparecen acá cuando se reciben OCs, se consume material de almacén,
              se cierran tareas con HH o se entregan servicios externos.
            </Text>
          </Space>
        }
        style={{ padding: 40 }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      {/* ── Resumen totales ── */}
      <Card size="small">
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Costo ejecutado</Text>}
              valueRender={() => <MonedasTotalesInline totales={data.ejecutado.total_por_moneda} />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Costo proyectado</Text>}
              valueRender={() => <MonedasTotalesInline totales={data.proyectado.total_por_moneda} />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Tooltip title="Suma de ejecutado + proyectado por moneda. No incluye conversión cambiaria.">
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Total comprometido</Text>}
                valueRender={() => {
                  const tot: MonedaTotales = {};
                  for (const [m, v] of Object.entries(data.ejecutado.total_por_moneda)) tot[m] = (tot[m] ?? 0) + v;
                  for (const [m, v] of Object.entries(data.proyectado.total_por_moneda)) tot[m] = (tot[m] ?? 0) + v;
                  return <MonedasTotalesInline totales={tot} />;
                }}
              />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      {/* ── Ejecutado ── */}
      <Card
        size="small"
        title={
          <Space>
            <Tag color={brand.success}>Ejecutado</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>costo real ya gastado</Text>
          </Space>
        }
        extra={<a onClick={fetchCostos} style={{ fontSize: 12 }}><ReloadOutlined /> Recargar</a>}
      >
        {data.ejecutado.materiales.items.length > 0 && (
          <div style={{ marginBottom: space.md }}>
            <Title level={5} style={{ marginTop: 0 }}>Materiales consumidos</Title>
            <Table
              size="small"
              dataSource={data.ejecutado.materiales.items}
              columns={ITEM_COLUMNS}
              rowKey="id"
              pagination={false}
              scroll={{ x: 900 }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}><Text strong>Subtotal materiales</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><MonedasTotalesInline totales={data.ejecutado.materiales.total_por_moneda} /></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        )}
        {data.ejecutado.servicios.items.length > 0 && (
          <div style={{ marginBottom: space.md }}>
            <Title level={5}>Servicios entregados</Title>
            <Table
              size="small"
              dataSource={data.ejecutado.servicios.items}
              columns={ITEM_COLUMNS}
              rowKey="id"
              pagination={false}
              scroll={{ x: 900 }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}><Text strong>Subtotal servicios</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><MonedasTotalesInline totales={data.ejecutado.servicios.total_por_moneda} /></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        )}
        {data.ejecutado.hh.items.length > 0 && (
          <div style={{ marginBottom: space.md }}>
            <Title level={5}>Horas hombre</Title>
            <Table
              size="small"
              dataSource={data.ejecutado.hh.items}
              columns={HH_COLUMNS}
              rowKey={(r) => `${r.planificacion_id}-${r.tecnico}`}
              pagination={false}
              scroll={{ x: 900 }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}><Text strong>Subtotal HH</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><MonedasTotalesInline totales={data.ejecutado.hh.total_por_moneda} /></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        )}
        {data.ejecutado.ocs.items.length > 0 && (
          <div>
            <Title level={5}>OCs vinculadas</Title>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
              Auditoría — los costos individuales ya están contados arriba en materiales/servicios.
            </Text>
            <Table
              size="small"
              dataSource={data.ejecutado.ocs.items}
              columns={OC_COLUMNS}
              rowKey="id"
              pagination={false}
              scroll={{ x: 700 }}
            />
          </div>
        )}
      </Card>

      {/* ── Proyectado ── */}
      {(data.proyectado.materiales.items.length > 0 || data.proyectado.servicios.items.length > 0) && (
        <Card
          size="small"
          title={
            <Space>
              <Tag color={brand.warning}>Proyectado</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>aprobado pero no ejecutado todavía</Text>
            </Space>
          }
        >
          {data.proyectado.materiales.items.length > 0 && (
            <div style={{ marginBottom: space.md }}>
              <Title level={5} style={{ marginTop: 0 }}>Materiales pendientes</Title>
              <Table
                size="small"
                dataSource={data.proyectado.materiales.items}
                columns={ITEM_COLUMNS}
                rowKey="id"
                pagination={false}
                scroll={{ x: 900 }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}><Text strong>Subtotal proyectado</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right"><MonedasTotalesInline totales={data.proyectado.materiales.total_por_moneda} /></Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </div>
          )}
          {data.proyectado.servicios.items.length > 0 && (
            <div>
              <Title level={5}>Servicios pendientes</Title>
              <Table
                size="small"
                dataSource={data.proyectado.servicios.items}
                columns={ITEM_COLUMNS}
                rowKey="id"
                pagination={false}
                scroll={{ x: 900 }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}><Text strong>Subtotal proyectado</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right"><MonedasTotalesInline totales={data.proyectado.servicios.total_por_moneda} /></Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

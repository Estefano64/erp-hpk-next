"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Modal, Form, Input, DatePicker, InputNumber, App, Tooltip, Alert,
} from "antd";
import {
  AuditOutlined, ReloadOutlined, FileDoneOutlined, EyeOutlined,
  WarningOutlined, PaperClipOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { formatDateOnly } from "@/lib/dates";
import { useColumnasRedimensionables, STICKY_HEADER, paginacionEstandar } from "@/lib/tables";

const { Title, Text } = Typography;

interface OTLista {
  id: number;
  ot: string | null;
  cliente: string | null;
  codigo_reparacion: string | null;
  ns: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  fecha_entrega: string | null;
  fecha_facturacion: string | null;
  guia_entrega_salida: string | null;
  nro_informe_entrega: string | null;
  nro_factura: string | null;
  monto_cotizacion: number | string | null;
  taller_status: string | null;
  adjuntos: Array<{ id: number; etapa_codigo: string; nombre_archivo: string }>;
  adjuntos_ok: boolean;
  faltantes: string[];
}

export default function FacturacionOTPage() {
  const { message: msg } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<OTLista[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [otSel, setOtSel] = useState<OTLista | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{
    nro_factura: string;
    fecha_facturacion: Dayjs;
    monto?: number;
    observaciones?: string;
  }>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/facturacion/ot");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      msg.error("Error al cargar facturación de OTs");
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const abrirModal = (ot: OTLista) => {
    if (!ot.adjuntos_ok) {
      msg.error(`No se puede facturar: faltan ${ot.faltantes.join(", ")}`);
      return;
    }
    setOtSel(ot);
    form.resetFields();
    form.setFieldsValue({
      nro_factura: ot.nro_factura ?? "",
      fecha_facturacion: ot.fecha_facturacion ? dayjs(ot.fecha_facturacion) : dayjs(),
      monto: ot.monto_cotizacion != null ? Number(ot.monto_cotizacion) : undefined,
    });
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    if (!otSel) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/facturacion/ot/${otSel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nro_factura: values.nro_factura,
          fecha_facturacion: values.fecha_facturacion ? values.fecha_facturacion.format("YYYY-MM-DD") : null,
          monto: values.monto ?? null,
          observaciones: values.observaciones ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      msg.success(json.message ?? "Factura registrada");
      setModalOpen(false);
      setOtSel(null);
      fetchData();
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const conFactura = data.filter((o) => o.nro_factura).length;
  const sinFactura = data.length - conFactura;
  const conAdjuntosOk = data.filter((o) => o.adjuntos_ok).length;

  const columns: ColumnsType<OTLista> = useMemo(() => [
    {
      key: "ot", title: "OT", width: 110,
      render: (_v, r) => (
        <Tag color={brand.navy} style={{ cursor: "pointer", margin: 0 }} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}>
          {r.ot ?? `#${r.id}`}
        </Tag>
      ),
    },
    {
      key: "cliente", title: "Cliente", width: 180, ellipsis: true,
      render: (_v, r) => r.cliente ?? "—",
    },
    {
      key: "codrep", title: "Código reparable", ellipsis: true,
      render: (_v, r) => r.codigo_reparacion ?? <Text type="secondary">—</Text>,
    },
    {
      key: "ns", title: "N° Serie", width: 110,
      render: (_v, r) => r.ns ?? <Text type="secondary">—</Text>,
    },
    {
      key: "wo_po", title: "WO / PO Cliente", width: 150,
      render: (_v, r) => (
        <div style={{ lineHeight: 1.2, fontSize: 11 }}>
          <div>{r.wo_cliente ?? "—"}</div>
          <div style={{ color: "#888" }}>{r.po_cliente ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "guia", title: "Guía", width: 140,
      render: (_v, r) => r.guia_entrega_salida
        ? <Tag color="blue" style={{ margin: 0 }}>{r.guia_entrega_salida}</Tag>
        : <Tag color="default">—</Tag>,
    },
    {
      key: "adjuntos", title: "Adjuntos", width: 120, align: "center",
      render: (_v, r) => (
        <Tooltip title={r.adjuntos_ok ? "Todos los adjuntos requeridos están" : `Faltan: ${r.faltantes.join(", ")}`}>
          {r.adjuntos_ok
            ? <Tag icon={<CheckCircleOutlined />} color="green">OK ({r.adjuntos.length})</Tag>
            : <Tag icon={<WarningOutlined />} color="error">Faltan</Tag>}
        </Tooltip>
      ),
    },
    {
      key: "fact", title: "N° Factura", width: 140,
      render: (_v, r) => r.nro_factura
        ? <Tag color="green" style={{ margin: 0 }}>{r.nro_factura}</Tag>
        : <Tag color="default">Pendiente</Tag>,
    },
    {
      key: "fecha_fact", title: "F. Facturación", width: 110,
      render: (_v, r) => r.fecha_facturacion ? formatDateOnly(r.fecha_facturacion) : <Text type="secondary">—</Text>,
    },
    {
      key: "monto", title: "Monto", width: 110, align: "right",
      render: (_v, r) => r.monto_cotizacion != null ? (
        <Text strong style={{ color: brand.navy }}>{Number(r.monto_cotizacion).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</Text>
      ) : <Text type="secondary">—</Text>,
    },
    {
      key: "acc", title: "Acciones", width: 200, fixed: "right",
      render: (_v, r) => (
        <Space size={4}>
          <Tooltip title="Ver OT">
            <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)} />
          </Tooltip>
          <Tooltip title={r.adjuntos_ok ? "" : `Faltan: ${r.faltantes.join(", ")}`}>
            <Button
              size="small"
              type="primary"
              icon={<FileDoneOutlined />}
              disabled={!r.adjuntos_ok}
              onClick={() => abrirModal(r)}
            >
              {r.nro_factura ? "Editar factura" : "Facturar"}
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ], [router]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <AuditOutlined style={{ marginRight: 8 }} />
          Facturación de OTs (mina)
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
      </div>

      <Alert
        type="info" showIcon icon={<PaperClipOutlined />} style={{ marginBottom: 12 }}
        title="Requisitos para facturar"
        description="Cada OT entregada debe tener el N° de guía de remisión emitido y al menos un archivo adjunto en la etapa “despacho” (la guía firmada / cargo del cliente). Solo entonces se habilita el botón “Facturar”."
      />

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="OTs entregadas" value={data.length} styles={{ content: { color: brand.navy } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Listas para facturar" value={conAdjuntosOk} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Ya facturadas" value={conFactura} styles={{ content: { color: brand.cyan } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sin factura" value={sinFactura} styles={{ content: { color: sinFactura > 0 ? "#fa8c16" : "#bfbfbf" } }} /></Card></Col>
      </Row>

      {data.length === 0 && !loading ? (
        <Empty description="No hay OTs entregadas pendientes de facturación." />
      ) : (
        <Card>
          <TablaFacturacionOT
            columns={columns}
            data={data}
            loading={loading}
            page={page}
            pageSize={pageSize}
            onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
          />
        </Card>
      )}

      <Modal
        title={otSel ? `Factura — ${otSel.ot ?? `OT #${otSel.id}`}` : ""}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleGuardar}
        okText={otSel?.nro_factura ? "Actualizar factura" : "Registrar factura"}
        cancelText="Cancelar"
        confirmLoading={saving}
        width={600}
      >
        {otSel && (
          <div>
            <div style={{ marginBottom: 12, padding: 10, background: brand.bgPage, borderRadius: 4 }}>
              <div style={{ fontSize: 12 }}>
                <b>Cliente:</b> {otSel.cliente ?? "—"}<br />
                <b>Guía remisión:</b> {otSel.guia_entrega_salida ?? "—"} (entregada el {otSel.fecha_entrega ? formatDateOnly(otSel.fecha_entrega) : "—"})<br />
                <b>Adjuntos:</b> {otSel.adjuntos.length} archivo(s)
              </div>
            </div>
            <Form form={form} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="nro_factura"
                    label="N° Factura"
                    rules={[{ required: true, message: "Número requerido" }]}
                  >
                    <Input placeholder="Ej: F001-12345" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="fecha_facturacion"
                    label="Fecha factura"
                    rules={[{ required: true, message: "Fecha requerida" }]}
                  >
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="monto" label="Monto facturado (opcional)">
                <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} />
              </Form.Item>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TablaFacturacionOT({
  columns, data, loading, page, pageSize, onPageChange,
}: {
  columns: ColumnsType<OTLista>;
  data: OTLista[];
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number, s: number) => void;
}) {
  const { columnas, components, TableDragWrapper } = useColumnasRedimensionables<OTLista>(
    columns, "facturacion-ot-v1",
  );
  return (
    <TableDragWrapper>
      <Table<OTLista>
        rowKey="id"
        size="small"
        columns={columnas}
        components={components}
        dataSource={data}
        loading={loading}
        pagination={paginacionEstandar({
          current: page,
          pageSize,
          total: data.length,
          onChange: onPageChange,
          label: "OT(s)",
        })}
        scroll={{ x: 1500 }}
        sticky={STICKY_HEADER}
      />
    </TableDragWrapper>
  );
}

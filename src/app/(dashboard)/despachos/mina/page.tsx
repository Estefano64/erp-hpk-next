"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Modal, Form, Input, DatePicker, App, Tooltip, Upload, message,
} from "antd";
import {
  ExportOutlined, ReloadOutlined, CheckCircleOutlined, EyeOutlined,
  FileTextOutlined, UploadOutlined, PaperClipOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { formatDateOnly } from "@/lib/dates";

const { Title, Text } = Typography;

interface OTLista {
  id: number;
  ot: string | null;
  descripcion: string | null;
  cliente: string | null;
  cliente_codigo: string | null;
  codigo_reparacion: string | null;
  fecha_recepcion: string | null;
  fecha_requerimiento_cliente: string | null;
  fecha_entrega: string | null;
  taller_status: string | null;
  guia_entrega_salida: string | null;
  nro_informe_entrega: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  ns: string | null;
  plaqueteo: string | null;
  items_count: number;
  adjuntos_despacho: Array<{ id: number; nombre_archivo: string; ruta: string; fecha_subida: string; tamano: number }>;
}

export default function DespachoMinaPage() {
  const { message: msg } = App.useApp();
  const router = useRouter();
  const [data, setData] = useState<OTLista[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [otSel, setOtSel] = useState<OTLista | null>(null);
  const [saving, setSaving] = useState(false);
  const [archivoGuia, setArchivoGuia] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<{
    guia_entrega_salida: string;
    fecha_entrega: Dayjs;
    nro_informe_entrega?: string;
    observaciones?: string;
  }>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/despachos/mina");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      msg.error("Error al cargar OTs listas para despacho");
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const abrirModal = (ot: OTLista) => {
    setOtSel(ot);
    setArchivoGuia([]);
    form.resetFields();
    form.setFieldsValue({
      guia_entrega_salida: ot.guia_entrega_salida ?? "",
      fecha_entrega: ot.fecha_entrega ? dayjs(ot.fecha_entrega) : dayjs(),
      nro_informe_entrega: ot.nro_informe_entrega ?? undefined,
    });
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    if (!otSel) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      // 1) Datos de la guía
      const res = await fetch(`/api/despachos/mina/${otSel.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guia_entrega_salida: values.guia_entrega_salida,
          fecha_entrega: values.fecha_entrega ? values.fecha_entrega.format("YYYY-MM-DD") : null,
          nro_informe_entrega: values.nro_informe_entrega ?? null,
          observaciones: values.observaciones ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");

      // 2) Subida opcional del archivo de guía (vía endpoint de adjuntos existente)
      if (archivoGuia.length > 0 && archivoGuia[0].originFileObj) {
        const fd = new FormData();
        fd.append("file", archivoGuia[0].originFileObj as File);
        fd.append("etapa", "despacho");
        const upRes = await fetch(`/api/ordenes-trabajo/${otSel.id}/adjuntos`, { method: "POST", body: fd });
        if (!upRes.ok) {
          const upErr = await upRes.json().catch(() => ({}));
          msg.warning(`Guía emitida, pero falló la subida del archivo: ${upErr.error ?? "error"}`);
        }
      }

      msg.success(json.message ?? "Guía emitida");
      setModalOpen(false);
      setOtSel(null);
      fetchData();
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const conGuia = data.filter((o) => o.guia_entrega_salida).length;
  const sinGuia = data.length - conGuia;

  const columns: ColumnsType<OTLista> = useMemo(() => [
    {
      key: "ot", title: "OT", width: 110, fixed: "left",
      render: (_v, r) => (
        <Tooltip title="Abrir OT">
          <Tag color={brand.navy} style={{ cursor: "pointer", margin: 0 }} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)}>
            {r.ot ?? `#${r.id}`}
          </Tag>
        </Tooltip>
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
      key: "ns", title: "N° Serie", width: 120,
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
      key: "items", title: "Items entreg.", width: 110, align: "center",
      render: (_v, r) => <Tag color={r.items_count > 0 ? "green" : "default"}>{r.items_count}</Tag>,
    },
    {
      key: "fecha_recepcion", title: "F. Recepción", width: 110,
      render: (_v, r) => r.fecha_recepcion ? formatDateOnly(r.fecha_recepcion) : "—",
    },
    {
      key: "guia", title: "N° Guía remisión", width: 160,
      render: (_v, r) => r.guia_entrega_salida
        ? <Tag color="blue" style={{ margin: 0 }}>{r.guia_entrega_salida}</Tag>
        : <Tag color="default">Pendiente</Tag>,
    },
    {
      key: "fecha_entrega", title: "F. Entrega", width: 110,
      render: (_v, r) => r.fecha_entrega ? formatDateOnly(r.fecha_entrega) : <Text type="secondary">—</Text>,
    },
    {
      key: "adjuntos", title: "Archivos", width: 100, align: "center",
      render: (_v, r) => r.adjuntos_despacho.length > 0
        ? <Tooltip title={r.adjuntos_despacho.map((a) => a.nombre_archivo).join(", ")}>
            <Tag icon={<PaperClipOutlined />} color="green">{r.adjuntos_despacho.length}</Tag>
          </Tooltip>
        : <Tag>—</Tag>,
    },
    {
      key: "acc", title: "Acciones", width: 200, fixed: "right",
      render: (_v, r) => (
        <Space size={4}>
          <Tooltip title="Ver OT">
            <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/ordenes-trabajo/${r.id}`)} />
          </Tooltip>
          <Button
            size="small"
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => abrirModal(r)}
          >
            {r.guia_entrega_salida ? "Editar guía" : "Generar guía"}
          </Button>
        </Space>
      ),
    },
  ], [router]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 8 }} />
          Despacho a mina — Guía de remisión por OT
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>Actualizar</Button>
      </div>

      <Card style={{ marginBottom: 12, background: "#f6ffed", borderColor: "#b7eb8f" }}>
        <Space size={8}>
          <CheckCircleOutlined style={{ color: "#52c41a" }} />
          <Text>
            OTs en estado <Tag color="orange">Terminado</Tag> listas para emitir guía de remisión al cliente.
            Una vez generada la guía, la OT pasa a <Tag color="blue">Entregado</Tag> y queda lista para facturación.
          </Text>
        </Space>
      </Card>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="OTs terminadas" value={data.length} styles={{ content: { color: brand.navy } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Con guía generada" value={conGuia} styles={{ content: { color: "#52c41a" } }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sin guía" value={sinGuia} styles={{ content: { color: sinGuia > 0 ? "#fa8c16" : "#bfbfbf" } }} /></Card></Col>
      </Row>

      {data.length === 0 && !loading ? (
        <Empty description="No hay OTs terminadas pendientes de despacho." />
      ) : (
        <Card>
          <Table<OTLista>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={data}
            loading={loading}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} OT(s)` }}
            scroll={{ x: 1400 }}
          />
        </Card>
      )}

      <Modal
        title={otSel ? `Guía de remisión — ${otSel.ot ?? `OT #${otSel.id}`}` : ""}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleGuardar}
        okText="Generar guía y marcar Entregado"
        cancelText="Cancelar"
        confirmLoading={saving}
        width={640}
      >
        {otSel && (
          <div>
            <div style={{ marginBottom: 12, padding: 10, background: brand.bgPage, borderRadius: 4 }}>
              <div style={{ fontSize: 12 }}>
                <b>Cliente:</b> {otSel.cliente ?? "—"}<br />
                <b>Código reparable:</b> {otSel.codigo_reparacion ?? "—"}<br />
                <b>N° Serie:</b> {otSel.ns ?? "—"} · <b>Plaqueteo:</b> {otSel.plaqueteo ?? "—"}<br />
                <b>Items entregados:</b> {otSel.items_count}
              </div>
            </div>
            <Form form={form} layout="vertical">
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="guia_entrega_salida"
                    label="N° Guía de remisión"
                    rules={[{ required: true, message: "Número requerido" }]}
                  >
                    <Input placeholder="Ej: GR-2026-0001" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="fecha_entrega"
                    label="Fecha de entrega"
                    rules={[{ required: true, message: "Fecha requerida" }]}
                  >
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="nro_informe_entrega" label="N° Informe de entrega (opcional)">
                <Input placeholder="Si corresponde" maxLength={100} />
              </Form.Item>
              <Form.Item label="Adjunto de la guía (opcional)">
                <Upload
                  beforeUpload={() => false}
                  fileList={archivoGuia}
                  onChange={({ fileList }) => setArchivoGuia(fileList.slice(-1))}
                  maxCount={1}
                  accept=".pdf,.jpg,.jpeg,.png"
                >
                  <Button icon={<UploadOutlined />}>Subir guía escaneada / firmada</Button>
                </Upload>
                <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
                  Se guarda como adjunto de la etapa “despacho” de la OT.
                </Text>
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Row, Col, Statistic, Empty,
  Modal, Form, Input, DatePicker, InputNumber, App, Tooltip, Alert, Upload,
  Divider, Spin, List,
} from "antd";
import {
  AuditOutlined, ReloadOutlined, FileDoneOutlined, EyeOutlined,
  WarningOutlined, PaperClipOutlined, CheckCircleOutlined, DownloadOutlined,
  UploadOutlined, FileTextOutlined, CarOutlined, CameraOutlined,
  SolutionOutlined, FolderOpenOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { formatDateOnly } from "@/lib/dates";
import { useColumnasRedimensionables, STICKY_HEADER, paginacionEstandar } from "@/lib/tables";
import { uploadToR2, openR2File } from "@/lib/r2-client";

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

// ── Adjuntos del modal — ETAPAS y meta visual.
interface AdjuntoCompleto {
  id: number;
  orden_trabajo_id: number;
  etapa_codigo: string;
  nombre_archivo: string;
  r2_key: string;
  tipo_mime: string;
  tamano: number;
  fecha_subida: string;
}

const ETAPAS_ADJ: Array<{ key: string; label: string; icon: React.ReactNode; color: string }> = [
  { key: "recepcion",   label: "Recepción y GR cliente", icon: <CameraOutlined />,      color: "#1677ff" },
  { key: "evaluacion",  label: "Evaluación",             icon: <FileTextOutlined />,    color: "#722ed1" },
  { key: "cotizacion",  label: "Cotización",             icon: <FileTextOutlined />,    color: "#fa8c16" },
  { key: "po_cliente",  label: "PO Cliente",             icon: <SolutionOutlined />,    color: "#13c2c2" },
  { key: "termino",     label: "Término de reparación",  icon: <CheckCircleOutlined />, color: "#52c41a" },
  { key: "despacho",    label: "Despacho y GR",          icon: <CarOutlined />,         color: "#eb2f96" },
  { key: "facturacion", label: "Facturación",            icon: <FileTextOutlined />,    color: "#1d6f42" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  // Adjuntos completos de la OT seleccionada (todas las etapas), cargados al
  // abrir el modal. Independientes del campo `adjuntos` (que solo trae despacho
  // + termino para el flag adjuntos_ok del listado).
  const [adjuntos, setAdjuntos] = useState<AdjuntoCompleto[]>([]);
  const [loadingAdj, setLoadingAdj] = useState(false);
  // Subida en curso por etapa (para feedback visual del botón).
  const [uploadingEtapa, setUploadingEtapa] = useState<string | null>(null);

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

  const fetchAdjuntos = useCallback(async (otId: number) => {
    setLoadingAdj(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${otId}/adjuntos`);
      if (!res.ok) throw new Error("Error");
      const json = await res.json();
      setAdjuntos((json.data ?? []) as AdjuntoCompleto[]);
    } catch {
      msg.error("No se pudieron cargar los adjuntos");
      setAdjuntos([]);
    } finally {
      setLoadingAdj(false);
    }
  }, [msg]);

  const abrirModal = (ot: OTLista) => {
    // El bloqueo por adjuntos faltantes solo aplica si NO se ha facturado aún
    // — la idea es que el modal sirva también para revisar adjuntos / subir
    // los que faltan, no solo para registrar el número de factura.
    setOtSel(ot);
    form.resetFields();
    form.setFieldsValue({
      nro_factura: ot.nro_factura ?? "",
      fecha_facturacion: ot.fecha_facturacion ? dayjs(ot.fecha_facturacion) : dayjs(),
      monto: ot.monto_cotizacion != null ? Number(ot.monto_cotizacion) : undefined,
    });
    setAdjuntos([]);
    setModalOpen(true);
    void fetchAdjuntos(ot.id);
  };

  // Subida directa a R2 + registro en BD. Se usa para Factura PDF (etapa
  // "facturacion") y Guía de remisión (etapa "despacho").
  const handleUpload = async (file: File, etapa: string): Promise<boolean> => {
    if (!otSel) return false;
    setUploadingEtapa(etapa);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/ordenes-trabajo/${otSel.id}/adjuntos/upload-url`,
        extra: { etapa },
      });
      const res = await fetch(`/api/ordenes-trabajo/${otSel.id}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...meta, etapa }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "No se pudo registrar el adjunto");
      }
      msg.success(`${file.name} subido (${etapa})`);
      await fetchAdjuntos(otSel.id);
      // El indicador "adjuntos_ok" del listado depende del backend — refrescar
      // la grilla principal para que el botón "Facturar" se habilite.
      fetchData();
      return true;
    } catch (e) {
      msg.error(e instanceof Error ? e.message : "Error al subir archivo");
      return false;
    } finally {
      setUploadingEtapa(null);
    }
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
          <Tooltip title={r.adjuntos_ok ? "Abrir factura + adjuntos" : `Adjuntos faltantes: ${r.faltantes.join(", ")}. Podés subirlos desde la ventana.`}>
            <Button
              size="small"
              type="primary"
              icon={<FileDoneOutlined />}
              onClick={() => abrirModal(r)}
            >
              {r.nro_factura ? "Editar factura" : (r.adjuntos_ok ? "Facturar" : "Adjuntar y facturar")}
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
        title={otSel ? `Factura y adjuntos — ${otSel.ot ?? `OT #${otSel.id}`}` : ""}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleGuardar}
        okText={otSel?.nro_factura ? "Actualizar factura" : "Registrar factura"}
        cancelText="Cerrar"
        confirmLoading={saving}
        okButtonProps={{ disabled: !!(otSel && !otSel.adjuntos_ok) }}
        width={860}
        destroyOnHidden
      >
        {otSel && (
          <div>
            <div style={{ marginBottom: 12, padding: 10, background: brand.bgPage, borderRadius: 4 }}>
              <div style={{ fontSize: 12 }}>
                <b>Cliente:</b> {otSel.cliente ?? "—"}<br />
                <b>Guía remisión:</b> {otSel.guia_entrega_salida ?? "—"} (entregada el {otSel.fecha_entrega ? formatDateOnly(otSel.fecha_entrega) : "—"})<br />
              </div>
            </div>

            {!otSel.adjuntos_ok && (
              <Alert
                showIcon
                type="warning"
                style={{ marginBottom: 12 }}
                title="Faltan adjuntos para poder facturar"
                description={`Faltantes: ${otSel.faltantes.join(", ")}. Subilos desde la sección "Subir archivo a esta OT" más abajo. Una vez completos, el botón "Registrar factura" se habilita.`}
              />
            )}

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
              <Form.Item name="monto" label="Monto facturado">
                <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} />
              </Form.Item>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
            </Form>

            <Divider titlePlacement="start">
              <Space size={4}>
                <UploadOutlined />
                <span>Subir archivo a esta OT</span>
              </Space>
            </Divider>

            <Space wrap style={{ marginBottom: 12 }}>
              <Upload
                accept="application/pdf,image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file, "facturacion");
                  return false;
                }}
                disabled={uploadingEtapa !== null}
              >
                <Button
                  icon={<UploadOutlined />}
                  type="primary"
                  loading={uploadingEtapa === "facturacion"}
                  style={{ background: "#1d6f42", borderColor: "#1d6f42" }}
                >
                  Subir factura (PDF)
                </Button>
              </Upload>
              <Upload
                accept="application/pdf,image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file, "despacho");
                  return false;
                }}
                disabled={uploadingEtapa !== null}
              >
                <Button
                  icon={<UploadOutlined />}
                  loading={uploadingEtapa === "despacho"}
                >
                  Subir guía de remisión
                </Button>
              </Upload>
              <Text type="secondary" style={{ fontSize: 11 }}>
                La factura se guarda en la etapa <b>Facturación</b>. La guía firmada va a <b>Despacho</b> (la requiere el bloqueo de facturación).
              </Text>
            </Space>

            <Divider titlePlacement="start">
              <Space size={4}>
                <FolderOpenOutlined />
                <span>Adjuntos de la OT por categoría</span>
              </Space>
            </Divider>

            {loadingAdj ? (
              <div style={{ textAlign: "center", padding: 16 }}><Spin /></div>
            ) : adjuntos.length === 0 ? (
              <Empty description="Esta OT todavía no tiene adjuntos." />
            ) : (
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {ETAPAS_ADJ.map((et) => {
                  const items = adjuntos.filter((a) => a.etapa_codigo === et.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={et.key} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 10px", background: brand.bgPage, borderRadius: 4,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ color: et.color }}>{et.icon}</span>
                        <Text strong style={{ fontSize: 13 }}>{et.label}</Text>
                        <Tag color="blue" style={{ marginLeft: "auto" }}>{items.length}</Tag>
                      </div>
                      <List<AdjuntoCompleto>
                        size="small"
                        bordered
                        dataSource={items}
                        renderItem={(a) => (
                          <List.Item
                            actions={[
                              <Button
                                key="dl"
                                size="small"
                                type="link"
                                icon={<DownloadOutlined />}
                                onClick={() =>
                                  openR2File({
                                    key: a.r2_key,
                                    resource: "ot-adjunto",
                                    resourceId: a.orden_trabajo_id,
                                  }).catch((e) => msg.error(e instanceof Error ? e.message : "Error al descargar"))
                                }
                              >
                                Descargar
                              </Button>,
                            ]}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.nombre_archivo}
                              </div>
                              <div style={{ fontSize: 11, color: brand.textSecondary }}>
                                {formatFileSize(a.tamano)} · {formatDateOnly(a.fecha_subida)}
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
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

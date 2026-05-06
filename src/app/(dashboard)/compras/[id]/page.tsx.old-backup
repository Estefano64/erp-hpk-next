"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Typography, Card, Descriptions, Tag, Button, Space, Table, Modal, Form,
  Input, InputNumber, Select, DatePicker, message, Popconfirm, Row, Col, Alert, Spin,
} from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";

interface Material {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
}

interface Detalle {
  id: number;
  material_id: number;
  material: Material;
  cantidad: string;
  cantidad_en_transito: string | null;
  cantidad_recibida: string | null;
  precio_unitario: string;
  subtotal: string;
  descuento: string | null;
  impuesto: string | null;
  total: string;
  status_oc_codigo: string | null;
  status_oc: { codigo: string; nombre: string } | null;
  observaciones: string | null;
}

interface Compra {
  id: number;
  numero_po: string;
  numero_req: string | null;
  proveedor: { id: number; ruc: string; razon_social: string; nombre_comercial: string | null };
  status_oc: { codigo: string; nombre: string } | null;
  status_oc_codigo: string | null;
  moneda: { codigo: string; nombre: string } | null;
  moneda_codigo: string | null;
  ubicacion: { codigo: string; nombre: string } | null;
  ubicacion_codigo: string | null;
  orden_trabajo: { id: number; ot: string | null; descripcion: string | null } | null;
  ot_id: number | null;
  fecha_solicitud: string;
  fecha_entrega_esperada: string | null;
  fecha_entrega_real: string | null;
  subtotal: string;
  impuesto: string;
  total: string;
  nro_factura: string | null;
  nro_guia: string | null;
  observaciones: string | null;
  detalles: Detalle[];
}

const STATUS_COLORS: Record<string, string> = {
  PEND_OC: "default", PROCESO: "processing", ENTREGADO: "cyan",
  INCOMPLETO: "orange", COMPLETO: "success", ANULADO: "error", DEVOLUCION: "volcano",
};

const STATUS_OPTIONS = [
  { value: "PEND_OC", label: "Pendiente de OC" },
  { value: "PROCESO", label: "En proceso" },
  { value: "ENTREGADO", label: "Entregado" },
  { value: "INCOMPLETO", label: "Incompleto" },
  { value: "COMPLETO", label: "Completo" },
  { value: "ANULADO", label: "Anulado" },
  { value: "DEVOLUCION", label: "Devolución" },
];

export default function CompraDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const id = Number(params?.id);

  const [compra, setCompra] = useState<Compra | null>(null);
  const [loading, setLoading] = useState(true);
  const [editHeader, setEditHeader] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerForm] = Form.useForm();

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<Detalle | null>(null);
  const [lineForm] = Form.useForm();
  const [savingLine, setSavingLine] = useState(false);

  const [materialSearch, setMaterialSearch] = useState("");
  const [materialOptions, setMaterialOptions] = useState<Material[]>([]);

  const [recepcionOpen, setRecepcionOpen] = useState(false);
  const [recepcionForm] = Form.useForm();
  const [savingRecepcion, setSavingRecepcion] = useState(false);
  const [recepcionLineas, setRecepcionLineas] = useState<Record<number, number>>({});

  const [messageApi, contextHolder] = message.useMessage();

  const fetchCompra = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/compras/${id}`);
    if (res.ok) {
      const json = await res.json();
      setCompra(json.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchCompra(); }, [fetchCompra]);

  // Búsqueda de materiales (debounced manualmente)
  useEffect(() => {
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (materialSearch.trim()) params.set("search", materialSearch.trim());
      const res = await fetch(`/api/materiales?${params}`);
      const json = await res.json();
      setMaterialOptions(json.data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [materialSearch]);

  function openHeaderEdit() {
    if (!compra) return;
    headerForm.setFieldsValue({
      numero_po: compra.numero_po,
      numero_req: compra.numero_req,
      status_oc_codigo: compra.status_oc_codigo,
      moneda_codigo: compra.moneda_codigo,
      fecha_solicitud: compra.fecha_solicitud ? dayjs(compra.fecha_solicitud) : null,
      fecha_entrega_esperada: compra.fecha_entrega_esperada ? dayjs(compra.fecha_entrega_esperada) : null,
      fecha_entrega_real: compra.fecha_entrega_real ? dayjs(compra.fecha_entrega_real) : null,
      nro_guia: compra.nro_guia,
      nro_factura: compra.nro_factura,
      observaciones: compra.observaciones,
    });
    setEditHeader(true);
  }

  async function saveHeader() {
    if (!compra) return;
    try {
      const values = await headerForm.validateFields();
      setSavingHeader(true);
      const body = {
        ...values,
        fecha_solicitud: values.fecha_solicitud ? values.fecha_solicitud.toISOString() : null,
        fecha_entrega_esperada: values.fecha_entrega_esperada ? values.fecha_entrega_esperada.toISOString() : null,
        fecha_entrega_real: values.fecha_entrega_real ? values.fecha_entrega_real.toISOString() : null,
      };
      const res = await fetch(`/api/compras/${compra.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al actualizar");
      }
      messageApi.success("Cabecera actualizada");
      setEditHeader(false);
      fetchCompra();
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingHeader(false);
    }
  }

  function openAddLine() {
    setEditingLine(null);
    lineForm.resetFields();
    lineForm.setFieldsValue({ cantidad: 1, precio_unitario: 0, descuento: 0, impuesto: 0 });
    setLineModalOpen(true);
  }

  function openEditLine(det: Detalle) {
    setEditingLine(det);
    lineForm.setFieldsValue({
      material_id: det.material_id,
      cantidad: Number(det.cantidad),
      precio_unitario: Number(det.precio_unitario),
      descuento: Number(det.descuento ?? 0),
      impuesto: Number(det.impuesto ?? 0),
      status_oc_codigo: det.status_oc_codigo,
      observaciones: det.observaciones,
    });
    // Asegurar que el material editado esté en las opciones
    setMaterialOptions((prev) => {
      if (prev.some((m) => m.material_id === det.material_id)) return prev;
      return [det.material, ...prev];
    });
    setLineModalOpen(true);
  }

  async function saveLine() {
    if (!compra) return;
    try {
      const values = await lineForm.validateFields();
      setSavingLine(true);
      const url = editingLine
        ? `/api/compras/${compra.id}/detalles/${editingLine.id}`
        : `/api/compras/${compra.id}/detalles`;
      const res = await fetch(url, {
        method: editingLine ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      messageApi.success(editingLine ? "Línea actualizada" : "Línea agregada");
      setLineModalOpen(false);
      fetchCompra();
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar línea");
    } finally {
      setSavingLine(false);
    }
  }

  async function deleteLine(detId: number) {
    if (!compra) return;
    const res = await fetch(`/api/compras/${compra.id}/detalles/${detId}`, { method: "DELETE" });
    if (res.ok) {
      messageApi.success("Línea eliminada");
      fetchCompra();
      return;
    }
    const body = await res.json().catch(() => null);
    messageApi.error(body?.error ?? "Error al eliminar");
  }

  function openRecepcion() {
    if (!compra) return;
    const inicial: Record<number, number> = {};
    for (const d of compra.detalles) {
      const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida ?? 0);
      inicial[d.id] = Math.max(0, Number(pendiente.toFixed(4)));
    }
    setRecepcionLineas(inicial);
    recepcionForm.resetFields();
    recepcionForm.setFieldsValue({ fecha_recepcion: dayjs(), nro_guia: compra.nro_guia ?? "" });
    setRecepcionOpen(true);
  }

  async function confirmarRecepcion() {
    if (!compra) return;
    try {
      const values = await recepcionForm.validateFields();
      const lineas = Object.entries(recepcionLineas)
        .filter(([, cant]) => Number(cant) > 0)
        .map(([detId, cant]) => ({ detalle_id: Number(detId), cantidad_llegada: Number(cant) }));
      if (lineas.length === 0) {
        messageApi.warning("Asigná cantidad a al menos una línea");
        return;
      }
      setSavingRecepcion(true);
      const body = {
        lineas,
        nro_guia: values.nro_guia || null,
        fecha_recepcion: values.fecha_recepcion ? values.fecha_recepcion.toISOString() : null,
        observacion: values.observacion || null,
      };
      const res = await fetch(`/api/compras/${compra.id}/recepcion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      const json = await res.json();
      messageApi.success(`Recepción registrada. Nuevo estado: ${json.nuevo_estado}`);
      setRecepcionOpen(false);
      fetchCompra();
    } catch (e: unknown) {
      messageApi.error(e instanceof Error ? e.message : "Error en recepción");
    } finally {
      setSavingRecepcion(false);
    }
  }

  if (loading) return <Spin size="large" />;
  if (!compra) return <Alert type="error" title="Compra no encontrada" />;

  const isAnulada = compra.status_oc?.codigo === "ANULADO";
  const moneda = compra.moneda?.codigo ?? "";

  const lineColumns: ColumnsType<Detalle> = [
    {
      title: "Material",
      key: "material",
      ellipsis: true,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.material.descripcion}</div>
          <div style={{ fontSize: 11, color: brand.textSecondary }}>
            {r.material.codigo} · NP: {r.material.np ?? "-"}
          </div>
        </div>
      ),
    },
    { title: "Cant", dataIndex: "cantidad", width: 80, align: "right", render: (v: string) => Number(v).toFixed(2) },
    {
      title: "En tránsito",
      dataIndex: "cantidad_en_transito",
      width: 90,
      align: "right",
      render: (v: string | null) => Number(v ?? 0).toFixed(2),
    },
    {
      title: "Recibido",
      dataIndex: "cantidad_recibida",
      width: 90,
      align: "right",
      render: (v: string | null) => {
        const n = Number(v ?? 0);
        return <Tag color={n > 0 ? "success" : "default"}>{n.toFixed(2)}</Tag>;
      },
    },
    { title: "P.U.", dataIndex: "precio_unitario", width: 100, align: "right", render: (v: string) => Number(v).toFixed(4) },
    { title: "Subtotal", dataIndex: "subtotal", width: 100, align: "right", render: (v: string) => Number(v).toFixed(2) },
    { title: "Total", dataIndex: "total", width: 100, align: "right", render: (v: string) => `${moneda} ${Number(v).toFixed(2)}` },
    {
      title: "",
      key: "acc",
      width: 80,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditLine(r)} disabled={isAnulada} />
          <Popconfirm
            title="¿Eliminar línea?"
            onConfirm={() => deleteLine(r.id)}
            disabled={isAnulada || Number(r.cantidad_recibida ?? 0) > 0}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={isAnulada || Number(r.cantidad_recibida ?? 0) > 0}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/compras")}>Volver</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Compra <Tag color={brand.navy} style={{ marginLeft: 8 }}>{compra.numero_po}</Tag>
        </Typography.Title>
        {compra.status_oc && (
          <Tag color={STATUS_COLORS[compra.status_oc.codigo] ?? "default"}>{compra.status_oc.nombre}</Tag>
        )}
      </Space>

      {isAnulada && (
        <Alert type="warning" showIcon title="Esta compra está anulada. Solo lectura." style={{ marginBottom: 16 }} />
      )}

      {/* Cabecera */}
      <Card
        title="Información general"
        extra={
          !editHeader && !isAnulada ? (
            <Button icon={<EditOutlined />} onClick={openHeaderEdit}>Editar</Button>
          ) : editHeader ? (
            <Space>
              <Button onClick={() => setEditHeader(false)}>Cancelar</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={savingHeader} onClick={saveHeader}>Guardar</Button>
            </Space>
          ) : null
        }
        style={{ marginBottom: 16 }}
      >
        {!editHeader ? (
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="Proveedor">
              {compra.proveedor.nombre_comercial ?? compra.proveedor.razon_social}
              <div style={{ fontSize: 11, color: brand.textSecondary }}>RUC: {compra.proveedor.ruc}</div>
            </Descriptions.Item>
            <Descriptions.Item label="Número Req">{compra.numero_req ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="OT">{compra.orden_trabajo?.ot ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Fecha Solicitud">{dayjs(compra.fecha_solicitud).format("DD/MM/YYYY")}</Descriptions.Item>
            <Descriptions.Item label="Entrega Esperada">
              {compra.fecha_entrega_esperada ? dayjs(compra.fecha_entrega_esperada).format("DD/MM/YYYY") : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Entrega Real">
              {compra.fecha_entrega_real ? dayjs(compra.fecha_entrega_real).format("DD/MM/YYYY") : "-"}
            </Descriptions.Item>
            <Descriptions.Item label="Moneda">{compra.moneda?.nombre ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Nro Guía">{compra.nro_guia ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Nro Factura">{compra.nro_factura ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="Observaciones" span={3}>{compra.observaciones ?? "-"}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={headerForm} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="numero_po" label="Número PO" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="numero_req" label="Número Req">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="status_oc_codigo" label="Estado OC">
                  <Select options={STATUS_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="fecha_solicitud" label="Fecha Solicitud" rules={[{ required: true }]}>
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="fecha_entrega_esperada" label="Entrega Esperada">
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="fecha_entrega_real" label="Entrega Real">
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="moneda_codigo" label="Moneda">
                  <Select options={[{ value: "USD", label: "Dólar" }, { value: "SOL", label: "Sol" }]} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="nro_guia" label="Nro Guía">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="nro_factura" label="Nro Factura">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="observaciones" label="Observaciones">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </Card>

      {/* Líneas */}
      <Card
        title={`Líneas (${compra.detalles.length})`}
        extra={
          <Space>
            <Button
              icon={<InboxOutlined />}
              disabled={
                isAnulada ||
                compra.detalles.length === 0 ||
                !compra.status_oc ||
                !["PROCESO", "ENTREGADO", "INCOMPLETO"].includes(compra.status_oc.codigo)
              }
              onClick={openRecepcion}
            >
              Marcar recepción
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddLine} disabled={isAnulada}>
              Agregar línea
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          columns={lineColumns}
          dataSource={compra.detalles}
          pagination={false}
          scroll={{ x: 800 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5}><strong>Totales</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <strong>Subtotal: {moneda} {Number(compra.subtotal).toFixed(2)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                Imp: {moneda} {Number(compra.impuesto).toFixed(2)}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <strong style={{ color: brand.navy }}>Total: {moneda} {Number(compra.total).toFixed(2)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
            </Table.Summary.Row>
          )}
        />
      </Card>

      {/* Modal de línea */}
      <Modal
        title={editingLine ? "Editar línea" : "Agregar línea"}
        open={lineModalOpen}
        onCancel={() => setLineModalOpen(false)}
        onOk={saveLine}
        confirmLoading={savingLine}
        width={680}
        destroyOnHidden
      >
        <Form form={lineForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="material_id" label="Material" rules={[{ required: true, message: "Requerido" }]}>
            <Select
              showSearch
              placeholder="Buscar por código, descripción o NP…"
              filterOption={false}
              onSearch={setMaterialSearch}
              options={materialOptions.map((m) => ({
                value: m.material_id,
                label: `${m.codigo} — ${m.descripcion}${m.np ? ` [${m.np}]` : ""}`,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={0.0001} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="precio_unitario" label="Precio Unitario" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status_oc_codigo" label="Estado (línea)">
                <Select allowClear options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="descuento" label="Descuento">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="impuesto" label="Impuesto">
                <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          {editingLine && Number(editingLine.cantidad_recibida ?? 0) > 0 && (
            <Alert
              type="warning"
              showIcon
              title={`Esta línea tiene ${editingLine.cantidad_recibida} ya recibido — no se puede cambiar material ni cantidad.`}
            />
          )}
        </Form>
      </Modal>
      {isAdminUser && <span />}

      {/* Modal de recepción */}
      <Modal
        title={`Recepción de mercadería — PO ${compra.numero_po}`}
        open={recepcionOpen}
        onCancel={() => setRecepcionOpen(false)}
        onOk={confirmarRecepcion}
        confirmLoading={savingRecepcion}
        okText="Confirmar recepción"
        width={900}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          title="Revisá que las cantidades que recibiste coincidan con la guía del proveedor."
          description="Podés recibir parcialmente — las líneas con 0 se saltean. El estado pasa a ENTREGADO si todo llega completo, o INCOMPLETO si queda algo pendiente."
          style={{ marginBottom: 16 }}
        />
        <Form form={recepcionForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="fecha_recepcion" label="Fecha de recepción" rules={[{ required: true }]}>
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="nro_guia" label="Nro Guía del proveedor">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="observacion" label="Observación">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={compra.detalles.filter((d) => {
            const pend = Number(d.cantidad) - Number(d.cantidad_recibida ?? 0);
            return pend > 0;
          })}
          columns={[
            {
              title: "Material",
              key: "material",
              ellipsis: true,
              render: (_, r: Detalle) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{r.material.descripcion}</div>
                  <div style={{ fontSize: 11, color: brand.textSecondary }}>
                    {r.material.codigo} · NP: {r.material.np ?? "-"}
                  </div>
                </div>
              ),
            },
            { title: "Pedido", dataIndex: "cantidad", width: 80, align: "right", render: (v: string) => Number(v).toFixed(2) },
            {
              title: "Ya recibido",
              dataIndex: "cantidad_recibida",
              width: 95,
              align: "right",
              render: (v: string | null) => Number(v ?? 0).toFixed(2),
            },
            {
              title: "Pendiente",
              key: "pend",
              width: 95,
              align: "right",
              render: (_, r: Detalle) => {
                const p = Number(r.cantidad) - Number(r.cantidad_recibida ?? 0);
                return <strong>{p.toFixed(2)}</strong>;
              },
            },
            {
              title: "Llega ahora",
              key: "llega",
              width: 130,
              align: "right",
              render: (_, r: Detalle) => {
                const max = Number(r.cantidad) - Number(r.cantidad_recibida ?? 0);
                return (
                  <InputNumber
                    min={0}
                    max={max}
                    step={0.01}
                    value={recepcionLineas[r.id] ?? 0}
                    onChange={(v) => setRecepcionLineas((prev) => ({ ...prev, [r.id]: Number(v ?? 0) }))}
                    style={{ width: "100%" }}
                  />
                );
              },
            },
          ]}
        />
      </Modal>
    </div>
  );
}

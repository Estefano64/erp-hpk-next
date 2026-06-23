"use client";

// Editor de una OC abierta. Permite ajustar:
//   - Header: nombre (display), proveedor, fechas (emisión, expiración),
//     moneda, tipo de pago, observaciones.
//   - Ítems (cantidad, precio unitario, NP del material, descripción).
//   - Agregar nuevos ítems / eliminar ítems sin consumo.
//
// Usa los endpoints existentes:
//   PUT  /api/compras/[id]                       → header
//   POST /api/compras/[id]/detalles              → nuevo ítem
//   PUT  /api/compras/[id]/detalles/[detId]      → editar ítem (cantidad, precio)
//   DELETE /api/compras/[id]/detalles/[detId]    → borrar ítem
//   PATCH /api/materiales/[id]                   → editar NP / descripción del material

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Table, Tag, Space, Button, Input, InputNumber, Select,
  DatePicker, App, Row, Col, Form, Spin, Popconfirm, Tooltip, Divider,
} from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, SaveOutlined, PlusOutlined,
  DeleteOutlined, FolderOpenOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { brand } from "@/lib/theme";
import { STICKY_HEADER } from "@/lib/tables";

const { Title, Text } = Typography;

interface Proveedor {
  id: number;
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string | null;
}

interface Material {
  material_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
  unidad_medida_codigo: string;
  precio: string | number | null;
  moneda_codigo: string | null;
}

interface DetalleRow {
  id: number;
  material_id: number;
  cantidad: number;
  cantidad_recibida: number;
  precio_unitario: number;
  subtotal: number;
  material: { material_id?: number; codigo: string; descripcion: string; np: string | null };
}

interface CompraDetalle {
  id: number;
  numero_po: string;
  nombre: string | null;
  proveedor: { id: number; razonSocial: string; ruc: string | null } | null;
  fecha_solicitud: string | null;
  fecha_expiracion?: string | null;
  fecha_entrega_esperada: string | null;
  status_oc_codigo: string | null;
  moneda: string;
  tipo_pago: string | null;
  dias_credito: number | null;
  total: number | string;
  observaciones: string | null;
  detalles: DetalleRow[];
}

export default function OCAbiertaEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const compraId = Number(params?.id);

  const [data, setData] = useState<CompraDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingHeader, setSavingHeader] = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [materiales, setMateriales] = useState<Material[]>([]);
  // Borradores por línea para editar en lote (se aplican al hacer click en
  // "Guardar" de la fila). Indexado por detalle.id.
  const [drafts, setDrafts] = useState<Record<number, {
    cantidad?: number;
    precio_unitario?: number;
    np?: string;
    descripcion?: string;
  }>>({});
  const [savingDet, setSavingDet] = useState<number | null>(null);

  // Header en estado controlado para edición.
  const [headerForm] = Form.useForm<{
    nombre?: string;
    numero_po?: string;
    proveedor_id?: number;
    fecha_solicitud?: Dayjs | null;
    fecha_expiracion?: Dayjs | null;
    moneda?: string;
    tipo_pago?: string;
    dias_credito?: number;
    observaciones?: string;
  }>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compras/${compraId}`);
      if (!res.ok) {
        message.error("OC no encontrada");
        return;
      }
      const j = await res.json();
      const d = j.data as CompraDetalle;
      setData(d);
      headerForm.setFieldsValue({
        nombre: d.nombre ?? undefined,
        numero_po: d.numero_po,
        proveedor_id: d.proveedor?.id,
        fecha_solicitud: d.fecha_solicitud ? dayjs(d.fecha_solicitud) : null,
        fecha_expiracion: d.fecha_expiracion ? dayjs(d.fecha_expiracion) : null,
        moneda: d.moneda,
        tipo_pago: d.tipo_pago ?? undefined,
        dias_credito: d.dias_credito ?? undefined,
        observaciones: d.observaciones ?? undefined,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [compraId, message, headerForm]);

  useEffect(() => {
    if (compraId > 0) fetchData();
  }, [compraId, fetchData]);

  // Catálogos: proveedores + materiales (para el Select de "agregar item").
  useEffect(() => {
    (async () => {
      const [provRes, matRes] = await Promise.all([
        fetch("/api/proveedores?limit=10000"),
        fetch("/api/materiales?limit=10000"),
      ]);
      if (provRes.ok) {
        const j = await provRes.json();
        setProveedores(j.data ?? []);
      }
      if (matRes.ok) {
        const j = await matRes.json();
        setMateriales(j.data ?? []);
      }
    })();
  }, []);

  const guardarHeader = async () => {
    try {
      const values = await headerForm.validateFields();
      setSavingHeader(true);
      const body: Record<string, unknown> = {
        nombre: values.nombre || null,
        numero_po: values.numero_po,
        proveedor_id: values.proveedor_id,
        moneda: values.moneda,
        tipo_pago: values.tipo_pago,
        dias_credito: values.dias_credito ?? null,
        observaciones: values.observaciones || null,
        fecha_solicitud: values.fecha_solicitud ? values.fecha_solicitud.format("YYYY-MM-DD") : null,
        fecha_expiracion: values.fecha_expiracion ? values.fecha_expiracion.format("YYYY-MM-DD") : null,
      };
      const res = await fetch(`/api/compras/${compraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Error al guardar header");
      message.success("Header actualizado");
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingHeader(false);
    }
  };

  // Setea el draft de una fila. No persiste hasta que se haga click en Guardar.
  const setDraft = (detId: number, patch: Partial<{ cantidad: number; precio_unitario: number; np: string; descripcion: string }>) => {
    setDrafts((prev) => ({ ...prev, [detId]: { ...prev[detId], ...patch } }));
  };

  // Aplica los cambios del draft de la fila — cantidad/precio van al detalle,
  // np/descripcion al material asociado. Si no hubo cambio en algún campo,
  // se omite el call para no triggerar un audit innecesario.
  const guardarFila = async (det: DetalleRow) => {
    const draft = drafts[det.id];
    if (!draft) return;
    setSavingDet(det.id);
    try {
      // 1) Detalle (cantidad / precio_unitario)
      const cambiosDetalle: Record<string, unknown> = {};
      if (draft.cantidad !== undefined && draft.cantidad !== det.cantidad) cambiosDetalle.cantidad = draft.cantidad;
      if (draft.precio_unitario !== undefined && draft.precio_unitario !== det.precio_unitario) cambiosDetalle.precio_unitario = draft.precio_unitario;
      if (Object.keys(cambiosDetalle).length > 0) {
        const r1 = await fetch(`/api/compras/${compraId}/detalles/${det.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cambiosDetalle),
        });
        const j1 = await r1.json().catch(() => ({}));
        if (!r1.ok) throw new Error(j1.error || "Error en detalle");
      }
      // 2) Material (np / descripcion)
      const cambiosMat: Record<string, unknown> = {};
      if (draft.np !== undefined && draft.np !== (det.material.np ?? "")) cambiosMat.np = draft.np;
      if (draft.descripcion !== undefined && draft.descripcion !== det.material.descripcion) cambiosMat.descripcion = draft.descripcion;
      if (Object.keys(cambiosMat).length > 0) {
        const r2 = await fetch(`/api/materiales/${det.material_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cambiosMat),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok) throw new Error(j2.error || "Error en material");
      }
      message.success("Fila guardada");
      setDrafts((prev) => { const n = { ...prev }; delete n[det.id]; return n; });
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingDet(null);
    }
  };

  const eliminarFila = async (det: DetalleRow) => {
    if (Number(det.cantidad_recibida ?? 0) > 0) {
      message.warning("No se puede borrar una fila con recepción registrada.");
      return;
    }
    try {
      const res = await fetch(`/api/compras/${compraId}/detalles/${det.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Error al borrar");
      message.success("Fila eliminada");
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  };

  const agregarFila = async (material_id: number) => {
    try {
      const res = await fetch(`/api/compras/${compraId}/detalles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_id,
          cantidad: 1,
          precio_unitario: 0,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Error al agregar");
      message.success("Ítem agregado");
      fetchData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error");
    }
  };

  if (loading) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}><Spin /></div></Card>;
  }
  if (!data) {
    return <Card><div style={{ padding: 40, textAlign: "center" }}>OC no encontrada</div></Card>;
  }

  const columns: ColumnsType<DetalleRow> = [
    {
      key: "n", title: "#", width: 50, align: "right",
      render: (_v, _r, i) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      key: "material_codigo", title: "Código mat.", width: 110,
      render: (_v, r) => <Tag style={{ fontFamily: "monospace", margin: 0 }}>{r.material.codigo}</Tag>,
    },
    {
      key: "np", title: "NP", width: 180,
      render: (_v, r) => (
        <Input
          size="small"
          defaultValue={r.material.np ?? ""}
          placeholder="N° parte"
          onChange={(e) => setDraft(r.id, { np: e.target.value })}
          style={{ fontFamily: "monospace" }}
        />
      ),
    },
    {
      key: "descripcion", title: "Descripción", ellipsis: true,
      render: (_v, r) => (
        <Input
          size="small"
          defaultValue={r.material.descripcion}
          onChange={(e) => setDraft(r.id, { descripcion: e.target.value })}
        />
      ),
    },
    {
      key: "cantidad", title: "Cant.", width: 90, align: "right",
      render: (_v, r) => (
        <InputNumber
          size="small"
          min={0.01}
          step={1}
          defaultValue={r.cantidad}
          onChange={(v) => setDraft(r.id, { cantidad: Number(v ?? 0) })}
          disabled={Number(r.cantidad_recibida ?? 0) > 0}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      key: "consumido", title: "Consumido", width: 100, align: "right",
      render: (_v, r) => (
        <Text type={r.cantidad_recibida > 0 ? "warning" : "secondary"}>
          {r.cantidad_recibida.toLocaleString()}
        </Text>
      ),
    },
    {
      key: "stock", title: "Stock disp.", width: 100, align: "right",
      render: (_v, r) => {
        const stock = Math.max(0, r.cantidad - r.cantidad_recibida);
        return <Text strong style={{ color: stock > 0 ? "#52c41a" : brand.textSecondary }}>{stock.toLocaleString()}</Text>;
      },
    },
    {
      key: "precio_unitario", title: "Precio unit.", width: 120, align: "right",
      render: (_v, r) => (
        <InputNumber
          size="small"
          min={0}
          step={0.01}
          defaultValue={r.precio_unitario}
          onChange={(v) => setDraft(r.id, { precio_unitario: Number(v ?? 0) })}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      key: "subtotal", title: "Subtotal", width: 120, align: "right",
      render: (_v, r) => (
        <Text strong>
          {data.moneda} {Number(r.subtotal).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      key: "acciones", title: "", width: 130, fixed: "right",
      render: (_v, r) => {
        const tieneDraft = drafts[r.id] && Object.keys(drafts[r.id]).length > 0;
        return (
          <Space size={4}>
            <Tooltip title={tieneDraft ? "Guardar cambios de esta fila" : "Sin cambios"}>
              <Button
                size="small"
                type="primary"
                icon={<SaveOutlined />}
                disabled={!tieneDraft}
                loading={savingDet === r.id}
                onClick={() => guardarFila(r)}
              />
            </Tooltip>
            <Popconfirm
              title={`¿Eliminar la fila de ${r.material.codigo}?`}
              onConfirm={() => eliminarFila(r)}
              okType="danger"
              okText="Eliminar"
              cancelText="Cancelar"
              disabled={Number(r.cantidad_recibida ?? 0) > 0}
            >
              <Tooltip title={Number(r.cantidad_recibida ?? 0) > 0 ? "No se puede borrar — ya tiene consumo" : "Borrar fila"}>
                <Button
                  size="small"
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  disabled={Number(r.cantidad_recibida ?? 0) > 0}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // Para el Select de "agregar nuevo ítem" mostramos los materiales no presentes
  // ya en los detalles (evita duplicación accidental).
  const idsPresentes = new Set(data.detalles.map((d) => d.material_id));
  const materialesParaAgregar = materiales.filter((m) => !idsPresentes.has(m.material_id));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/compras/oc-abiertas")}>
            Volver
          </Button>
          <Title level={4} style={{ margin: 0, color: brand.navy }}>
            <FolderOpenOutlined style={{ marginRight: 8 }} />
            OC abierta {data.numero_po}
          </Title>
          <Tag color="blue">{data.status_oc_codigo}</Tag>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
      </div>

      {/* Card Header editable */}
      <Card title="Datos de la OC" size="small" style={{ marginBottom: 12 }}>
        <Form form={headerForm} layout="vertical" size="small">
          <Row gutter={[12, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="numero_po" label="Nro OC" rules={[{ required: true, message: "Requerido" }]}>
                <Input placeholder="M260033" />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item
                name="nombre"
                label="Nombre / Fuente (display en módulo de OC abiertas)"
                tooltip="Ej. 'BC BEARING — OC Abierta M260033'. Si se carga, prevalece sobre el proveedor de la BD para el display."
              >
                <Input placeholder="BC BEARING — OC Abierta M260033" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="proveedor_id" label="Proveedor (BD)" rules={[{ required: true, message: "Requerido" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Buscar por razón social o RUC…"
                  options={proveedores.map((p) => ({
                    value: p.id,
                    label: `${p.razon_social}${p.nombre_comercial ? ` (${p.nombre_comercial})` : ""}${p.ruc ? ` — RUC ${p.ruc}` : ""}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="moneda" label="Moneda">
                <Select
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "PEN", label: "PEN" },
                    { value: "SOL", label: "SOL" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="tipo_pago" label="Tipo pago">
                <Select
                  allowClear
                  options={[
                    { value: "CONTADO", label: "Contado" },
                    { value: "TRANSFERENCIA", label: "Transferencia" },
                    { value: "CREDITO", label: "Crédito" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="dias_credito" label="Días crédito">
                <InputNumber min={0} max={365} style={{ width: "100%" }} placeholder="60" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="fecha_solicitud" label="Fecha emisión">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="fecha_expiracion" label="Fecha expiración (stock anual)">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="observaciones" label="Observaciones">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ textAlign: "right" }}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={savingHeader}
              onClick={guardarHeader}
            >
              Guardar header
            </Button>
          </div>
        </Form>
      </Card>

      {/* Ítems */}
      <Card
        title={
          <Space>
            <span>Ítems de la OC</span>
            <Tag>{data.detalles.length}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Editá cantidad / precio / NP / descripción y clickeá <SaveOutlined /> en la fila para guardar.
            </Text>
          </Space>
        }
        size="small"
        style={{ marginBottom: 12 }}
      >
        <Table<DetalleRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data.detalles}
          pagination={false}
          sticky={STICKY_HEADER}
          scroll={{ x: 1200 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={8} align="right">
                <Text strong>Total OC</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Text strong>
                  {data.moneda} {Number(data.total).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={1} />
            </Table.Summary.Row>
          )}
        />

        <Divider style={{ margin: "12px 0" }} />
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Agregar nuevo ítem desde catálogo de materiales:
          </Text>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Buscar material por código o descripción…"
            style={{ width: 460 }}
            onChange={(v) => {
              if (v != null) agregarFila(Number(v));
            }}
            value={undefined}
            options={materialesParaAgregar.map((m) => ({
              value: m.material_id,
              label: `${m.codigo} — ${m.descripcion}${m.np ? ` (NP ${m.np})` : ""}`,
            }))}
          />
          <Button icon={<PlusOutlined />} disabled style={{ visibility: "hidden" }}>
            (placeholder)
          </Button>
        </Space>
      </Card>
    </div>
  );
}

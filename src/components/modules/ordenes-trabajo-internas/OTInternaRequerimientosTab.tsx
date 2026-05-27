"use client";

// Tab "Requerimientos" del detalle de OT Interna.
//
// Versión simplificada del módulo de requerimientos para OT externas
// (OTRequerimientosTab). Solo incluye:
//   - Listar items
//   - Crear item nuevo (modal sencillo)
//
// Para edición avanzada, anulación, dividir, aprobaciones, etc. usar la página
// /requerimientos o /aprobaciones (que ahora soportan tanto OT externas como
// internas a través de la columna orden_trabajo_interna_id).

import { useCallback, useEffect, useState } from "react";
import {
  Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select,
  Typography, Empty, App, AutoComplete,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";

const { Text } = Typography;

interface RequerimientoRow {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string | null;
  material_codigo: string | null;
  descripcion: string | null;
  texto: string | null;
  cantidad: string | number;
  unidad_medida: string | null;
  precio_unitario: string | number | null;
  moneda: string | null;
  observaciones: string | null;
  material: { codigo: string; descripcion: string } | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  fabricante_codigo: string | null;
  unidad_medida_codigo: string | null;
}

interface NuevoReqValues {
  tipo_codigo: "MAC" | "CAD" | "SER";
  material_codigo?: string;
  descripcion: string;
  cantidad: number;
  unidad_medida?: string;
  fabricante_codigo?: string;
  observaciones?: string;
  nro_req?: string; // Si se especifica, agrega al nro_req existente.
  precio_unitario?: number;
  moneda?: string;
}

const REQ_COLOR: Record<string, string> = {
  BORRADOR: "default",
  SIN_APROBACION: "orange",
  APROBADO: "green",
  DESAPROBADO: "red",
  ANULADO: "red",
};

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };

interface Props {
  otInternaId: number;
}

export default function OTInternaRequerimientosTab({ otInternaId }: Props) {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [form] = Form.useForm<NuevoReqValues>();
  const tipoSeleccionado = Form.useWatch("tipo_codigo", form);

  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materiales, setMateriales] = useState<MaterialOpt[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } catch {
      message.error("Error al cargar requerimientos.");
    } finally {
      setLoading(false);
    }
  }, [otInternaId, message]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cargar materiales solo al abrir el modal por primera vez (lazy).
  useEffect(() => {
    if (modalOpen && materiales.length === 0) {
      fetch("/api/materiales?limit=2000")
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => setMateriales(j.data ?? []))
        .catch(() => { /* noop */ });
    }
  }, [modalOpen, materiales.length]);

  function openNuevo() {
    form.resetFields();
    form.setFieldsValue({ tipo_codigo: "MAC", cantidad: 1, unidad_medida: "UNIDAD" });
    setModalOpen(true);
  }

  async function handleCrear() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      // Si MAC, autocompletar descripción/unidad/fabricante desde el material si no se llenó.
      let body = { ...values };
      if (values.tipo_codigo === "MAC" && values.material_codigo) {
        const mat = materiales.find((m) => m.codigo === values.material_codigo);
        if (mat) {
          body = {
            ...body,
            descripcion: body.descripcion || mat.descripcion,
            unidad_medida: body.unidad_medida || (mat.unidad_medida_codigo ?? "UNIDAD"),
            fabricante_codigo: body.fabricante_codigo || (mat.fabricante_codigo ?? undefined),
          };
        }
      }
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Error al crear requerimiento");
      message.success("Requerimiento creado.");
      setModalOpen(false);
      fetchData();
    } catch (e) {
      if (e instanceof Error) message.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<RequerimientoRow> = [
    {
      key: "nro_req", title: "Nro Req / Item", width: 140,
      render: (_, r) => (
        <Text strong style={{ fontSize: 12 }}>
          {r.nro_req ?? "—"} / {r.item_req ?? "—"}
        </Text>
      ),
    },
    {
      key: "tipo", title: "Tipo", width: 70, align: "center",
      render: (_, r) => (
        <Tag color={TIPO_COLOR[r.tipo_codigo ?? ""] ?? "default"} style={{ margin: 0 }}>
          {r.tipo_codigo ?? "—"}
        </Tag>
      ),
    },
    {
      key: "descripcion", title: "Descripción", ellipsis: true,
      render: (_, r) => (
        <div style={{ lineHeight: 1.2 }}>
          {r.material?.codigo && <Tag style={{ fontSize: 10, marginRight: 4 }}>{r.material.codigo}</Tag>}
          {r.material?.descripcion ?? r.descripcion ?? "—"}
          {r.observaciones && (
            <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 2 }}>
              {r.observaciones}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "cantidad", title: "Cant.", width: 100, align: "right",
      render: (_, r) => `${Number(r.cantidad).toLocaleString()} ${r.unidad_medida ?? ""}`,
    },
    {
      key: "precio", title: "P. unitario", width: 110, align: "right",
      render: (_, r) => {
        if (r.precio_unitario == null) return <Text type="secondary">—</Text>;
        return <span>{r.moneda ?? "USD"} {Number(r.precio_unitario).toFixed(2)}</span>;
      },
    },
    {
      key: "status", title: "Estado", width: 130,
      render: (_, r) => r.status_requerimiento
        ? <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"}>{r.status_requerimiento.nombre}</Tag>
        : <Text type="secondary">—</Text>,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNuevo}>
          Nuevo requerimiento
        </Button>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Refrescar
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </Text>
      </Space>

      {rows.length === 0 && !loading ? (
        <Empty description="Sin requerimientos. Crea el primero con el botón de arriba." />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
          pagination={false}
        />
      )}

      <Modal
        title="Nuevo requerimiento"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleCrear}
        confirmLoading={saving}
        okText="Crear"
        cancelText="Cancelar"
        width={modalWidth(screens, 640)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="tipo_codigo" label="Tipo" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "MAC", label: "MAC — Material catálogo" },
                { value: "CAD", label: "CAD — Material no catalogado" },
                { value: "SER", label: "SER — Servicio" },
              ]}
            />
          </Form.Item>
          {tipoSeleccionado === "MAC" && (
            <Form.Item
              name="material_codigo"
              label="Material"
              rules={[{ required: true, message: "Requerido para tipo MAC" }]}
            >
              <AutoComplete
                placeholder="Buscar por código o descripción"
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}`,
                }))}
                filterOption={(input, option) =>
                  String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          )}
          <Form.Item
            name="descripcion"
            label="Descripción"
            rules={[{ required: true, message: "Requerido" }]}
            tooltip={tipoSeleccionado === "MAC" ? "Si lo dejás vacío, se autocompletará con la descripción del material." : undefined}
          >
            <Input.TextArea rows={2} maxLength={500} placeholder="Detalle del requerimiento" />
          </Form.Item>
          <Space>
            <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true, type: "number", min: 0.01 }]}>
              <InputNumber min={0.01} step={1} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="unidad_medida" label="Unidad">
              <Input placeholder="UNIDAD" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="fabricante_codigo" label="Fabricante">
              <Input placeholder="(opcional)" style={{ width: 160 }} />
            </Form.Item>
          </Space>
          {/* Precio referencial — solo para SER y CAD. Para MAC el precio
              viene del catálogo de material. */}
          {(tipoSeleccionado === "SER" || tipoSeleccionado === "CAD") && (
            <Space>
              <Form.Item
                name="precio_unitario"
                label="Precio referencial"
                tooltip="Precio orientativo. El definitivo lo carga compras en la OC."
              >
                <InputNumber min={0} step={0.01} style={{ width: 160 }} placeholder="0.00" />
              </Form.Item>
              <Form.Item name="moneda" label="Moneda" initialValue="USD">
                <Select
                  style={{ width: 140 }}
                  options={[
                    { value: "USD", label: "USD ($)" },
                    { value: "SOL", label: "SOL (S/)" },
                  ]}
                />
              </Form.Item>
            </Space>
          )}
          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} maxLength={300} placeholder="(opcional)" />
          </Form.Item>
          <Form.Item
            name="nro_req"
            label="Agregar a requerimiento existente"
            tooltip="Si dejás vacío, se crea un nuevo nro_req. Si pones uno existente (de esta OT), el item se agrega ahí."
          >
            <Input placeholder="REQ-26-XXXX (opcional)" style={{ maxWidth: 240 }} />
          </Form.Item>
        </Form>
      </Modal>

      <style jsx>{`
        :global(.ant-table-thead > tr > th) {
          background: ${brand.bgPage} !important;
        }
      `}</style>
    </div>
  );
}

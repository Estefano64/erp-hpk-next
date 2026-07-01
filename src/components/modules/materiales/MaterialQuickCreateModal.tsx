"use client";

// Modal reusable para crear un Material "al vuelo" desde cualquier Select que
// liste materiales (ej. "Código de Material" en la creación de OT). Replica los
// campos mínimos del form de Materiales: descripción + 5 catálogos OBLIGATORIOS
// (planta, área, categoría, clasificación, unidad de medida) + algunos opcionales.
// El `codigo` NO se pide: lo auto-genera el backend (000001, 000002, ...).
//
// Al crear con éxito invoca onCreated(material) con el material devuelto por la
// API (incluye codigo + descripcion), para que el caller lo agregue a su lista
// y lo seleccione.
import { useEffect, useState } from "react";
import { Modal, Form, Input, InputNumber, Select, Row, Col, App } from "antd";
import { useResponsive, modalWidth } from "@/lib/responsive";

interface CatalogoItem { codigo: string; nombre: string }

export interface MaterialCreado {
  codigo: string;
  descripcion: string;
  // El backend devuelve más campos; el caller solo necesita estos dos.
  [k: string]: unknown;
}

interface Props {
  open: boolean;
  /** Texto que el usuario venía tipeando — se pre-carga como descripción. */
  initialDescripcion?: string;
  onClose: () => void;
  onCreated: (material: MaterialCreado) => void;
}

const TABLAS = ["planta", "area", "categoria", "clasificacion", "unidadMedida", "moneda", "fabricante"] as const;

export function MaterialQuickCreateModal({ open, initialDescripcion, onClose, onCreated }: Props) {
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [cat, setCat] = useState<Record<string, CatalogoItem[]>>({});
  const [cargados, setCargados] = useState(false);

  // Cargar catálogos una sola vez (en el primer open).
  useEffect(() => {
    if (!open || cargados) return;
    (async () => {
      try {
        const res = await Promise.all(
          TABLAS.map((t) => fetch(`/api/catalogos?tabla=${t}`).then((r) => (r.ok ? r.json() : { data: [] }))),
        );
        const next: Record<string, CatalogoItem[]> = {};
        TABLAS.forEach((t, i) => { next[t] = res[i].data ?? []; });
        setCat(next);
        setCargados(true);
      } catch {
        message.error("No se pudieron cargar los catálogos de material");
      }
    })();
  }, [open, cargados, message]);

  // Pre-cargar la descripción cada vez que se abre.
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ descripcion: initialDescripcion ?? "" });
    }
  }, [open, initialDescripcion, form]);

  const opts = (arr?: CatalogoItem[]) =>
    (arr ?? []).map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.nombre}` }));

  const handleSave = async () => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/materiales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        message.error(j?.error ?? "Error al crear material");
        return;
      }
      message.success(`Material ${j.data.codigo} creado`);
      onCreated(j.data as MaterialCreado);
      onClose();
    } catch {
      message.error("Error al crear material");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Nuevo Material"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="Crear material"
      width={modalWidth(screens, 760)}
    >
      <Form form={form} layout="vertical" validateTrigger={["onChange", "onBlur"]}>
        <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerido" }]}>
          <Input placeholder="Descripción del material" />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={12} md={8}>
            <Form.Item name="planta_codigo" label="Planta" rules={[{ required: true, message: "Requerido" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Planta" options={opts(cat.planta)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="area_codigo" label="Área" rules={[{ required: true, message: "Requerido" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Área" options={opts(cat.area)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="categoria_codigo" label="Categoría" rules={[{ required: true, message: "Requerido" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Categoría" options={opts(cat.categoria)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="clasificacion_codigo" label="Clasificación" rules={[{ required: true, message: "Requerido" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Clasificación" options={opts(cat.clasificacion)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="unidad_medida_codigo" label="Und. Medida" rules={[{ required: true, message: "Requerido" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Unidad" options={opts(cat.unidadMedida)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="fabricante_codigo" label="Fabricante">
              <Select showSearch allowClear optionFilterProp="label" placeholder="(opcional)" options={opts(cat.fabricante)} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="np" label="Número de Parte">
              <Input placeholder="(opcional)" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="precio" label="Precio">
              <InputNumber min={0} precision={2} style={{ width: "100%" }} placeholder="0.00" />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="moneda_codigo" label="Moneda">
              <Select showSearch allowClear optionFilterProp="label" placeholder="(opcional)" options={opts(cat.moneda)} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

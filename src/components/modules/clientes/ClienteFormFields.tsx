"use client";

// Campos del formulario de Cliente — COMPARTIDOS entre el maestro (/clientes)
// y la creación al vuelo en Nueva OT (ticket #175: el quick-create tenía un
// formato distinto, sin la búsqueda por RUC). Cualquier cambio de campos se
// hace acá para que ambos formularios no diverjan.

import { Form, Input, Row, Col } from "antd";
import type { FormInstance } from "antd";
import { RucLookupInput } from "@/components/RucLookupInput";
import { DuplicateHint } from "@/components/DuplicateHint";

interface ClienteMatch {
  cliente_id: number;
  codigo: string;
  razon_social: string;
}

// Aviso de posibles duplicados por razón social (mismo hint que el maestro).
function ClienteDupHint({ form, excludeId }: { form: FormInstance; excludeId?: number }) {
  const value = (Form.useWatch("razon_social", form) ?? "") as string;
  return (
    <DuplicateHint<ClienteMatch>
      value={value}
      endpoint="/api/clientes"
      excludeId={excludeId}
      mapMatch={(c) => ({ id: c.cliente_id, primary: c.razon_social, secondary: c.codigo })}
    />
  );
}

export function ClienteFormFields({
  form, excludeId, showDupHint = true,
}: {
  form: FormInstance;
  /** id del cliente en edición — se excluye del hint de duplicados. */
  excludeId?: number;
  /** El hint de duplicados solo aplica al crear (no al editar). */
  showDupHint?: boolean;
}) {
  return (
    <Row gutter={16}>
      <Col xs={24} sm={8}>
        <Form.Item
          name="ruc"
          label="RUC"
          rules={[
            { required: true, message: "El RUC es obligatorio" },
            { pattern: /^\d{11}$/, message: "Debe tener 11 dígitos numéricos" },
          ]}
        >
          <RucLookupInput
            form={form}
            fieldName="ruc"
            targets={{ razonSocial: "razon_social", direccion: "direccion" }}
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={16}>
        <Form.Item name="razon_social" label="Razón Social" rules={[{ required: true, message: "Razón social obligatoria" }]}>
          <Input placeholder="Ej. Minera Cuajone S.A." />
        </Form.Item>
        {showDupHint && <ClienteDupHint form={form} excludeId={excludeId} />}
      </Col>
      <Col span={24}>
        <Form.Item name="nombre_comercial" label="Nombre Comercial">
          <Input />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="direccion" label="Dirección">
          <Input />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item name="contacto_principal" label="Contacto Principal">
          <Input />
        </Form.Item>
      </Col>
      <Col xs={12} sm={8}>
        <Form.Item name="telefono" label="Teléfono">
          <Input />
        </Form.Item>
      </Col>
      <Col xs={12} sm={8}>
        <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Email inválido" }]}>
          <Input placeholder="contacto@cliente.com" />
        </Form.Item>
      </Col>
      <Col span={24}>
        <Form.Item name="nota" label="Nota" extra="Útil para distinguir sedes con mismo RUC (ej. Cuajone, Toquepala, Ilo).">
          <Input maxLength={300} />
        </Form.Item>
      </Col>
    </Row>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Typography, Card, Form, InputNumber, Select, Button, Space, message, Spin, Alert, Row, Col, Divider,
} from "antd";
import { SaveOutlined, DollarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { brand } from "@/lib/theme";

interface ConfigData {
  id: number;
  tarifa_hora_usd: string;
  tarifa_hora_sol: string;
  moneda_default_codigo: string;
  igv_porcentaje: string;
  updated_at: string;
  updated_by: string | null;
}

export default function ConfiguracionCotizacionPage() {
  const { data: session, status } = useSession();
  const isAdminUser = (session?.user as { rol?: string } | undefined)?.rol === "admin";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const fetchConfig = async () => {
    setLoading(true);
    const res = await fetch("/api/configuracion-cotizacion");
    if (res.ok) {
      const json = await res.json();
      setConfig(json.data);
      form.setFieldsValue({
        tarifa_hora_usd: Number(json.data.tarifa_hora_usd),
        tarifa_hora_sol: Number(json.data.tarifa_hora_sol),
        moneda_default_codigo: json.data.moneda_default_codigo,
        igv_porcentaje: Number(json.data.igv_porcentaje),
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await fetch("/api/configuracion-cotizacion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
      messageApi.success("Configuración actualizada");
      fetchConfig();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading || status === "loading") return <Spin size="large" />;

  return (
    <div>
      {contextHolder}
      <Typography.Title level={3} style={{ margin: 0, marginBottom: 16 }}>
        <DollarOutlined style={{ marginRight: 8 }} />
        Configuración de Cotización
      </Typography.Title>

      {!isAdminUser && (
        <Alert
          type="warning"
          showIcon
          title="Solo lectura"
          description="Esta página solo puede editarse con rol admin."
          style={{ marginBottom: 16 }}
        />
      )}

      <Card style={{ maxWidth: 720 }}>
        <Form form={form} layout="vertical" disabled={!isAdminUser}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="tarifa_hora_usd"
                label="Tarifa hora (USD)"
                rules={[{ required: true, message: "Requerido" }, { type: "number", min: 0 }]}
                extra="Costo por hora-hombre en dólares"
              >
                <InputNumber min={0} step={0.50} style={{ width: "100%" }} prefix="$" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="tarifa_hora_sol"
                label="Tarifa hora (Soles)"
                rules={[{ required: true, message: "Requerido" }, { type: "number", min: 0 }]}
                extra="Costo por hora-hombre en soles peruanos"
              >
                <InputNumber min={0} step={0.50} style={{ width: "100%" }} prefix="S/" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="moneda_default_codigo"
                label="Moneda por defecto"
                rules={[{ required: true, message: "Requerido" }]}
                extra="Se usa cuando una cotización no especifica moneda"
              >
                <Select
                  options={[
                    { value: "USD", label: "Dólar (USD)" },
                    { value: "SOL", label: "Sol peruano (SOL)" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="igv_porcentaje"
                label="IGV (%)"
                rules={[{ required: true, message: "Requerido" }, { type: "number", min: 0, max: 100 }]}
                extra="Impuesto general a las ventas"
              >
                <InputNumber min={0} max={100} step={0.5} style={{ width: "100%" }} suffix="%" />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: brand.textSecondary }}>
              {config && (
                <>
                  Última actualización: {dayjs(config.updated_at).format("DD/MM/YYYY HH:mm")}
                  {config.updated_by && ` por ${config.updated_by}`}
                </>
              )}
            </div>
            {isAdminUser && (
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                Guardar
              </Button>
            )}
          </div>
        </Form>
      </Card>
    </div>
  );
}

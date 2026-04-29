"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography, Card, Button, Space, Spin, Alert, Tag, Row, Col,
  InputNumber, Input, Select, Descriptions, message, Divider, Modal,
} from "antd";
import { ArrowLeftOutlined, SaveOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import type { CampoCaptura, PlantillaEvaluacion, TipoCaptura } from "@/lib/evaluacion-templates";

interface Captura {
  id: number;
  campo_key: string;
  tipo_captura: TipoCaptura;
  valor_numero: string | null;
  valor_texto: string | null;
  valor_booleano: boolean | null;
  valor_url: string | null;
  unidad: string | null;
}

interface EvaluacionData {
  ot: {
    id: number;
    ot: string | null;
    descripcion: string | null;
    taller_status: { codigo: string; nombre: string } | null;
    cliente: { codigo: string; razon_social: string } | null;
  };
  codigo_reparacion: {
    codigo: string;
    descripcion: string;
    np: string | null;
    modelo_evaluacion_codigo: string | null;
    modelo_evaluacion: { codigo: string; nombre: string } | null;
  } | null;
  modelo_evaluacion_codigo: string | null;
  plantilla: PlantillaEvaluacion | null;
  planificacion_eval_id: number;
  capturas: Captura[];
}

type CapturaValue = {
  valor_numero?: number | null;
  valor_texto?: string | null;
  valor_booleano?: boolean | null;
  valor_url?: string | null;
};

export default function EvaluacionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const otId = Number(params?.id);

  const [data, setData] = useState<EvaluacionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, CapturaValue>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchData = useCallback(async () => {
    if (!otId) return;
    setLoading(true);
    const res = await fetch(`/api/ordenes-trabajo/${otId}/evaluacion`);
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
      const initial: Record<string, CapturaValue> = {};
      for (const c of json.data.capturas as Captura[]) {
        initial[c.campo_key] = {
          valor_numero: c.valor_numero !== null ? Number(c.valor_numero) : null,
          valor_texto: c.valor_texto,
          valor_booleano: c.valor_booleano,
          valor_url: c.valor_url,
        };
      }
      setValues(initial);
    } else {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al cargar");
    }
    setLoading(false);
  }, [otId, messageApi]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const persistCaptura = useCallback(async (campo: CampoCaptura, val: CapturaValue) => {
    if (!data) return;
    setSavingKey(campo.key);
    try {
      const body = {
        campo_key: campo.key,
        tipo_captura: campo.tipo,
        unidad: campo.unidad ?? null,
        valor_numero: val.valor_numero ?? null,
        valor_texto: val.valor_texto ?? null,
        valor_booleano: val.valor_booleano ?? null,
        valor_url: val.valor_url ?? null,
      };
      const res = await fetch(`/api/planificacion/${data.planificacion_eval_id}/capturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error");
      }
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingKey(null);
    }
  }, [data, messageApi]);

  const updateField = useCallback((campo: CampoCaptura, val: CapturaValue) => {
    setValues((prev) => ({ ...prev, [campo.key]: { ...prev[campo.key], ...val } }));
    if (debounceTimers.current[campo.key]) clearTimeout(debounceTimers.current[campo.key]);
    debounceTimers.current[campo.key] = setTimeout(() => {
      const merged = { ...values[campo.key], ...val };
      persistCaptura(campo, merged);
    }, 600);
  }, [values, persistCaptura]);

  const camposCompletos = useMemo(() => {
    if (!data?.plantilla) return { total: 0, filled: 0 };
    let total = 0, filled = 0;
    for (const s of data.plantilla.secciones) {
      for (const c of s.campos) {
        total++;
        const v = values[c.key];
        if (!v) continue;
        const any = v.valor_numero != null || !!v.valor_texto || v.valor_booleano != null || !!v.valor_url;
        if (any) filled++;
      }
    }
    return { total, filled };
  }, [data, values]);

  if (loading) return <Spin size="large" />;
  if (!data) return <Alert type="error" message="OT no encontrada" />;
  if (!data.codigo_reparacion) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/ordenes-trabajo`)} style={{ marginBottom: 16 }}>Volver</Button>
        <Alert type="warning" showIcon message="Esta OT no tiene Código de Reparación asignado. Asigná uno antes de evaluar." />
      </div>
    );
  }
  if (!data.plantilla) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`/ordenes-trabajo`)} style={{ marginBottom: 16 }}>Volver</Button>
        <Alert
          type="warning"
          showIcon
          message={`No hay plantilla para el modelo de evaluación "${data.codigo_reparacion.modelo_evaluacion_codigo ?? "(sin modelo)"}"`}
          description="El CodRep de la OT no tiene un ModeloEvaluacion asignado, o ese modelo aún no tiene plantilla en el sistema."
        />
      </div>
    );
  }

  const { plantilla } = data;

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/ordenes-trabajo")}>Volver</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>Evaluación — OT {data.ot.ot ?? `#${data.ot.id}`}</Typography.Title>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="Cliente">{data.ot.cliente?.razon_social ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="CodRep">
            <Tag color={brand.navy}>{data.codigo_reparacion.codigo}</Tag>
            {data.codigo_reparacion.descripcion}
          </Descriptions.Item>
          <Descriptions.Item label="NP">{data.codigo_reparacion.np ?? "-"}</Descriptions.Item>
          <Descriptions.Item label="Modelo evaluación">
            <Tag color={brand.cyan}>{plantilla.codigo}</Tag>
            {plantilla.nombre}
          </Descriptions.Item>
          <Descriptions.Item label="Taller status">
            {data.ot.taller_status ? <Tag>{data.ot.taller_status.nombre}</Tag> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Progreso">
            <Tag color={camposCompletos.filled === camposCompletos.total ? "success" : "processing"}>
              {camposCompletos.filled} / {camposCompletos.total} campos
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {plantilla.secciones.map((seccion, i) => (
        <Card
          key={i}
          title={<span><strong>{seccion.titulo}</strong></span>}
          size="small"
          style={{ marginBottom: 12 }}
          styles={{ body: { padding: "12px 16px" } }}
        >
          {seccion.refCampo && (
            <div style={{ marginBottom: 12 }}>
              <Input
                placeholder={`Referencia: ${seccion.titulo}`}
                value={values[seccion.refCampo]?.valor_texto ?? ""}
                onChange={(e) => updateField(
                  { key: seccion.refCampo!, label: "REF", tipo: "TEXTO" },
                  { valor_texto: e.target.value },
                )}
              />
            </div>
          )}
          <Row gutter={[16, 12]}>
            {seccion.campos.map((campo) => (
              <Col key={campo.key} xs={24} sm={12} md={8} lg={6}>
                <FieldRenderer
                  campo={campo}
                  value={values[campo.key] ?? {}}
                  saving={savingKey === campo.key}
                  onChange={(v) => updateField(campo, v)}
                />
              </Col>
            ))}
          </Row>
        </Card>
      ))}

      <Card size="small" style={{ marginBottom: 12 }} title={<strong>Hallazgos posibles</strong>}>
        <Alert
          type="info"
          showIcon
          message="Marcá los que apliquen en los campos 'Resultado' / 'Recomendaciones' de cada sección, o dejalos como referencia."
          style={{ marginBottom: 8 }}
        />
        <Space wrap>
          {plantilla.hallazgosPosibles.map((h) => (
            <Tag key={h}>{h}</Tag>
          ))}
        </Space>
      </Card>

      <Card size="small" title={<strong>Recomendaciones pre-escritas</strong>}>
        <Space wrap>
          {plantilla.recomendacionesPosibles.map((r) => (
            <Tag key={r} color="cyan">{r}</Tag>
          ))}
        </Space>
      </Card>

      <Divider />

      <div style={{ textAlign: "right" }}>
        <Space>
          <Button icon={<SaveOutlined />} onClick={() => messageApi.info("Los cambios se guardan automáticamente al editar cada campo.")}>
            Guardar
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={finalizing}
            disabled={camposCompletos.filled === 0}
            onClick={() => {
              Modal.confirm({
                title: "¿Finalizar evaluación?",
                content: `Vas a marcar la evaluación como terminada (${camposCompletos.filled} de ${camposCompletos.total} campos llenos). La OT pasará a "Pdt proceso". Los valores guardados quedan como están.`,
                okText: "Finalizar",
                cancelText: "Cancelar",
                async onOk() {
                  setFinalizing(true);
                  try {
                    const res = await fetch(`/api/ordenes-trabajo/${otId}/evaluacion/finalizar`, { method: "POST" });
                    if (!res.ok) {
                      const err = await res.json().catch(() => null);
                      throw new Error(err?.error ?? "Error");
                    }
                    const json = await res.json();
                    messageApi.success(`Evaluación finalizada. Taller status: ${json.taller_status_nuevo}.`);
                    fetchData();
                  } catch (e) {
                    messageApi.error(e instanceof Error ? e.message : "Error al finalizar");
                  } finally {
                    setFinalizing(false);
                  }
                },
              });
            }}
          >
            Finalizar evaluación
          </Button>
        </Space>
      </div>
    </div>
  );
}

function FieldRenderer({
  campo,
  value,
  saving,
  onChange,
}: {
  campo: CampoCaptura;
  value: CapturaValue;
  saving: boolean;
  onChange: (v: CapturaValue) => void;
}) {
  const label = (
    <span>
      {campo.label}
      {campo.unidad && <span style={{ color: brand.textSecondary }}> ({campo.unidad})</span>}
      {saving && <span style={{ marginLeft: 6, color: brand.cyan, fontSize: 11 }}>guardando…</span>}
    </span>
  );

  switch (campo.tipo) {
    case "MEDIDA_NUMERICA":
    case "TOLERANCIA":
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <InputNumber
            value={value.valor_numero ?? undefined}
            onChange={(v) => onChange({ valor_numero: v == null ? null : Number(v) })}
            step={0.01}
            style={{ width: "100%" }}
            placeholder="0.00"
          />
        </div>
      );
    case "CHECKLIST_BMN":
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <Select
            value={value.valor_texto ?? undefined}
            onChange={(v) => onChange({ valor_texto: v ?? null })}
            placeholder="—"
            allowClear
            style={{ width: "100%" }}
            options={[
              { value: "BUENO", label: "Bueno" },
              { value: "MALO", label: "Malo" },
              { value: "NA", label: "N/A" },
            ]}
          />
        </div>
      );
    case "BOOLEAN":
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <Select
            value={value.valor_booleano ?? undefined}
            onChange={(v) => onChange({ valor_booleano: v ?? null })}
            placeholder="—"
            allowClear
            style={{ width: "100%" }}
            options={[
              { value: true, label: "Sí" },
              { value: false, label: "No" },
            ]}
          />
        </div>
      );
    case "FOTO":
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <Input
            value={value.valor_url ?? ""}
            onChange={(e) => onChange({ valor_url: e.target.value })}
            placeholder="URL de imagen"
          />
        </div>
      );
    case "TEXTO":
    default:
      if (campo.opciones) {
        return (
          <div>
            <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
            <Select
              value={value.valor_texto ?? undefined}
              onChange={(v) => onChange({ valor_texto: v ?? null })}
              placeholder="—"
              allowClear
              style={{ width: "100%" }}
              options={campo.opciones.map((o) => ({ value: o, label: o }))}
            />
          </div>
        );
      }
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
          <Input.TextArea
            value={value.valor_texto ?? ""}
            onChange={(e) => onChange({ valor_texto: e.target.value })}
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
        </div>
      );
  }
}

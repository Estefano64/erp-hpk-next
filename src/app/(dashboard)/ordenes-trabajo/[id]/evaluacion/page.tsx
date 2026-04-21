"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Typography,
  Card,
  Row,
  Col,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Divider,
  Spin,
  App,
  Upload,
  Tag,
  Alert,
} from "antd";
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FileWordOutlined,
  UploadOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  LockOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { brand } from "@/lib/theme";
import dayjs, { Dayjs } from "dayjs";
import EvaluacionFormulario, {
  MODELOS_EVALUACION,
  detectarModeloDesdeEstrategia,
} from "@/components/modules/evaluacion/EvaluacionFormulario";
import { generarWordEvaluacion } from "@/components/modules/evaluacion/generarWord";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface OTDetalle {
  id: number;
  ot: string | null;
  estrategia: boolean | null;
  tipo: string | null;
  np: string | null;
  descripcion: string | null;
  equipo_codigo: string | null;
  ns: string | null;
  fecha_recepcion: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  guia_remision: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string } | null;
  fabricante: { nombre: string } | null;
}

interface Evaluacion {
  id: number;
  ot_id: number;
  modelo_evaluacion: string;
  sistema_medicion: string;
  fecha_evaluacion: string | null;
  evaluado_por: string | null;
  datos_formulario: Record<string, unknown>;
  resultado_general: string | null;
  recomendaciones_general: string | null;
  informe_archivo: string | null;
  informe_nombre: string | null;
  informe_fecha_subida: string | null;
  estado: string;
}

export default function EvaluacionPage() {
  const params = useParams();
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const otId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ot, setOt] = useState<OTDetalle | null>(null);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [modeloEvaluacion, setModeloEvaluacion] = useState<string>("cil_vastago_simple");
  const [sistemaMedicion, setSistemaMedicion] = useState<string>("Metrico");
  const [modeloBloqueado, setModeloBloqueado] = useState(false);
  const [datosFormulario, setDatosFormulario] = useState<Record<string, unknown>>({});

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const resOT = await fetch(`/api/ordenes-trabajo/${otId}`);
      const jsonOT = await resOT.json();
      if (!resOT.ok) throw new Error(jsonOT.error || "Error al cargar OT");
      const otData = jsonOT.data as OTDetalle;
      setOt(otData);

      // Determinar modelo de evaluacion
      let modeloInicial = "cil_vastago_simple";
      let bloqueado = false;
      if (otData.estrategia && otData.tipo) {
        const detectado = detectarModeloDesdeEstrategia(otData.tipo);
        if (detectado) {
          modeloInicial = detectado;
          bloqueado = true;
        }
      }
      setModeloBloqueado(bloqueado);

      // Intentar cargar evaluacion existente
      try {
        const resEval = await fetch(`/api/evaluaciones/ot/${otId}`);
        if (resEval.ok) {
          const jsonEval = await resEval.json();
          const ev = jsonEval.data as Evaluacion;
          setEvaluacion(ev);
          if (!bloqueado) modeloInicial = ev.modelo_evaluacion;
          setSistemaMedicion(ev.sistema_medicion);
          setDatosFormulario(ev.datos_formulario || {});
          form.setFieldsValue({
            evaluado_por: ev.evaluado_por,
            fecha_evaluacion: ev.fecha_evaluacion ? dayjs(ev.fecha_evaluacion) : null,
            resultado_general: ev.resultado_general,
            recomendaciones_general: ev.recomendaciones_general,
          });
        }
      } catch {
        // No hay evaluacion previa
      }

      setModeloEvaluacion(modeloInicial);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [otId, form, message]);

  useEffect(() => {
    if (otId) cargarDatos();
  }, [otId, cargarDatos]);

  const handleGuardar = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const payload = {
        ot_id: otId,
        modelo_evaluacion: modeloEvaluacion,
        sistema_medicion: sistemaMedicion,
        fecha_evaluacion: values.fecha_evaluacion
          ? (values.fecha_evaluacion as Dayjs).format("YYYY-MM-DD")
          : null,
        evaluado_por: values.evaluado_por || null,
        datos_formulario: datosFormulario,
        resultado_general: values.resultado_general || null,
        recomendaciones_general: values.recomendaciones_general || null,
        estado: "COMPLETADA",
      };

      const url = evaluacion?.id
        ? `/api/evaluaciones/${evaluacion.id}`
        : "/api/evaluaciones";
      const method = evaluacion?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setEvaluacion(json.data);
      message.success("Hoja de evaluacion guardada");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadInforme = async (file: File) => {
    if (!evaluacion?.id) {
      message.warning("Primero guarda la hoja de evaluacion");
      return false;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("informe", file);
      const res = await fetch(`/api/evaluaciones/${evaluacion.id}/informe`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al subir informe");
      setEvaluacion(json.data);
      message.success("Informe subido correctamente");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      message.error(msg);
    } finally {
      setUploading(false);
    }
    return false; // impedir subida automatica del Upload component
  };

  const handleGenerarWord = async () => {
    try {
      const values = form.getFieldsValue();
      await generarWordEvaluacion({
        ot,
        modeloEvaluacion,
        sistemaMedicion,
        fechaEvaluacion: values.fecha_evaluacion ? (values.fecha_evaluacion as Dayjs).format("DD/MM/YYYY") : "",
        evaluadoPor: values.evaluado_por || "",
        datos: datosFormulario,
        resultadoGeneral: values.resultado_general || "",
        recomendacionesGeneral: values.recomendaciones_general || "",
      });
      message.success("Word generado correctamente");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al generar Word";
      message.error(msg);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!ot) {
    return <Alert type="error" message="OT no encontrada" />;
  }

  const clienteNombre = ot.cliente?.nombre_comercial ?? ot.cliente?.razon_social ?? "-";

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/ordenes-trabajo")}
          style={{ marginBottom: 8 }}
        >
          Volver a Ordenes de Trabajo
        </Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Hoja de Evaluacion Tecnica
            </Title>
            <Text type="secondary">
              OT: <Tag color={brand.navy}>{ot.ot}</Tag>
              {evaluacion && (
                <Tag color={evaluacion.estado === "COMPLETADA" ? "green" : "orange"}>
                  {evaluacion.estado}
                </Tag>
              )}
            </Text>
          </div>
          <Space>
            <Button icon={<FileWordOutlined />} onClick={handleGenerarWord}>
              Descargar Word
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleGuardar}
            >
              Guardar Hoja
            </Button>
          </Space>
        </div>
      </div>

      {/* ── Seccion 1: Datos Generales ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>1</span>
            Datos Generales de la OT
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Fecha de Ingreso</Text>
            <div>{ot.fecha_recepcion ? dayjs(ot.fecha_recepcion).format("DD/MM/YYYY") : "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Guia Cliente</Text>
            <div>{ot.guia_remision || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Cliente</Text>
            <div>{clienteNombre}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>OT</Text>
            <div><Tag color={brand.navy}>{ot.ot}</Tag></div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Fabricante</Text>
            <div>{ot.fabricante?.nombre || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Flota</Text>
            <div>{ot.cod_rep_flota || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Descripcion</Text>
            <div>{ot.descripcion || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Tipo</Text>
            <div>{ot.tipo || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Numero de Parte</Text>
            <div>{ot.np || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Posicion</Text>
            <div>{ot.cod_rep_posicion || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Codigo Reparable</Text>
            <div>{ot.codigo_reparacion?.codigo || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Estrategia</Text>
            <div>
              {ot.estrategia ? (
                <Tag color="blue">Con Estrategia</Tag>
              ) : (
                <Tag>Sin Estrategia</Tag>
              )}
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── Seccion 2: Configuracion evaluacion ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>2</span>
            Configuracion de la Evaluacion
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Modelo / Tipo de componente">
                <Select
                  value={modeloEvaluacion}
                  onChange={setModeloEvaluacion}
                  disabled={modeloBloqueado}
                  suffixIcon={modeloBloqueado ? <LockOutlined /> : undefined}
                  options={MODELOS_EVALUACION.map((m) => ({
                    label: m.label,
                    value: m.value,
                  }))}
                />
                {modeloBloqueado && (
                  <Alert
                    type="warning"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="Tipo determinado por la estrategia de la OT"
                    style={{ marginTop: 8 }}
                    banner
                  />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Sistema de Medicion">
                <Select
                  value={sistemaMedicion}
                  onChange={setSistemaMedicion}
                  options={[
                    { label: "Sistema Metrico (mm)", value: "Metrico" },
                    { label: "Sistema Imperial (in)", value: "Imperial" },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="Fecha Evaluacion" name="fecha_evaluacion">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="Evaluado por" name="evaluado_por">
                <Input placeholder="Nombre" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* ── Seccion 3: Formulario dinamico de evaluacion ── */}
      <EvaluacionFormulario
        modelo={modeloEvaluacion}
        sistemaMedicion={sistemaMedicion}
        datos={datosFormulario}
        onChange={setDatosFormulario}
      />

      {/* ── Seccion final: Resultado y Recomendaciones ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>F</span>
            Resultado General y Recomendaciones
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Resultado general de la evaluacion" name="resultado_general">
            <TextArea rows={3} placeholder="Conclusiones generales de la evaluacion del componente..." />
          </Form.Item>
          <Form.Item label="Recomendaciones" name="recomendaciones_general">
            <TextArea rows={3} placeholder="Recomendaciones tecnicas..." />
          </Form.Item>
        </Form>
      </Card>

      {/* ── Seccion: Subir Informe ── */}
      <Card
        title={
          <Space>
            <UploadOutlined />
            Adjuntar Informe de Evaluacion
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {evaluacion?.informe_nombre && (
          <Alert
            style={{ marginBottom: 12 }}
            type="success"
            showIcon
            message={
              <Space>
                <strong>{evaluacion.informe_nombre}</strong>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Subido: {evaluacion.informe_fecha_subida ? dayjs(evaluacion.informe_fecha_subida).format("DD/MM/YYYY HH:mm") : ""}
                </Text>
                <a href={evaluacion.informe_archivo!} target="_blank" rel="noopener noreferrer">
                  <Button type="link" size="small" icon={<DownloadOutlined />}>
                    Descargar
                  </Button>
                </a>
              </Space>
            }
          />
        )}
        <Upload
          beforeUpload={(file) => handleUploadInforme(file as File)}
          showUploadList={false}
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          maxCount={1}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            {evaluacion?.informe_nombre ? "Reemplazar Informe" : "Subir Informe"}
          </Button>
        </Upload>
        <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          Formatos aceptados: PDF, Word, Excel. Maximo 20MB.
        </Text>
      </Card>

      <Divider />

      {/* Boton guardar al final */}
      <div style={{ textAlign: "right", marginBottom: 40 }}>
        <Space>
          <Button onClick={() => router.push("/ordenes-trabajo")}>Cancelar</Button>
          <Button icon={<FileWordOutlined />} onClick={handleGenerarWord}>
            Descargar Word
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            size="large"
            loading={saving}
            onClick={handleGuardar}
          >
            Guardar Hoja de Evaluacion
          </Button>
        </Space>
      </div>
    </div>
  );
}

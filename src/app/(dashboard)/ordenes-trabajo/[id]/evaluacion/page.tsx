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
  Modal,
} from "antd";
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FileWordOutlined,
  UploadOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  LockOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FileDoneOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import dayjs, { Dayjs } from "dayjs";
import {
  detectarTipoCilindro,
  COD_REP_TIPO_A_MODELO_EVAL,
  nombreTipoCilindro,
  tipoTienePlantilla,
} from "@/lib/cod-rep-tipos";
import EvaluacionFormulario, {
  MODELOS_EVALUACION,
  detectarModeloDesdeEstrategia,
} from "@/components/modules/evaluacion/EvaluacionFormulario";
import { generarWordEvaluacion } from "@/components/modules/evaluacion/generarWord";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";
import { useUnsavedChangesWarning, confirmLeave } from "@/lib/unsaved-changes";
import { useSession } from "next-auth/react";

import { formatDateOnly } from "@/lib/dates";
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
  // PO Cliente — necesario para anexar la cotización (decisión del user).
  po_cliente: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: {
    codigo: string;
    descripcion: string;
    modelo_evaluacion_codigo: string | null;
  } | null;
  fabricante: { nombre: string } | null;
  // OCs vinculadas — directas (Compra.ot_id) e indirectas (vía requerimientos
  // agrupados en una OC). Se deduplican y muestran en Datos Generales + Word.
  compras?: { id: number; numero_po: string; status_oc_codigo: string | null }[];
  repuestos?: { compra: { id: number; numero_po: string; status_oc_codigo: string | null } | null }[];
}

interface Evaluacion {
  id: number;
  ot_id: number;
  modelo_evaluacion: string;
  sistema_medicion: string;
  fecha_evaluacion: string | null;
  evaluado_por: string | null;
  supervisor: string | null;
  datos_formulario: Record<string, unknown>;
  resultado_general: string | null;
  recomendaciones_general: string | null;
  informe_key: string | null;
  informe_nombre: string | null;
  informe_fecha_subida: string | null;
  estado: string;
  revisado_por?: string | null;
  fecha_revision?: string | null;
  comentarios_revision?: string | null;
  solicitado_revision_por?: string | null;
  fecha_solicitud_revision?: string | null;
}

const estadoColorPage: Record<string, string> = {
  BORRADOR: "default",
  COMPLETADA: "blue",
  PENDIENTE_APROBACION: "gold",
  APROBADA: "green",
  RECHAZADA: "red",
};

const estadoLabelPage: Record<string, string> = {
  BORRADOR: "Borrador",
  COMPLETADA: "Completada",
  PENDIENTE_APROBACION: "Pendiente Aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

const estadoIconPage: Record<string, React.ReactNode> = {
  BORRADOR: <EditOutlined />,
  COMPLETADA: <FileDoneOutlined />,
  PENDIENTE_APROBACION: <ClockCircleOutlined />,
  APROBADA: <CheckCircleOutlined />,
  RECHAZADA: <CloseCircleOutlined />,
};

export default function EvaluacionPage() {
  const params = useParams();
  const router = useRouter();
  const { message } = App.useApp();
  const { screens } = useResponsive();
  const [form] = Form.useForm();
  const otId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesWarning(dirty, "Hay cambios sin guardar en la hoja de evaluación.", `evaluacion-${otId}`);
  const [ot, setOt] = useState<OTDetalle | null>(null);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [modeloEvaluacion, setModeloEvaluacion] = useState<string>("cil_vastago_simple");
  // Tipo determinado por el código reparable de la OT (autoritativo, según el Excel).
  const [tipoCodRep, setTipoCodRep] = useState<
    { codRepCodigo: string | null; tipoCodigo: string; tipoNombre: string; tienePlantilla: boolean } | null
  >(null);
  const [sistemaMedicion, setSistemaMedicion] = useState<string>("Metrico");
  const [modeloBloqueado, setModeloBloqueado] = useState(false);
  const [datosFormulario, setDatosFormulario] = useState<Record<string, unknown>>({});
  const [trabajadores, setTrabajadores] = useState<{ trabajador_id: number; nombre: string; puesto: string }[]>([]);
  const [supervisores, setSupervisores] = useState<{ trabajador_id: number; nombre: string; puesto: string }[]>([]);

  // Modal revision
  const [modalAccion, setModalAccion] = useState<"solicitar" | "aprobar" | "rechazar" | "reabrir" | null>(null);
  const [accionForm] = Form.useForm();
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const { data: session } = useSession();
  const currentUser = session?.user?.name ?? session?.user?.email ?? "";
  // Cada vez que abro el modal de acción, pre-fileo el "usuario" con el
  // nombre del logueado. El input queda disabled — no debe poder cambiarlo.
  useEffect(() => {
    if (modalAccion) accionForm.setFieldValue("usuario", currentUser);
  }, [modalAccion, currentUser, accionForm]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const resOT = await fetch(`/api/ordenes-trabajo/${otId}`);
      const jsonOT = await resOT.json();
      if (!resOT.ok) throw new Error(jsonOT.error || "Error al cargar OT");
      const otData = jsonOT.data as OTDetalle;
      setOt(otData);

      // ── Determinar el TIPO de hoja de evaluación ──────────────────
      // Prioridad:
      //  1. Tipo del CÓDIGO REPARABLE de la OT (autoritativo: lo define el
      //     catálogo "5. Cod Rep" — CHVS/CHP/CHPDV/CHT/AE/AV/RD/SD). Así un
      //     bulldozer nunca abre una hoja que no le corresponde.
      //  2. Estrategia de la OT (regla por tipo).
      //  3. Detección heurística contra el Excel (descripción/NP/flota).
      //  4. Default editable.
      let modeloInicial = "cil_vastago_simple";
      let bloqueado = false;

      const crModeloCodigo = otData.codigo_reparacion?.modelo_evaluacion_codigo ?? null;

      // 1) Tipo oficial del código reparable
      if (crModeloCodigo) {
        const tienePl = tipoTienePlantilla(crModeloCodigo);
        setTipoCodRep({
          codRepCodigo: otData.codigo_reparacion?.codigo ?? null,
          tipoCodigo: crModeloCodigo,
          tipoNombre: nombreTipoCilindro(crModeloCodigo) ?? crModeloCodigo,
          tienePlantilla: tienePl,
        });
        const modeloForm = COD_REP_TIPO_A_MODELO_EVAL[crModeloCodigo];
        if (modeloForm) {
          modeloInicial = modeloForm;
          bloqueado = true; // el tipo lo manda el código reparable
        }
        // Sin plantilla equivalente (ej. FS): NO se bloquea ni se fuerza un
        // tipo erróneo — se avisa y el usuario elige manualmente.
      } else {
        setTipoCodRep(null);
      }

      // 2) Estrategia (sólo si el código reparable no fijó el tipo)
      if (!bloqueado && otData.estrategia && otData.tipo) {
        const detectado = detectarModeloDesdeEstrategia(otData.tipo);
        if (detectado) {
          modeloInicial = detectado;
          bloqueado = true;
        }
      }

      // 3) Detección heurística (sólo si no hay tipo del código reparable)
      if (!bloqueado && !crModeloCodigo) {
        const deteccion = detectarTipoCilindro({
          descripcion: otData.codigo_reparacion?.descripcion ?? otData.descripcion,
          np: otData.np,
          flota: otData.cod_rep_flota,
          posicion: otData.cod_rep_posicion,
        });
        if (deteccion.codigo) {
          const modeloFormulario = COD_REP_TIPO_A_MODELO_EVAL[deteccion.codigo];
          if (modeloFormulario) modeloInicial = modeloFormulario;
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
  }, [otId, message]);

  useEffect(() => {
    if (otId) cargarDatos();
  }, [otId, cargarDatos]);

  // Cargar trabajadores para los desplegables de la hoja:
  //   - "Evaluado por" → rol "evaluador" (técnicos del taller + algunos jefes).
  //   - "Supervisor"   → rol "aprobador_evaluacion" (solo los que pueden
  //     aprobar la hoja una vez llenada).
  useEffect(() => {
    fetch("/api/trabajadores?limit=200&paraEvaluacion=1")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.data) setTrabajadores(j.data); })
      .catch(() => { /* noop */ });
    fetch("/api/trabajadores?limit=200&paraSupervisor=1")
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.data) setSupervisores(j.data); })
      .catch(() => { /* noop */ });
  }, []);

  // Aplicar valores al Form despues de que este montado (cuando loading=false)
  useEffect(() => {
    if (loading || !evaluacion) return;
    form.setFieldsValue({
      evaluado_por: evaluacion.evaluado_por,
      supervisor: evaluacion.supervisor,
      fecha_evaluacion: evaluacion.fecha_evaluacion ? dayjs(evaluacion.fecha_evaluacion) : null,
      resultado_general: evaluacion.resultado_general,
      recomendaciones_general: evaluacion.recomendaciones_general,
    });
  }, [loading, evaluacion, form]);

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
        supervisor: values.supervisor || null,
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
      // Si la respuesta NO es JSON (típicamente cuando hay un 405 / 401 /
      // redirect a /login que devuelve HTML), evitamos el `res.json()` que
      // tira "Unexpected token 'M'" y mostramos un mensaje claro.
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const texto = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          throw new Error("Sesión expirada o sin permisos. Iniciá sesión nuevamente.");
        }
        if (res.status === 405) {
          throw new Error("El servidor rechazó el método (405). Probablemente la app no terminó de deployar — recargá la página en unos segundos.");
        }
        throw new Error(`Error ${res.status}: ${texto.slice(0, 200) || "respuesta inesperada del servidor"}`);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      setEvaluacion(json.data);
      setDirty(false);
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
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/evaluaciones/${evaluacion.id}/informe/upload-url`,
      });
      const res = await fetch(`/api/evaluaciones/${evaluacion.id}/informe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al registrar informe");
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
      // Dedup OCs directas + indirectas y armar la lista de números
      // para mostrarlos en el header del Word.
      const ocMap = new Map<number, string>();
      (ot?.compras ?? []).forEach((c) => ocMap.set(c.id, c.numero_po));
      (ot?.repuestos ?? []).forEach((r) => { if (r.compra) ocMap.set(r.compra.id, r.compra.numero_po); });
      const numerosOc = Array.from(ocMap.values()).sort();
      await generarWordEvaluacion({
        ot: ot ? { ...ot, po_cliente: ot.po_cliente, numeros_oc: numerosOc } : null,
        modeloEvaluacion,
        sistemaMedicion,
        fechaEvaluacion: values.fecha_evaluacion ? (values.fecha_evaluacion as Dayjs).format("DD/MM/YYYY") : "",
        evaluadoPor: values.evaluado_por || "",
        supervisor: values.supervisor || "",
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

  // Ejecutar accion de revision (solicitar/aprobar/rechazar/reabrir)
  const ejecutarAccionRevision = async () => {
    if (!modalAccion || !evaluacion) return;
    try {
      // validateFields lanza si el comentario está vacío (rules required).
      const values = await accionForm.validateFields();
      setProcesandoAccion(true);
      const res = await fetch(`/api/evaluaciones/${evaluacion.id}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: modalAccion,
          usuario: values.usuario || "Usuario",
          comentarios: (values.comentarios ?? "").trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      const textos: Record<string, string> = {
        solicitar: "Evaluación enviada a revisión",
        aprobar: "Evaluación aprobada",
        rechazar: "Evaluación rechazada",
        reabrir: "Evaluación reabierta en borrador",
      };
      message.success(textos[modalAccion]);
      setEvaluacion(json.data);
      setModalAccion(null);
      accionForm.resetFields();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Error");
    } finally {
      setProcesandoAccion(false);
    }
  };

  // Permisos segun estado
  const estado = evaluacion?.estado || "BORRADOR";
  const puedeEditar = ["BORRADOR", "COMPLETADA", "RECHAZADA"].includes(estado);
  const puedeSolicitar = ["BORRADOR", "COMPLETADA", "RECHAZADA"].includes(estado) && !!evaluacion?.id;
  const puedeAprobarRechazar = estado === "PENDIENTE_APROBACION";
  const puedeReabrir = ["APROBADA", "RECHAZADA"].includes(estado);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!ot) {
    return <Alert type="error" title="OT no encontrada" />;
  }

  const clienteNombre = ot.cliente?.nombre_comercial ?? ot.cliente?.razon_social ?? "-";

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => { if (confirmLeave()) router.push("/ordenes-trabajo"); }}
          style={{ marginBottom: 8 }}
        >
          Volver a Ordenes de Trabajo
        </Button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Hoja de Evaluacion Tecnica
            </Title>
            <Space>
              <Text type="secondary">OT:</Text>
              <Tag color={brand.navy}>{ot.ot}</Tag>
              {evaluacion && (
                <Tag color={estadoColorPage[estado] || "default"} icon={estadoIconPage[estado]}>
                  {estadoLabelPage[estado] || estado}
                </Tag>
              )}
            </Space>
          </div>
          <Space wrap>
            <Button icon={<FileWordOutlined />} onClick={handleGenerarWord}>
              Descargar Word
            </Button>
            {puedeEditar && (
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleGuardar}
              >
                Guardar Hoja
              </Button>
            )}
            {puedeSolicitar && (
              <Button
                icon={<SendOutlined />}
                style={{ background: brand.cyan, color: brand.white, borderColor: brand.cyan }}
                onClick={() => setModalAccion("solicitar")}
              >
                Enviar a revisión
              </Button>
            )}
            {puedeAprobarRechazar && (
              <>
                <Button
                  icon={<CheckCircleOutlined />}
                  style={{ background: "#52c41a", color: brand.white, borderColor: "#52c41a" }}
                  onClick={() => setModalAccion("aprobar")}
                >
                  Aprobar
                </Button>
                <Button danger icon={<CloseCircleOutlined />} onClick={() => setModalAccion("rechazar")}>
                  Rechazar
                </Button>
              </>
            )}
            {puedeReabrir && (
              <Button icon={<EditOutlined />} onClick={() => setModalAccion("reabrir")}>
                Reabrir / Editar
              </Button>
            )}
          </Space>
        </div>

        {/* Alert con info de revision */}
        {evaluacion && estado === "PENDIENTE_APROBACION" && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            icon={<ClockCircleOutlined />}
            title="Esta evaluación está pendiente de aprobación"
            description={
              evaluacion.solicitado_revision_por
                ? `Enviada por ${evaluacion.solicitado_revision_por}${
                    evaluacion.fecha_solicitud_revision
                      ? ` el ${dayjs(evaluacion.fecha_solicitud_revision).format("DD/MM/YYYY HH:mm")}`
                      : ""
                  }`
                : "Esperando revisión del supervisor"
            }
          />
        )}
        {evaluacion && estado === "APROBADA" && (
          <Alert
            style={{ marginTop: 12 }}
            type="success"
            showIcon
            title="Evaluación aprobada — bloqueada para edición"
            description={
              <>
                Aprobada por <b>{evaluacion.revisado_por}</b>
                {evaluacion.fecha_revision && ` el ${dayjs(evaluacion.fecha_revision).format("DD/MM/YYYY HH:mm")}`}
                {evaluacion.comentarios_revision && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <b>Comentarios:</b> {evaluacion.comentarios_revision}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <LockOutlined /> Los campos están bloqueados. Usa <b>Reabrir / Editar</b> para modificar la evaluación.
                </div>
              </>
            }
          />
        )}
        {evaluacion && estado === "RECHAZADA" && (
          <Alert
            style={{ marginTop: 12 }}
            type="error"
            showIcon
            title="Evaluación rechazada"
            description={
              <>
                Rechazada por <b>{evaluacion.revisado_por}</b>
                {evaluacion.fecha_revision && ` el ${dayjs(evaluacion.fecha_revision).format("DD/MM/YYYY HH:mm")}`}
                {evaluacion.comentarios_revision && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <b>Motivo:</b> {evaluacion.comentarios_revision}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Usa <b>Reabrir / Editar</b> para hacer cambios y enviarla nuevamente.
                </div>
              </>
            }
          />
        )}
      </div>

      {/* ── Seccion 1: Datos Generales ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: brand.white, borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>1</span>
            Datos Generales de la OT
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>Fecha de Ingreso</Text>
            <div>{ot.fecha_recepcion ? formatDateOnly(ot.fecha_recepcion) : "-"}</div>
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
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary" style={{ fontSize: 12 }}>PO Cliente</Text>
            <div>{ot.po_cliente || "-"}</div>
          </Col>
          <Col xs={24} sm={12} md={16}>
            <Text type="secondary" style={{ fontSize: 12 }}>Nº OC</Text>
            <div>
              {(() => {
                // Dedup OCs directas + indirectas por id
                const map = new Map<number, { numero_po: string }>();
                (ot.compras ?? []).forEach((c) => map.set(c.id, c));
                (ot.repuestos ?? []).forEach((r) => { if (r.compra) map.set(r.compra.id, r.compra); });
                const ocs = Array.from(map.values());
                if (ocs.length === 0) return "-";
                return (
                  <Space size={4} wrap>
                    {ocs.map((c) => <Tag key={c.numero_po} color="cyan">{c.numero_po}</Tag>)}
                  </Space>
                );
              })()}
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── Seccion 2: Configuracion evaluacion ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: brand.white, borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>2</span>
            Configuracion de la Evaluacion
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Form form={form} layout="vertical" disabled={!puedeEditar} onValuesChange={() => { if (!dirty) setDirty(true); }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item label="Modelo / Tipo de componente">
                <Select showSearch optionFilterProp="label"
                  value={modeloEvaluacion}
                  onChange={setModeloEvaluacion}
                  disabled={modeloBloqueado || !puedeEditar}
                  suffixIcon={modeloBloqueado ? <LockOutlined /> : undefined}
                  options={MODELOS_EVALUACION.map((m) => ({
                    label: m.label,
                    value: m.value,
                  }))}
                />
                {tipoCodRep && (
                  tipoCodRep.tienePlantilla ? (
                    <Alert
                      type="success"
                      showIcon
                      icon={<LockOutlined />}
                      title={`Tipo según código reparable${tipoCodRep.codRepCodigo ? ` ${tipoCodRep.codRepCodigo}` : ""}: ${tipoCodRep.tipoCodigo} — ${tipoCodRep.tipoNombre}`}
                      description={
                        <span style={{ fontSize: 11 }}>
                          La hoja de evaluación se asigna automáticamente según el
                          tipo del código reparable de la OT.
                        </span>
                      }
                      style={{ marginTop: 8 }}
                      banner
                    />
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      icon={<InfoCircleOutlined />}
                      title={`Código reparable${tipoCodRep.codRepCodigo ? ` ${tipoCodRep.codRepCodigo}` : ""} de tipo ${tipoCodRep.tipoCodigo} — ${tipoCodRep.tipoNombre}`}
                      description={
                        <span style={{ fontSize: 11 }}>
                          Este tipo todavía no tiene una hoja de evaluación
                          equivalente. Seleccioná manualmente el modelo apropiado
                          (no se fuerza un tipo automático para no abrir una hoja
                          equivocada).
                        </span>
                      }
                      style={{ marginTop: 8 }}
                      banner
                    />
                  )
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Sistema de Medicion">
                <Select showSearch optionFilterProp="label"
                  value={sistemaMedicion}
                  onChange={setSistemaMedicion}
                  disabled={!puedeEditar}
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
            <Col xs={24} md={3}>
              <Form.Item label="Evaluado por" name="evaluado_por">
                <Select
                  placeholder="Seleccioná un trabajador..."
                  showSearch
                  allowClear
                  filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                  options={trabajadores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.puesto}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={3}>
              <Form.Item label="Supervisor" name="supervisor">
                <Select
                  placeholder="Seleccioná un supervisor..."
                  showSearch
                  allowClear
                  filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
                  options={supervisores.map((t) => ({ value: t.nombre, label: `${t.nombre} — ${t.puesto}` }))}
                />
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
        readonly={!puedeEditar}
        np={ot.np}
        descripcionCilindro={ot.codigo_reparacion?.descripcion ?? ot.descripcion}
        marca={ot.fabricante?.nombre ?? null}
        modeloCilindro={ot.cod_rep_flota}
      />

      {/* ── Seccion final: Resultado y Recomendaciones ── */}
      <Card
        title={
          <Space>
            <span style={{ background: brand.navy, color: brand.white, borderRadius: "50%", width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>F</span>
            Resultado General y Recomendaciones
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Form form={form} layout="vertical" disabled={!puedeEditar} onValuesChange={() => { if (!dirty) setDirty(true); }}>
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
            title={
              <Space>
                <strong>{evaluacion.informe_nombre}</strong>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Subido: {evaluacion.informe_fecha_subida ? dayjs(evaluacion.informe_fecha_subida).format("DD/MM/YYYY HH:mm") : ""}
                </Text>
                <R2FileLink
                  resource="evaluacion-informe"
                  resourceId={evaluacion.id}
                  r2Key={evaluacion.informe_key!}
                >
                  <Button type="link" size="small" icon={<DownloadOutlined />}>
                    Descargar
                  </Button>
                </R2FileLink>
              </Space>
            }
          />
        )}
        <Upload
          beforeUpload={(file) => handleUploadInforme(file as File)}
          showUploadList={false}
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          maxCount={1}
          disabled={!puedeEditar}
        >
          <Button icon={<UploadOutlined />} loading={uploading} disabled={!puedeEditar}>
            {evaluacion?.informe_nombre ? "Reemplazar Informe" : "Subir Informe"}
          </Button>
        </Upload>
        <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          Formatos aceptados: PDF, Word, Excel. Maximo 20MB.
          {!puedeEditar && (
            <span style={{ color: "#cf1322", marginLeft: 8 }}>
              <LockOutlined /> Bloqueado mientras la evaluacion este {estadoLabelPage[estado] || estado}. Reabrela para modificar.
            </span>
          )}
        </Text>
      </Card>

      <Divider />

      {/* Boton guardar al final */}
      <div style={{ textAlign: "right", marginBottom: 40 }}>
        <Space wrap>
          <Button onClick={() => { if (confirmLeave()) router.push("/ordenes-trabajo"); }}>Cancelar</Button>
          <Button icon={<FileWordOutlined />} onClick={handleGenerarWord}>
            Descargar Word
          </Button>
          {puedeEditar && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              size="large"
              loading={saving}
              onClick={handleGuardar}
            >
              Guardar Hoja de Evaluacion
            </Button>
          )}
          {puedeSolicitar && (
            <Button
              icon={<SendOutlined />}
              size="large"
              style={{ background: brand.cyan, color: brand.white, borderColor: brand.cyan }}
              onClick={() => setModalAccion("solicitar")}
            >
              Enviar a revisión
            </Button>
          )}
        </Space>
      </div>

      {/* Modal de revisión */}
      <Modal
        title={
          modalAccion === "solicitar"
            ? <Space><SendOutlined style={{ color: brand.cyan }} />Enviar a revisión</Space>
            : modalAccion === "aprobar"
            ? <Space><CheckCircleOutlined style={{ color: "#52c41a" }} />Aprobar Evaluación</Space>
            : modalAccion === "rechazar"
            ? <Space><CloseCircleOutlined style={{ color: brand.error }} />Rechazar Evaluación</Space>
            : <Space><EditOutlined />Reabrir Evaluación</Space>
        }
        open={!!modalAccion}
        onCancel={() => setModalAccion(null)}
        onOk={ejecutarAccionRevision}
        confirmLoading={procesandoAccion}
        width={modalWidth(screens, 520)}
        forceRender
        okText={
          modalAccion === "solicitar" ? "Enviar" :
          modalAccion === "aprobar" ? "Aprobar" :
          modalAccion === "rechazar" ? "Rechazar" : "Reabrir"
        }
        okButtonProps={{ danger: modalAccion === "rechazar", type: "primary" }}
      >
        <Form form={accionForm} layout="vertical">
          <Form.Item
            label={modalAccion === "solicitar" ? "Tu nombre (evaluador)" : "Tu nombre"}
            name="usuario"
            rules={[{ required: true, message: "Ingresa tu nombre" }]}
            tooltip="Se completa automáticamente con tu usuario logueado."
          >
            <Input placeholder="Ej. Juan Pérez" disabled />
          </Form.Item>
          <Form.Item
            label={
              <span>
                {modalAccion === "solicitar" ? "Comentarios para el revisor"
                  : modalAccion === "rechazar" ? "Motivo del rechazo"
                  : modalAccion === "reabrir" ? "Motivo de la reapertura"
                  : "Comentarios"}{" "}
                <Text type="secondary" style={{ fontWeight: 400 }}>(opcional)</Text>
              </span>
            }
            name="comentarios"
          >
            <Input.TextArea rows={3} placeholder="Observaciones..." maxLength={500} showCount />
          </Form.Item>
          {modalAccion === "solicitar" && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Al enviar a revisión, la evaluación quedará bloqueada hasta que el revisor la apruebe o rechace.
            </Text>
          )}
          {modalAccion === "rechazar" && (
            <Text type="warning" style={{ fontSize: 12 }}>
              ⚠ Al rechazar, el evaluador podrá reabrirla y volver a enviarla.
            </Text>
          )}
          {modalAccion === "reabrir" && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              La evaluación volverá a estado <b>Borrador</b>. Podrás editarla y enviarla nuevamente a revisión.
            </Text>
          )}
        </Form>
      </Modal>
    </div>
  );
}

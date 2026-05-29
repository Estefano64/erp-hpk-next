"use client";

import { useState, useEffect } from "react";
import {
  Typography,
  Form,
  Input,
  Select,
  Button,
  InputNumber,
  DatePicker,
  Checkbox,
  Row,
  Col,
  Card,
  Divider,
  message,
  Descriptions,
  Space,
} from "antd";
import { SaveOutlined, ArrowLeftOutlined, CheckCircleFilled } from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { useUnsavedChangesWarning, confirmLeave } from "@/lib/unsaved-changes";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CatalogOption {
  codigo: string;
  nombre: string;
}

interface FabricanteOption {
  fabricante_id: number;
  codigo: string;
  nombre: string;
}

interface ClienteOption {
  cliente_id: number;
  codigo: string;
  nombre_comercial: string | null;
  razon_social: string;
}

interface CodRepOption {
  cod_rep_id: number;
  codigo: string;
  descripcion: string;
  np: string | null;
  tipo: { nombre: string } | null;
  flota: { nombre: string } | null;
  fabricante: { fabricante_id: number; nombre: string } | null;
  posicion: { nombre: string } | null;
}

export default function NuevaOTPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  // Marca el formulario como "dirty" al primer cambio. Se limpia al guardar
  // o al cancelar.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesWarning(dirty, "Estás creando una OT con datos sin guardar.", "nueva-ot");

  // Catálogos
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [codReps, setCodReps] = useState<CodRepOption[]>([]);
  const [tipoReparaciones, setTipoReparaciones] = useState<CatalogOption[]>([]);
  const [atencionReparaciones, setAtencionReparaciones] = useState<CatalogOption[]>([]);
  const [prioridades, setPrioridades] = useState<CatalogOption[]>([]);
  const [tipoGarantias, setTipoGarantias] = useState<CatalogOption[]>([]);
  const [tiposCodRep, setTiposCodRep] = useState<CatalogOption[]>([]);
  const [tiposOT, setTiposOT] = useState<CatalogOption[]>([]);
  const [fabricantes, setFabricantes] = useState<FabricanteOption[]>([]);
  const [posiciones, setPosiciones] = useState<CatalogOption[]>([]);
  const [monedas, setMonedas] = useState<CatalogOption[]>([]);

  // Estado del form para lógica condicional
  const [estrategia, setEstrategia] = useState(false);
  const [garantia, setGarantia] = useState(false);
  const [atencionCodigo, setAtencionCodigo] = useState("");
  const [selectedCodRep, setSelectedCodRep] = useState<CodRepOption | null>(null);

  // Bloqueo de campos según Tipo OT (BIE = Bien, SER = Servicio).
  // Bien y Servicio no son cilindros físicos a reparar, así que no aplican datos
  // de recepción, PCR/horas, ni Tipo Reparación / Atención / Base Metálica.
  // Servicio además fuerza Estrategia=No (no hay cod_rep asociado).
  const tipoOTCodigo = Form.useWatch<string | undefined>("tipo_codigo", form);
  const bloqueoBien = tipoOTCodigo === "BIE" || tipoOTCodigo === "SER";
  const bloqueoServicio = tipoOTCodigo === "SER";

  // Campos calculados
  const [porcentajePcr, setPorcentajePcr] = useState<number | null>(null);
  const [contratoDias, setContratoDias] = useState<number | null>(null);
  const [fechaReqCalculada, setFechaReqCalculada] = useState<string | null>(null);
  const [diasCalculados, setDiasCalculados] = useState<number | null>(null);
  const [tieneContrato, setTieneContrato] = useState(false);

  useEffect(() => {
    async function loadCatalogs() {
      const [cliRes, crRes, tipoRepRes, atencionRes, prioRes, tipoGarRes, tipoCRRes, fabRes, posRes, tipoOTRes, monRes] = await Promise.all([
        fetch("/api/clientes?limit=100"),
        fetch("/api/codigos-reparacion?limit=500"),
        fetch("/api/catalogos?tabla=tipoReparacion"),
        fetch("/api/catalogos?tabla=atencionReparacion"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=tipoGarantia"),
        fetch("/api/catalogos?tabla=tipoCodRep"),
        fetch("/api/catalogos?tabla=fabricante"),
        fetch("/api/catalogos?tabla=posicion"),
        fetch("/api/catalogos?tabla=tipoOT"),
        fetch("/api/catalogos?tabla=moneda"),
      ]);
      if (cliRes.ok) setClientes((await cliRes.json()).data ?? []);
      if (crRes.ok) setCodReps((await crRes.json()).data ?? []);
      if (tipoRepRes.ok) setTipoReparaciones((await tipoRepRes.json()).data ?? []);
      if (atencionRes.ok) setAtencionReparaciones((await atencionRes.json()).data ?? []);
      if (prioRes.ok) setPrioridades((await prioRes.json()).data ?? []);
      if (tipoGarRes.ok) setTipoGarantias((await tipoGarRes.json()).data ?? []);
      if (tipoCRRes.ok) setTiposCodRep((await tipoCRRes.json()).data ?? []);
      if (fabRes.ok) setFabricantes((await fabRes.json()).data ?? []);
      if (posRes.ok) setPosiciones((await posRes.json()).data ?? []);
      if (tipoOTRes.ok) setTiposOT((await tipoOTRes.json()).data ?? []);
      if (monRes.ok) setMonedas((await monRes.json()).data ?? []);
    }
    loadCatalogs();
  }, []);

  // Al cambiar Tipo OT a Bien/Servicio, limpiamos los campos bloqueados para
  // que no queden valores fantasma del flujo de Reparación. Disparado SOLO en
  // la transición — si el usuario cambia de Bien a Servicio queremos preservar
  // lo que ya escribió en campos comunes.
  useEffect(() => {
    if (bloqueoBien) {
      form.setFieldsValue({
        id_viajero: undefined,
        guia_remision: undefined,
        empresa_entrega: undefined,
        fecha_recepcion: undefined,
        pcr: undefined,
        horas: undefined,
        atencion_reparacion_codigo: undefined,
        tipo_reparacion_codigo: undefined,
        base_metalica: false,
        fecha_requerimiento_cliente: undefined,
      });
      setAtencionCodigo("");
      setPorcentajePcr(null);
      setDiasCalculados(null);
      setFechaReqCalculada(null);
      setContratoDias(null);
      setTieneContrato(false);
    }
    if (bloqueoServicio) {
      setEstrategia(false);
      form.setFieldValue("id_cod_rep", undefined);
      setSelectedCodRep(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloqueoBien, bloqueoServicio]);

  // Cuando cambia Cod Rep, autocompletar campos. El N/P se pre-fillea en el
  // form para que el usuario lo pueda sobreescribir (a pedido del cliente:
  // algunas piezas comparten cod_rep pero traen variantes de N/P).
  function handleCodRepChange(codRepId: number | undefined) {
    if (!codRepId) {
      setSelectedCodRep(null);
      form.setFieldValue("np", undefined);
      return;
    }
    const found = codReps.find((cr) => cr.cod_rep_id === codRepId);
    setSelectedCodRep(found ?? null);
    form.setFieldValue("np", found?.np ?? undefined);
  }

  // Calcular % PCR cuando cambian PCR o Horas
  function recalcPcr() {
    const pcr = form.getFieldValue("pcr");
    const horas = form.getFieldValue("horas");
    if (pcr && horas && Number(pcr) > 0) {
      setPorcentajePcr(Number(((Number(horas) / Number(pcr)) * 100).toFixed(2)));
    } else {
      setPorcentajePcr(null);
    }
  }

  // Buscar contrato cuando cambia cliente o cod_rep
  async function buscarContrato(clienteId?: number, codRepId?: number) {
    const cId = clienteId ?? form.getFieldValue("id_cliente");
    const crId = codRepId ?? form.getFieldValue("id_cod_rep");
    const fechaRecepcion = form.getFieldValue("fecha_recepcion");

    if (cId && crId) {
      const res = await fetch(`/api/contratos?cliente=${cId}&limit=100`);
      if (res.ok) {
        const json = await res.json();
        const contrato = (json.data ?? []).find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => c.cod_rep_id === crId && c.activo !== false
        );
        if (contrato) {
          setTieneContrato(true);
          setContratoDias(contrato.dias_reparacion);
          if (fechaRecepcion) {
            const req = dayjs(fechaRecepcion).add(contrato.dias_reparacion, "day");
            setFechaReqCalculada(req.format("DD/MM/YYYY"));
          }
          return;
        }
      }
    }
    setTieneContrato(false);
    setContratoDias(null);
    setFechaReqCalculada(null);
    // Si tenía "Contrato" seleccionado y ya no hay match, limpiarlo
    if (form.getFieldValue("atencion_reparacion_codigo") === "Contrato") {
      form.setFieldValue("atencion_reparacion_codigo", undefined);
      setAtencionCodigo("");
    }
  }

  // Cuando cambia fecha recepción, recalcular según atención
  function handleFechaRecepcionChange() {
    const atencion = form.getFieldValue("atencion_reparacion_codigo");
    const fechaRecepcion = form.getFieldValue("fecha_recepcion");
    if (atencion === "Contrato" && contratoDias && fechaRecepcion) {
      const req = dayjs(fechaRecepcion).add(contratoDias, "day");
      setFechaReqCalculada(req.format("DD/MM/YYYY"));
    }
    // Si la fecha de requerimiento ya está y quedó antes de la nueva fecha de recepción, limpiarla.
    const fechaReq = form.getFieldValue("fecha_requerimiento_cliente");
    if (fechaRecepcion && fechaReq && dayjs(fechaReq).isBefore(dayjs(fechaRecepcion), "day")) {
      form.setFieldValue("fecha_requerimiento_cliente", null);
    }
    // Recalcular días para Presupuesto/Emergencia
    if (atencion !== "Contrato") {
      calcularDiasRequerimiento();
    }
  }

  // Calcula días entre fecha recepción y fecha requerimiento (Presupuesto/Emergencia)
  function calcularDiasRequerimiento() {
    const fechaRecepcion = form.getFieldValue("fecha_recepcion");
    const fechaReq = form.getFieldValue("fecha_requerimiento_cliente");
    if (fechaRecepcion && fechaReq) {
      const diff = dayjs(fechaReq).diff(dayjs(fechaRecepcion), "day");
      setDiasCalculados(diff);
    } else {
      setDiasCalculados(null);
    }
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload: Record<string, unknown> = {
        id_cliente: values.id_cliente,
        estrategia: bloqueoServicio ? false : estrategia,
        id_cod_rep: bloqueoServicio ? null : (estrategia ? values.id_cod_rep : null),
        // Si NO hay estrategia, mandar los campos manuales. Si sí hay, el backend deriva del cod_rep.
        tipo: estrategia ? null : (values.tipo || null),
        tipo_codigo: values.tipo_codigo,
        // N/P: siempre enviar el valor del form (con estrategia, el usuario
        // puede sobreescribir el N/P sugerido por el cod_rep).
        np: values.np || null,
        descripcion: estrategia ? null : (values.descripcion || null),
        id_fabricante: estrategia ? null : (values.id_fabricante || null),
        cod_rep_flota: estrategia ? null : (values.cod_rep_flota || null),
        cod_rep_posicion: estrategia ? null : (values.cod_rep_posicion || null),
        equipo_codigo: values.equipo_codigo || null,
        ns: values.ns || null,
        plaqueteo: values.plaqueteo || null,
        wo_cliente: values.wo_cliente || null,
        po_cliente: values.po_cliente || null,
        po_item: values.po_item || null,
        // Bloqueados para Bien/Servicio: forzar null para no persistir basura
        // si el usuario llenó algo antes de cambiar el Tipo OT.
        id_viajero: bloqueoBien ? null : (values.id_viajero || null),
        guia_remision: bloqueoBien ? null : (values.guia_remision || null),
        empresa_entrega: bloqueoBien ? null : (values.empresa_entrega || null),
        fecha_recepcion: bloqueoBien ? null : (values.fecha_recepcion ? values.fecha_recepcion.format("YYYY-MM-DD") : null),
        pcr: bloqueoBien ? null : (values.pcr ?? null),
        horas: bloqueoBien ? null : (values.horas ?? null),
        garantia_codigo: garantia ? "Si" : "No",
        atencion_reparacion_codigo: bloqueoBien ? null : (values.atencion_reparacion_codigo || null),
        tipo_reparacion_codigo: bloqueoBien ? null : (values.tipo_reparacion_codigo || null),
        tipo_garantia_codigo: garantia ? (values.tipo_garantia_codigo || null) : "NA",
        prioridad_atencion_codigo: values.prioridad_atencion_codigo || null,
        base_metalica_codigo: bloqueoBien ? "No" : (values.base_metalica ? "Si" : "No"),
        monto_cotizacion: values.monto_cotizacion ?? null,
        moneda_cotizacion_codigo: values.moneda_cotizacion_codigo || null,
        comentarios: values.comentarios || null,
        fecha_requerimiento_cliente: !bloqueoBien && atencionCodigo !== "Contrato" && values.fecha_requerimiento_cliente
          ? values.fecha_requerimiento_cliente.format("YYYY-MM-DD")
          : null,
      };

      const res = await fetch("/api/ordenes-trabajo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();

      messageApi.success("OT creada correctamente");
      setDirty(false); // ya guardamos, sacamos el aviso antes de navegar
      setTimeout(() => router.push("/ordenes-trabajo"), 1000);
    } catch {
      messageApi.error("Error al crear la OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {contextHolder}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => { if (confirmLeave()) router.push("/ordenes-trabajo"); }}
        />
        <Title level={3} style={{ margin: 0 }}>Nueva Orden de Trabajo</Title>
      </div>

      <Form
        form={form}
        layout="vertical"
        onValuesChange={() => { if (!dirty) setDirty(true); }}
      >
        {/* ── SECCIÓN: Cliente y Código Reparable ── */}
        <Card title="Identificación" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item
                name="tipo_codigo"
                label="Tipo OT"
                rules={[{ required: true, message: "Requerido" }]}
                tooltip="Reparación: cilindro a reparar. Bien: venta de repuesto. Servicio: servicio facturado."
              >
                <Select
                  placeholder="Seleccionar tipo"
                  options={tiposOT.map((t) => ({ value: t.codigo, label: t.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="id_cliente" label="Cliente" rules={[{ required: true, message: "Requerido" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Seleccionar cliente"
                  onChange={(v) => { buscarContrato(v, undefined); }}
                  options={clientes.map((c) => ({
                    value: c.cliente_id,
                    label: `${c.codigo} - ${c.nombre_comercial ?? c.razon_social}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Estrategia">
                <Checkbox
                  checked={estrategia}
                  disabled={bloqueoServicio}
                  onChange={(e) => {
                    setEstrategia(e.target.checked);
                    if (!e.target.checked) {
                      form.setFieldValue("id_cod_rep", undefined);
                      setSelectedCodRep(null);
                    }
                  }}
                >
                  Si
                </Checkbox>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="id_cod_rep"
                label="Código Reparable"
                extra={
                  tieneContrato ? (
                    <Text style={{ color: brand.success, fontSize: 12 }}>
                      <CheckCircleFilled style={{ marginRight: 4 }} />
                      Contrato vigente{contratoDias != null ? ` (${contratoDias} días de reparación)` : ""}
                    </Text>
                  ) : undefined
                }
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={
                    bloqueoServicio
                      ? "No aplica para Servicio"
                      : estrategia ? "Seleccionar código reparable" : "Habilite estrategia primero"
                  }
                  disabled={bloqueoServicio || !estrategia}
                  allowClear
                  onChange={(v) => { handleCodRepChange(v); buscarContrato(undefined, v); }}
                  options={codReps.map((cr) => ({
                    value: cr.cod_rep_id,
                    label: `${cr.codigo} - ${cr.descripcion}${cr.np ? ` · N/P ${cr.np}` : ""}${cr.flota?.nombre ? ` · ${cr.flota.nombre}` : ""}`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Si hay estrategia + cod_rep → mostrar info read-only del cod_rep,
              excepto N/P que queda editable (puede variar entre piezas que
              comparten cod_rep). Si NO hay estrategia → inputs editables. */}
          {estrategia && selectedCodRep && (
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2, md: 3 }}
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="Tipo">{selectedCodRep.tipo?.nombre ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="N/P">
                <Form.Item name="np" noStyle>
                  <Input size="small" placeholder={selectedCodRep.np ?? "—"} style={{ minWidth: 140 }} />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="Descripción">{selectedCodRep.descripcion}</Descriptions.Item>
              <Descriptions.Item label="Fabricante">{selectedCodRep.fabricante?.nombre ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Flota">{selectedCodRep.flota?.nombre ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Posición">{selectedCodRep.posicion?.nombre ?? "-"}</Descriptions.Item>
            </Descriptions>
          )}
          {!estrategia && (
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Form.Item name="tipo" label="Tipo" rules={[{ required: true, message: "Requerido" }]}>
                  <Select
                    placeholder="Seleccionar tipo"
                    showSearch optionFilterProp="label"
                    options={tiposCodRep.map((t) => ({ value: t.codigo, label: t.nombre }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="np" label="N/P">
                  <Input placeholder="Ej. 219-2540" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="descripcion" label="Descripción" rules={[{ required: true, message: "Requerido" }]}>
                  <Input placeholder="Ej. ACUMULADOR DE DIRECCION" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="id_fabricante" label="Fabricante">
                  <Select
                    placeholder="Seleccionar"
                    allowClear showSearch optionFilterProp="label"
                    options={fabricantes.map((f) => ({ value: f.fabricante_id, label: f.nombre }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="cod_rep_flota" label="Flota">
                  <Input placeholder="Ej. 980E" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="cod_rep_posicion" label="Posición">
                  <Select
                    placeholder="Seleccionar"
                    allowClear showSearch optionFilterProp="label"
                    options={posiciones.map((p) => ({
                      value: p.codigo,
                      label: p.codigo === "no aplica" || p.nombre?.toLowerCase() === "no aplica"
                        ? "No aplica (unica)"
                        : p.nombre,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}
        </Card>

        {/* ── SECCIÓN: Datos del equipo ── */}
        <Card title="Datos del Equipo" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item name="equipo_codigo" label="Equipo">
                <Input placeholder="Ej: SH001" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="ns" label="N/S (Número de Serie)">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="plaqueteo" label="Plaqueteo">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── SECCIÓN: Documentos del cliente ── */}
        <Card title="Documentos y Logística" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
          <Row gutter={16}>
            <Col xs={12} md={6}>
              <Form.Item name="wo_cliente" label="WO Cliente">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="po_cliente" label="PO Cliente">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="po_item" label="PO Item">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="id_viajero" label="ID Viajero">
                <Input disabled={bloqueoBien} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="guia_remision" label="Guía Remisión (llegada)">
                <Input disabled={bloqueoBien} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="empresa_entrega" label="Empresa que entrega">
                <Input disabled={bloqueoBien} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="fecha_recepcion"
                label="Fecha de Recepción"
                rules={bloqueoBien ? [] : [{ required: true, message: "Requerido" }]}
              >
                <DatePicker
                  style={{ width: "100%" }}
                  format="DD/MM/YYYY"
                  disabled={bloqueoBien}
                  onChange={() => { handleFechaRecepcionChange(); }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── SECCIÓN: Datos técnicos ── */}
        <Card title="PCR y Horas de Trabajo" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
          <Row gutter={16}>
            <Col xs={8} md={5}>
              <Form.Item name="pcr" label="PCR (horas vida)">
                <InputNumber style={{ width: "100%" }} min={0} disabled={bloqueoBien} onChange={() => recalcPcr()} />
              </Form.Item>
            </Col>
            <Col xs={8} md={5}>
              <Form.Item name="horas" label="Horas actuales">
                <InputNumber style={{ width: "100%" }} min={0} disabled={bloqueoBien} onChange={() => recalcPcr()} />
              </Form.Item>
            </Col>
            <Col xs={8} md={4}>
              <Form.Item label="% PCR">
                <Text strong style={{ fontSize: 16 }}>
                  {porcentajePcr != null ? `${porcentajePcr}%` : "-"}
                </Text>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* ── SECCIÓN: Atención y Reparación ── */}
        <Card title="Tipo Reparación y Garantía" style={{ marginBottom: 16 }} styles={{ body: { paddingBottom: 0 } }}>
          <Row gutter={16}>
            <Col xs={12} md={4}>
              <Form.Item label="Garantía">
                <Checkbox
                  checked={garantia}
                  onChange={(e) => {
                    setGarantia(e.target.checked);
                    if (e.target.checked) {
                      form.setFieldValue("tipo_garantia_codigo", undefined);
                    } else {
                      form.setFieldValue("tipo_garantia_codigo", "NA");
                    }
                  }}
                >
                  Si
                </Checkbox>
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="atencion_reparacion_codigo"
                label="Atención Reparación"
                rules={bloqueoBien ? [] : [{ required: true, message: "Requerido" }]}
              >
                <Select
                  placeholder="Seleccionar"
                  disabled={bloqueoBien}
                  onChange={(v) => {
                    setAtencionCodigo(v ?? "");
                    buscarContrato();
                  }}
                  options={atencionReparaciones.map((a) => ({
                    value: a.codigo,
                    label: a.nombre,
                    disabled: a.codigo === "Contrato" && !tieneContrato,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="tipo_reparacion_codigo"
                label="Tipo Reparación"
                rules={bloqueoBien ? [] : [{ required: true, message: "Requerido" }]}
              >
                <Select
                  placeholder="Seleccionar"
                  disabled={bloqueoBien}
                  options={tipoReparaciones.map((t) => ({ value: t.codigo, label: t.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item
                name="tipo_garantia_codigo"
                label="Tipo Garantía"
                rules={garantia ? [{ required: true, message: "Seleccioná un tipo" }] : []}
              >
                <Select
                  placeholder={garantia ? "Seleccionar" : "NA"}
                  disabled={!garantia}
                  options={tipoGarantias
                    .filter((t) => t.codigo !== "NA")
                    .map((t) => ({ value: t.codigo, label: t.nombre }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="prioridad_atencion_codigo" label="Prioridad de Atención" rules={[{ required: true, message: "Requerido" }]}>
                <Select
                  placeholder="Seleccionar"
                  options={prioridades.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item label="Base Metálica" name="base_metalica" valuePropName="checked">
                <Checkbox disabled={bloqueoBien}>Si</Checkbox>
              </Form.Item>
            </Col>
            <Col xs={16} md={8}>
              <Form.Item label="Cotización (monto + moneda)">
                <Space.Compact style={{ display: "flex" }}>
                  <Form.Item name="monto_cotizacion" noStyle>
                    <InputNumber
                      placeholder="0.00"
                      min={0}
                      step={100}
                      style={{ flex: 1 }}
                      formatter={(v) => {
                        if (v == null) return "";
                        const n = Number(v);
                        return Number.isNaN(n) ? "" : n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
                      }}
                      parser={(v) => Number((v ?? "").replace(/[^\d.]/g, "")) as 0}
                    />
                  </Form.Item>
                  <Form.Item name="moneda_cotizacion_codigo" noStyle>
                    <Select
                      placeholder="Moneda"
                      style={{ width: 110 }}
                      options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))}
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          {!bloqueoBien && <Divider style={{ margin: "8px 0 16px" }} />}

          <Row gutter={16} style={{ display: bloqueoBien ? "none" : undefined }}>
            {atencionCodigo === "Contrato" ? (
              <>
                <Col xs={12} md={6}>
                  <Form.Item label="Días Contrato">
                    <Text strong style={{ fontSize: 16 }}>
                      {contratoDias != null ? `${contratoDias} días` : "Sin contrato"}
                    </Text>
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Fecha Requerimiento (calculada)">
                    <Text strong>{fechaReqCalculada ?? "-"}</Text>
                  </Form.Item>
                </Col>
              </>
            ) : (
              <>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="fecha_requerimiento_cliente"
                    label="Fecha Requerimiento Cliente"
                    dependencies={["fecha_recepcion"]}
                    rules={[
                      // Obligatoria salvo Bien/Servicio (no aplica) o Contrato
                      // (se calcula sola desde los días del contrato).
                      { required: !bloqueoBien, message: "Requerido" },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const recepcion = getFieldValue("fecha_recepcion");
                          if (!value || !recepcion) return Promise.resolve();
                          if (dayjs(value).isBefore(dayjs(recepcion), "day")) {
                            return Promise.reject(new Error("No puede ser anterior a la fecha de recepción"));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      style={{ width: "100%" }}
                      format="DD/MM/YYYY"
                      onChange={() => calcularDiasRequerimiento()}
                      disabledDate={(current) => {
                        const recepcion = form.getFieldValue("fecha_recepcion");
                        return !!(recepcion && current && current.isBefore(dayjs(recepcion), "day"));
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item label="Días calculados">
                    <Text strong style={{ fontSize: 16 }}>
                      {diasCalculados != null ? `${diasCalculados} días` : "-"}
                    </Text>
                  </Form.Item>
                </Col>
              </>
            )}
          </Row>
        </Card>

        {/* ── SECCIÓN: Comentarios ── */}
        <Card style={{ marginBottom: 24 }}>
          <Form.Item name="comentarios" label="Comentarios">
            <TextArea rows={3} placeholder="Observaciones adicionales..." />
          </Form.Item>
        </Card>

        {/* ── Botones ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <Button onClick={() => { if (confirmLeave()) router.push("/ordenes-trabajo"); }}>Cancelar</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            Crear OT
          </Button>
        </div>
      </Form>
    </div>
  );
}

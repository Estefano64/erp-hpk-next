"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Tabs,
  Select,
  Button,
  Row,
  Col,
  Typography,
  Divider,
  DatePicker,
  Input,
  InputNumber,
  Checkbox,
  message,
  Spin,
  Card,
} from "antd";
import {
  SaveOutlined,
  EditOutlined,
  CalendarOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  UnorderedListOutlined,
  InboxOutlined,
  DollarOutlined,
  PaperClipOutlined,
  HistoryOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { brand } from "@/lib/theme";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import OTAdjuntosTab from "./OTAdjuntosTab";

const { Text } = Typography;
const { TextArea } = Input;

interface CatalogOption {
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

interface OTDetalle {
  id: number;
  ot: string;
  estrategia: boolean;
  id_cliente: number | null;
  id_cod_rep: number | null;
  equipo_codigo: string | null;
  ns: string | null;
  plaqueteo: string | null;
  descripcion: string | null;
  tipo: string | null;
  np: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  id_viajero: string | null;
  guia_remision: string | null;
  empresa_entrega: string | null;
  fecha_recepcion: string | null;
  pcr: number | null;
  horas: number | null;
  porcentaje_pcr: number | null;
  comentarios: string | null;
  contrato_dias: number | null;
  fecha_requerimiento_cliente: string | null;
  fecha_reprogramada: string | null;
  ot_status_codigo: string | null;
  recursos_status_codigo: string | null;
  taller_status_codigo: string | null;
  garantia_codigo: string | null;
  atencion_reparacion_codigo: string | null;
  tipo_reparacion_codigo: string | null;
  tipo_garantia_codigo: string | null;
  prioridad_atencion_codigo: string | null;
  base_metalica_codigo: string | null;
  cliente: { codigo: string; nombre_comercial: string | null; razon_social: string } | null;
  codigo_reparacion: { codigo: string; descripcion: string } | null;
  fabricante: { nombre: string } | null;
  ot_status: { nombre: string } | null;
  recursos_status: { nombre: string } | null;
  taller_status: { nombre: string } | null;
  atencion_reparacion: { nombre: string } | null;
  tipo_reparacion: { nombre: string } | null;
  tipo_garantia: { nombre: string } | null;
  prioridad_atencion: { codigo: string; nombre: string } | null;
  base_metalica: { nombre: string } | null;
  garantia: { nombre: string } | null;
}

interface Props {
  otId: number | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

/* ── Helpers de presentación ── */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </Text>
      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{value || "-"}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, display: "block", marginBottom: 4 }}>
      {children}
    </Text>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${brand.border}` }}>
      <Text strong style={{ fontSize: 14, color: brand.navy }}>{children}</Text>
    </div>
  );
}

export default function OTDetalleModal({ otId, open, onClose, onUpdated }: Props) {
  const router = useRouter();
  const [ot, setOt] = useState<OTDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // Status (siempre editable)
  const [otStatus, setOtStatus] = useState("");
  const [recursosStatus, setRecursosStatus] = useState("");
  const [tallerStatus, setTallerStatus] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  // Comentarios (siempre editable, junto a estados)
  const [comentarios, setComentarios] = useState("");

  // Reprogramación
  const [showReprogramar, setShowReprogramar] = useState(false);
  const [nuevaFechaReq, setNuevaFechaReq] = useState<dayjs.Dayjs | null>(null);

  // Modo edición resto de campos
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Catálogos
  const [otStatuses, setOtStatuses] = useState<CatalogOption[]>([]);
  const [recursosStatuses, setRecursosStatuses] = useState<CatalogOption[]>([]);
  const [tallerStatuses, setTallerStatuses] = useState<CatalogOption[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [codReps, setCodReps] = useState<CodRepOption[]>([]);
  const [tipoReparaciones, setTipoReparaciones] = useState<CatalogOption[]>([]);
  const [atencionReparaciones, setAtencionReparaciones] = useState<CatalogOption[]>([]);
  const [prioridades, setPrioridades] = useState<CatalogOption[]>([]);
  const [tipoGarantias, setTipoGarantias] = useState<CatalogOption[]>([]);

  const fetchOT = useCallback(async () => {
    if (!otId) return;
    setLoading(true);
    const res = await fetch(`/api/ordenes-trabajo/${otId}`);
    if (res.ok) {
      const json = await res.json();
      const d = json.data;
      setOt(d);
      setOtStatus(d.ot_status_codigo ?? "");
      setRecursosStatus(d.recursos_status_codigo ?? "");
      setTallerStatus(d.taller_status_codigo ?? "");
      setComentarios(d.comentarios ?? "");
    }
    setLoading(false);
  }, [otId]);

  useEffect(() => {
    if (open && otId) {
      fetchOT();
      setShowReprogramar(false);
      setNuevaFechaReq(null);
      setEditing(false);
    }
  }, [open, otId, fetchOT]);

  useEffect(() => {
    async function load() {
      const [a, b, c, d, e, f, g, h, i] = await Promise.all([
        fetch("/api/catalogos?tabla=otStatus"),
        fetch("/api/catalogos?tabla=recursosStatus"),
        fetch("/api/catalogos?tabla=tallerStatus"),
        fetch("/api/clientes?limit=100"),
        fetch("/api/codigos-reparacion?limit=500"),
        fetch("/api/catalogos?tabla=tipoReparacion"),
        fetch("/api/catalogos?tabla=atencionReparacion"),
        fetch("/api/catalogos?tabla=prioridadAtencion"),
        fetch("/api/catalogos?tabla=tipoGarantia"),
      ]);
      if (a.ok) setOtStatuses((await a.json()).data ?? []);
      if (b.ok) setRecursosStatuses((await b.json()).data ?? []);
      if (c.ok) setTallerStatuses((await c.json()).data ?? []);
      if (d.ok) setClientes((await d.json()).data ?? []);
      if (e.ok) setCodReps((await e.json()).data ?? []);
      if (f.ok) setTipoReparaciones((await f.json()).data ?? []);
      if (g.ok) setAtencionReparaciones((await g.json()).data ?? []);
      if (h.ok) setPrioridades((await h.json()).data ?? []);
      if (i.ok) setTipoGarantias((await i.json()).data ?? []);
    }
    load();
  }, []);

  function startEditing() {
    if (!ot) return;
    setEditData({
      id_cliente: ot.id_cliente,
      estrategia: ot.estrategia,
      id_cod_rep: ot.id_cod_rep,
      equipo_codigo: ot.equipo_codigo,
      ns: ot.ns,
      plaqueteo: ot.plaqueteo,
      wo_cliente: ot.wo_cliente,
      po_cliente: ot.po_cliente,
      id_viajero: ot.id_viajero,
      guia_remision: ot.guia_remision,
      empresa_entrega: ot.empresa_entrega,
      fecha_recepcion: ot.fecha_recepcion,
      pcr: ot.pcr ? Number(ot.pcr) : null,
      horas: ot.horas ? Number(ot.horas) : null,
      garantia_codigo: ot.garantia_codigo,
      atencion_reparacion_codigo: ot.atencion_reparacion_codigo,
      tipo_reparacion_codigo: ot.tipo_reparacion_codigo,
      tipo_garantia_codigo: ot.tipo_garantia_codigo,
      prioridad_atencion_codigo: ot.prioridad_atencion_codigo,
      base_metalica_codigo: ot.base_metalica_codigo,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditData({});
  }

  function setField(key: string, value: unknown) {
    setEditData((prev) => ({ ...prev, [key]: value }));
  }

  /* ── Guardar estados + comentarios ── */
  async function handleSaveStatuses() {
    if (!ot) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${ot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ot_status_codigo: otStatus,
          recursos_status_codigo: recursosStatus,
          taller_status_codigo: tallerStatus,
          comentarios: comentarios || null,
        }),
      });
      if (!res.ok) throw new Error();
      messageApi.success("Estados y comentarios guardados");
      fetchOT();
      onUpdated?.();
    } catch {
      messageApi.error("Error al guardar");
    } finally {
      setSavingStatus(false);
    }
  }

  /* ── Guardar edición general ── */
  async function handleSaveEdit() {
    if (!ot) return;
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = { ...editData };

      if (payload.id_cod_rep && payload.id_cod_rep !== ot.id_cod_rep) {
        const codRep = codReps.find((cr) => cr.cod_rep_id === payload.id_cod_rep);
        if (codRep) {
          payload.tipo = codRep.tipo?.nombre ?? null;
          payload.np = codRep.np ?? null;
          payload.descripcion = codRep.descripcion;
          payload.id_fabricante = codRep.fabricante?.fabricante_id ?? null;
          payload.cod_rep_flota = codRep.flota?.nombre ?? null;
          payload.cod_rep_posicion = codRep.posicion?.nombre ?? null;
        }
      }

      if (payload.garantia_codigo === "Si") {
        payload.tipo_garantia_codigo = "Por definir";
      }

      const pcr = Number(payload.pcr);
      const horas = Number(payload.horas);
      if (pcr > 0 && horas >= 0) {
        payload.porcentaje_pcr = Number(((horas / pcr) * 100).toFixed(2));
      }

      const res = await fetch(`/api/ordenes-trabajo/${ot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      messageApi.success("OT actualizada");
      setEditing(false);
      fetchOT();
      onUpdated?.();
    } catch {
      messageApi.error("Error al guardar");
    } finally {
      setSavingEdit(false);
    }
  }

  /* ── Reprogramar ── */
  async function handleReprogramar() {
    if (!ot || !nuevaFechaReq) return;
    try {
      const res = await fetch(`/api/ordenes-trabajo/${ot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_reprogramada: nuevaFechaReq.format("YYYY-MM-DD") }),
      });
      if (!res.ok) throw new Error();
      messageApi.success("Fecha reprogramada");
      setShowReprogramar(false);
      setNuevaFechaReq(null);
      fetchOT();
      onUpdated?.();
    } catch {
      messageApi.error("Error al reprogramar");
    }
  }

  function fmtDate(d: string | null) {
    return d ? dayjs(d).format("DD/MM/YYYY") : "-";
  }

  /* ═══════════════════════════════════════════
     TAB RESUMEN (inline JSX, no function component)
     ═══════════════════════════════════════════ */
  const fechaReqActual = ot ? (ot.fecha_reprogramada ?? ot.fecha_requerimiento_cliente) : null;
  const fechaOriginal = ot?.fecha_requerimiento_cliente ?? null;
  const fueReprogramada = ot?.fecha_reprogramada != null;
  const isGarantia = editing ? editData.garantia_codigo === "Si" : ot?.garantia_codigo === "Si";

  const resumenContent = !ot ? null : (
      <div>
        {/* ── Barra de acciones ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={savingStatus}
            onClick={handleSaveStatuses}
          >
            Guardar Estados
          </Button>
          {!editing ? (
            <Button icon={<EditOutlined />} onClick={startEditing}>Editar OT</Button>
          ) : (
            <>
              <Button onClick={cancelEditing}>Cancelar</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingEdit}
                onClick={handleSaveEdit}
                style={{ background: brand.success, borderColor: brand.success }}
              >
                Guardar Cambios
              </Button>
            </>
          )}
        </div>

        {/* ── Estados + Fecha Req + Comentarios ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Estados y Fecha Requerimiento</SectionTitle>
          <Row gutter={[16, 12]}>
            <Col xs={12} md={6}>
              <FieldLabel>Estado OT</FieldLabel>
              <Select
                style={{ width: "100%" }}
                value={otStatus || undefined}
                onChange={setOtStatus}
                options={otStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <FieldLabel>Estado Recursos</FieldLabel>
              <Select
                style={{ width: "100%" }}
                value={recursosStatus || undefined}
                onChange={setRecursosStatus}
                options={recursosStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <FieldLabel>Estado Taller</FieldLabel>
              <Select
                style={{ width: "100%" }}
                value={tallerStatus || undefined}
                onChange={setTallerStatus}
                options={tallerStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <FieldLabel>Fecha Req. Cliente</FieldLabel>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtDate(fechaReqActual)}</div>
              {fueReprogramada && (
                <Text type="secondary" style={{ fontSize: 11, fontStyle: "italic" }}>
                  Original: {fmtDate(fechaOriginal)}
                </Text>
              )}
              {!showReprogramar ? (
                <Button
                  type="link"
                  size="small"
                  icon={<CalendarOutlined />}
                  onClick={() => setShowReprogramar(true)}
                  style={{ padding: 0, marginTop: 2, fontSize: 12 }}
                >
                  Reprogramar
                </Button>
              ) : (
                <div style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center" }}>
                  <DatePicker size="small" format="DD/MM/YYYY" value={nuevaFechaReq} onChange={setNuevaFechaReq} />
                  <Button size="small" type="primary" onClick={handleReprogramar} disabled={!nuevaFechaReq}>Ok</Button>
                  <Button size="small" onClick={() => setShowReprogramar(false)}><CloseOutlined /></Button>
                </div>
              )}
            </Col>
          </Row>

          <Divider style={{ margin: "12px 0" }} />

          <FieldLabel>Comentarios</FieldLabel>
          <TextArea
            rows={2}
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Motivo de reprogramación, observaciones..."
            style={{ marginTop: 4 }}
          />
        </Card>

        {/* ── Identificación ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Identificación</SectionTitle>
          {!editing ? (
            <>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Nro OT" value={ot.ot} /></Col>
                <Col xs={12} md={6}><Field label="Cliente" value={ot.cliente?.nombre_comercial ?? ot.cliente?.razon_social} /></Col>
                <Col xs={12} md={6}><Field label="Descripción" value={ot.descripcion} /></Col>
                <Col xs={12} md={6}><Field label="Estrategia" value={ot.estrategia ? "Sí" : "No"} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Cod. Reparable" value={ot.codigo_reparacion ? `${ot.codigo_reparacion.codigo} - ${ot.codigo_reparacion.descripcion}` : null} /></Col>
                <Col xs={12} md={6}><Field label="Tipo" value={ot.tipo} /></Col>
                <Col xs={12} md={6}><Field label="N/P" value={ot.np} /></Col>
                <Col xs={12} md={6}><Field label="Fabricante" value={ot.fabricante?.nombre} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Flota" value={ot.cod_rep_flota} /></Col>
                <Col xs={12} md={6}><Field label="Posición" value={ot.cod_rep_posicion} /></Col>
                <Col xs={12} md={6}><Field label="Equipo" value={ot.equipo_codigo} /></Col>
                <Col xs={12} md={6}><Field label="N/S" value={ot.ns} /></Col>
              </Row>
            </>
          ) : (
            <>
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}><Field label="Nro OT" value={ot.ot} /></Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Cliente</FieldLabel>
                  <Select showSearch optionFilterProp="label" style={{ width: "100%" }} value={editData.id_cliente as number} onChange={(v) => setField("id_cliente", v)}
                    options={clientes.map((c) => ({ value: c.cliente_id, label: `${c.codigo} - ${c.nombre_comercial ?? c.razon_social}` }))} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Estrategia</FieldLabel>
                  <Checkbox checked={editData.estrategia as boolean}
                    onChange={(e) => { setField("estrategia", e.target.checked); if (!e.target.checked) setField("id_cod_rep", null); }}>Sí</Checkbox>
                </Col>
                <Col xs={24} md={12}>
                  <FieldLabel>Código Reparable</FieldLabel>
                  <Select showSearch optionFilterProp="label" style={{ width: "100%" }} disabled={!editData.estrategia} allowClear
                    value={editData.id_cod_rep as number} onChange={(v) => setField("id_cod_rep", v)}
                    options={codReps.map((cr) => ({ value: cr.cod_rep_id, label: `${cr.codigo} - ${cr.descripcion}` }))} />
                </Col>
              </Row>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={12} md={6}>
                  <FieldLabel>Equipo</FieldLabel>
                  <Input value={(editData.equipo_codigo as string) ?? ""} onChange={(e) => setField("equipo_codigo", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>N/S</FieldLabel>
                  <Input value={(editData.ns as string) ?? ""} onChange={(e) => setField("ns", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Plaqueteo</FieldLabel>
                  <Input value={(editData.plaqueteo as string) ?? ""} onChange={(e) => setField("plaqueteo", e.target.value)} />
                </Col>
              </Row>
            </>
          )}
        </Card>

        {/* ── Documentos y Logística ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Documentos y Logística</SectionTitle>
          {!editing ? (
            <>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="WO Cliente" value={ot.wo_cliente} /></Col>
                <Col xs={12} md={6}><Field label="PO Cliente" value={ot.po_cliente} /></Col>
                <Col xs={12} md={6}><Field label="ID Viajero" value={ot.id_viajero} /></Col>
                <Col xs={12} md={6}><Field label="Guía Remisión" value={ot.guia_remision} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Empresa que entrega" value={ot.empresa_entrega} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Recepción" value={fmtDate(ot.fecha_recepcion)} /></Col>
                <Col xs={12} md={6}><Field label="Plaqueteo" value={ot.plaqueteo} /></Col>
              </Row>
            </>
          ) : (
            <>
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}>
                  <FieldLabel>WO Cliente</FieldLabel>
                  <Input value={(editData.wo_cliente as string) ?? ""} onChange={(e) => setField("wo_cliente", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>PO Cliente</FieldLabel>
                  <Input value={(editData.po_cliente as string) ?? ""} onChange={(e) => setField("po_cliente", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>ID Viajero</FieldLabel>
                  <Input value={(editData.id_viajero as string) ?? ""} onChange={(e) => setField("id_viajero", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Guía Remisión</FieldLabel>
                  <Input value={(editData.guia_remision as string) ?? ""} onChange={(e) => setField("guia_remision", e.target.value)} />
                </Col>
              </Row>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={12} md={6}>
                  <FieldLabel>Empresa que entrega</FieldLabel>
                  <Input value={(editData.empresa_entrega as string) ?? ""} onChange={(e) => setField("empresa_entrega", e.target.value)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Recepción</FieldLabel>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_recepcion ? dayjs(editData.fecha_recepcion as string) : null}
                    onChange={(d) => setField("fecha_recepcion", d ? d.format("YYYY-MM-DD") : null)} />
                </Col>
              </Row>
            </>
          )}
        </Card>

        {/* ── PCR y Horas de Trabajo ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>PCR y Horas de Trabajo</SectionTitle>
          {!editing ? (
            <Row gutter={[16, 4]}>
              <Col xs={8} md={4}><Field label="PCR" value={ot.pcr != null ? Number(ot.pcr).toLocaleString() : null} /></Col>
              <Col xs={8} md={4}><Field label="Horas" value={ot.horas != null ? Number(ot.horas).toLocaleString() : null} /></Col>
              <Col xs={8} md={4}><Field label="% PCR" value={ot.porcentaje_pcr != null ? `${ot.porcentaje_pcr}%` : null} /></Col>
            </Row>
          ) : (
            <Row gutter={[16, 12]}>
              <Col xs={8} md={5}>
                <FieldLabel>PCR</FieldLabel>
                <InputNumber style={{ width: "100%" }} min={0} value={editData.pcr as number} onChange={(v) => setField("pcr", v)} />
              </Col>
              <Col xs={8} md={5}>
                <FieldLabel>Horas</FieldLabel>
                <InputNumber style={{ width: "100%" }} min={0} value={editData.horas as number} onChange={(v) => setField("horas", v)} />
              </Col>
              <Col xs={8} md={4}>
                <FieldLabel>% PCR</FieldLabel>
                <Text strong style={{ fontSize: 15 }}>
                  {(editData.pcr as number) > 0 && (editData.horas as number) >= 0
                    ? `${((Number(editData.horas) / Number(editData.pcr)) * 100).toFixed(2)}%`
                    : "-"}
                </Text>
              </Col>
            </Row>
          )}
        </Card>

        {/* ── Tipo Reparación y Garantía ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Tipo Reparación y Garantía</SectionTitle>
          {!editing ? (
            <Row gutter={[16, 4]}>
              <Col xs={12} md={4}><Field label="Atención" value={ot.atencion_reparacion?.nombre} /></Col>
              <Col xs={12} md={4}><Field label="Tipo Reparación" value={ot.tipo_reparacion?.nombre} /></Col>
              <Col xs={12} md={4}><Field label="Prioridad" value={ot.prioridad_atencion ? `${ot.prioridad_atencion.codigo} - ${ot.prioridad_atencion.nombre}` : null} /></Col>
              <Col xs={12} md={3}><Field label="Garantía" value={ot.garantia_codigo} /></Col>
              <Col xs={12} md={4}><Field label="Tipo Garantía" value={ot.tipo_garantia?.nombre} /></Col>
              <Col xs={12} md={3}><Field label="Base Metálica" value={ot.base_metalica_codigo} /></Col>
              <Col xs={12} md={3}><Field label="Contrato (días)" value={ot.contrato_dias} /></Col>
            </Row>
          ) : (
            <Row gutter={[16, 12]}>
              <Col xs={12} md={6}>
                <FieldLabel>Atención Reparación</FieldLabel>
                <Select style={{ width: "100%" }} value={editData.atencion_reparacion_codigo as string}
                  onChange={(v) => setField("atencion_reparacion_codigo", v)}
                  options={atencionReparaciones.map((a) => ({ value: a.codigo, label: a.nombre }))} />
              </Col>
              <Col xs={12} md={6}>
                <FieldLabel>Tipo Reparación</FieldLabel>
                <Select style={{ width: "100%" }} value={editData.tipo_reparacion_codigo as string}
                  onChange={(v) => setField("tipo_reparacion_codigo", v)}
                  options={tipoReparaciones.map((t) => ({ value: t.codigo, label: t.nombre }))} />
              </Col>
              <Col xs={12} md={6}>
                <FieldLabel>Prioridad de Atención</FieldLabel>
                <Select style={{ width: "100%" }} value={editData.prioridad_atencion_codigo as string}
                  onChange={(v) => setField("prioridad_atencion_codigo", v)}
                  options={prioridades.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Col>
              <Col xs={8} md={3}>
                <FieldLabel>Garantía</FieldLabel>
                <Checkbox checked={editData.garantia_codigo === "Si"}
                  onChange={(e) => {
                    setField("garantia_codigo", e.target.checked ? "Si" : "No");
                    if (e.target.checked) setField("tipo_garantia_codigo", "Por definir");
                  }}>Sí</Checkbox>
              </Col>
              <Col xs={12} md={6}>
                <FieldLabel>Tipo Garantía</FieldLabel>
                <Select style={{ width: "100%" }} disabled={isGarantia}
                  value={editData.tipo_garantia_codigo as string}
                  onChange={(v) => setField("tipo_garantia_codigo", v)}
                  options={tipoGarantias.map((t) => ({ value: t.codigo, label: t.nombre }))} />
              </Col>
              <Col xs={8} md={3}>
                <FieldLabel>Base Metálica</FieldLabel>
                <Checkbox checked={editData.base_metalica_codigo === "Si"}
                  onChange={(e) => setField("base_metalica_codigo", e.target.checked ? "Si" : "No")}>Sí</Checkbox>
              </Col>
            </Row>
          )}
        </Card>
      </div>
  );

  const placeholderTab = (nombre: string) => (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Text type="secondary">Módulo de {nombre} — próximamente</Text>
    </div>
  );

  const tabItems = [
    { key: "resumen", label: "Resumen", icon: <InfoCircleOutlined />, children: resumenContent },
    { key: "tareas", label: "Tareas", icon: <UnorderedListOutlined />, children: placeholderTab("Tareas") },
    { key: "requerimientos", label: "Requerimientos", icon: <InboxOutlined />, children: placeholderTab("Requerimientos") },
    { key: "costos", label: "Costos", icon: <DollarOutlined />, children: placeholderTab("Costos") },
    { key: "adjuntos", label: "Adjuntos", icon: <PaperClipOutlined />, children: ot ? <OTAdjuntosTab otId={ot.id} /> : null },
    { key: "historial", label: "Historial", icon: <HistoryOutlined />, children: placeholderTab("Historial") },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ top: 20 }}
      styles={{
        body: { padding: 0 },
        header: { display: "none" },
      }}
      destroyOnHidden
    >
      {contextHolder}

      {/* ── Header ── */}
      <div
        style={{
          background: brand.navy,
          padding: "16px 24px",
          borderRadius: "8px 8px 0 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ color: brand.white, fontSize: 18, fontWeight: 700 }}>
            Orden de Trabajo: {ot?.ot ?? "..."}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
            Equipo: {ot?.equipo_codigo ?? "-"} &nbsp;|&nbsp; Estado: {ot?.ot_status?.nombre ?? "-"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            icon={<InboxOutlined />}
            onClick={() => { if (ot) { onClose(); router.push(`/requerimientos/detalle?ot_id=${ot.id}`); } }}
            size="small"
            style={{ background: "rgba(255,255,255,0.15)", border: "none", color: brand.white }}
          >
            Requerimientos
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => { if (ot) { onClose(); router.push(`/ordenes-trabajo/${ot.id}/evaluacion`); } }}
            size="small"
            style={{ background: brand.cyan, border: "none", color: brand.white }}
          >
            Hoja de Evaluacion
          </Button>
          <Button
            icon={<CloseOutlined />}
            onClick={onClose}
            size="small"
            style={{ background: "rgba(255,255,255,0.12)", border: "none", color: brand.white }}
          >
            Cerrar
          </Button>
        </div>
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <div style={{ padding: "0 24px 20px" }}>
          <Tabs
            defaultActiveKey="resumen"
            items={tabItems}
            tabBarGutter={0}
            style={{ ['--tabs-bar-justify' as string]: 'stretch' }}
            tabBarStyle={{
              display: "flex",
              borderBottom: `2px solid ${brand.border}`,
              marginBottom: 16,
            }}
            className="ot-detail-tabs"
          />
          <style>{`
            .ot-detail-tabs > .ant-tabs-nav .ant-tabs-nav-list {
              width: 100%;
              display: flex !important;
            }
            .ot-detail-tabs > .ant-tabs-nav .ant-tabs-tab {
              flex: 1;
              justify-content: center;
              margin: 0 !important;
              padding: 10px 0;
              font-weight: 500;
            }
          `}</style>
        </div>
      )}
    </Modal>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useTabSync } from "@/lib/useTabSync";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useEditLock } from "@/lib/useEditLock";
import { useUnsavedChangesWarning } from "@/lib/unsaved-changes";
import {
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
  Alert,
  Space,
  Modal,
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
  PrinterOutlined,
  PaperClipOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { brand } from "@/lib/theme";
import dayjs from "dayjs";
import { formatDateOnly, dateOnlyLocal } from "@/lib/dates";
import { formatOtCodigo } from "@/lib/ot-formato";
import OTAdjuntosTab from "./OTAdjuntosTab";
import OTTareasTab from "./OTTareasTab";
import OTHistorialTab from "./OTHistorialTab";
import OTRequerimientosTab from "./OTRequerimientosTab";
import OTCostosTab from "./OTCostosTab";
import { DescargarOTExcelButton } from "@/components/DescargarOTExcelButton";
import { MaterialQuickCreateModal } from "@/components/modules/materiales/MaterialQuickCreateModal";
import OTPrintDoc from "@/components/modules/ordenes-trabajo/OTPrintDoc";

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

interface FabricanteOption {
  fabricante_id: number;
  codigo: string;
  nombre: string;
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
  version: number;
  usuario_crea: string | null;
  fecha_creacion: string | null;
  usuario_actualiza: string | null;
  fecha_actualizacion: string | null;
  ot: string;
  tipo_codigo: string | null;
  estrategia: boolean;
  id_cliente: number | null;
  id_cod_rep: number | null;
  equipo_codigo: string | null;
  ns: string | null;
  plaqueteo: string | null;
  descripcion: string | null;
  tipo: string | null;
  // Cantidad de unidades de la OT (REP/BIE/SER). Default 1.
  cantidad: number | null;
  np: string | null;
  cod_rep_flota: string | null;
  cod_rep_posicion: string | null;
  id_fabricante: number | null;
  material_codigo: string | null;
  wo_cliente: string | null;
  po_cliente: string | null;
  po_item: string | null;
  id_viajero: string | null;
  guia_remision: string | null;
  empresa_entrega: string | null;
  lugar_entrega: string | null;
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
  monto_cotizacion: number | string | null;
  moneda_cotizacion_codigo: string | null;
  moneda_cotizacion: { codigo: string; nombre: string } | null;
  // Fechas del ciclo Evaluación → Cotización → Aprobación → Facturación.
  // Antes solo iban al export — ahora se editan también desde el detalle vía
  // la sección "Fechas Relevantes".
  fecha_evaluacion: string | null;
  evaluador: string | null;
  fecha_aprobacion_evaluacion: string | null;
  evaluacion_aprobado_por: string | null;
  fecha_cotizacion: string | null;
  fecha_aprobacion: string | null;
  fecha_facturacion: string | null;
  fecha_entrega: string | null;
  // Característica del cilindro (ESTANDAR / NO_ESTANDAR) — del Excel Data_data.
  caracteristica_cilindro: string | null;
  // Reparación en vendor externo.
  reparacion_externa: boolean;
  vendor_externo: string | null;
  // Flujo comercial/logístico (sub-tabs de Adjuntos): tracking de la OC del
  // cliente, fecha de despacho y recepción. Llegó desde main.
  fecha_generacion_po: string | null;
  po_cliente_ok: boolean | null;
  fecha_despacho: string | null;
  empresa_recibe: string | null;
}

interface Props {
  otId: number | null;
  onUpdated?: () => void;
  headerActions?: React.ReactNode; // Botón de cierre/volver (varía entre modal y página)
  /** Si true, redondea esquinas superiores del header (útil dentro de Modal) */
  roundedHeader?: boolean;
  /** El parent recibe el flag de dirty para advertir antes de cerrar */
  onDirtyChange?: (dirty: boolean) => void;
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

export default function OTDetalleContent({ otId, onUpdated, headerActions, roundedHeader = false, onDirtyChange }: Props) {
  const { data: session } = useSession();
  const currentUser = (session?.user?.name ?? session?.user?.email) ?? null;
  const lock = useEditLock("ot-externa", otId ?? null, currentUser);

  const [ot, setOt] = useState<OTDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("resumen");
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalCtx] = Modal.useModal();

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

  // Catálogos cacheados a nivel módulo: si abrís otra OT, no se refetchan.
  type Wrapped<T> = { data: T[] } | null;
  const otStatusesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=otStatus");
  const recursosStatusesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=recursosStatus");
  const tallerStatusesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=tallerStatus");
  const clientesRes = useCachedFetch<Wrapped<ClienteOption>>("/api/clientes?limit=10000");
  const codRepsRes = useCachedFetch<Wrapped<CodRepOption>>("/api/codigos-reparacion?limit=10000");
  const tipoReparacionesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=tipoReparacion");
  const atencionReparacionesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=atencionReparacion");
  const prioridadesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=prioridadAtencion");
  const tipoGarantiasRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=tipoGarantia");
  const monedasRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=moneda");
  const tiposOTRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=tipoOT");
  const tiposCodRepRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=tipoCodRep");
  const fabricantesRes = useCachedFetch<Wrapped<FabricanteOption>>("/api/catalogos?tabla=fabricante");
  const posicionesRes = useCachedFetch<Wrapped<CatalogOption>>("/api/catalogos?tabla=posicion");
  // Proveedores para el Select de "Vendor Externo" — reusa la tabla proveedor
  // existente (decisión del user, evita crear nuevo catálogo).
  const proveedoresRes = useCachedFetch<Wrapped<{ id: number; razon_social: string; nombre_comercial: string | null }>>("/api/proveedores?limit=10000");
  // Materiales para el campo "Código de Material" (REP/BIE) — con buscador y
  // creación al vuelo (mismo control que en "nueva OT").
  const materialesRes = useCachedFetch<Wrapped<{ codigo: string; descripcion: string }>>("/api/materiales?limit=10000");

  const otStatuses = otStatusesRes?.data ?? [];
  const recursosStatuses = recursosStatusesRes?.data ?? [];
  const tallerStatuses = tallerStatusesRes?.data ?? [];
  const clientes = clientesRes?.data ?? [];
  const codReps = codRepsRes?.data ?? [];
  const tipoReparaciones = tipoReparacionesRes?.data ?? [];
  const atencionReparaciones = atencionReparacionesRes?.data ?? [];
  const prioridades = prioridadesRes?.data ?? [];
  const tipoGarantias = tipoGarantiasRes?.data ?? [];
  const monedas = monedasRes?.data ?? [];
  const tiposOT = tiposOTRes?.data ?? [];
  const tiposCodRep = tiposCodRepRes?.data ?? [];
  const fabricantes = fabricantesRes?.data ?? [];
  const posiciones = posicionesRes?.data ?? [];
  const proveedores = proveedoresRes?.data ?? [];
  const [materiales, setMateriales] = useState<{ codigo: string; descripcion: string }[]>([]);
  useEffect(() => { if (materialesRes?.data) setMateriales(materialesRes.data); }, [materialesRes]);
  // Buscador + modal de creación de material para el Select "Código de Material".
  const [matSearch, setMatSearch] = useState("");
  const [matModalOpen, setMatModalOpen] = useState(false);
  // Modal "Imprimir OT": selección de secciones + orientación, y previsualización.
  const [printOpen, setPrintOpen] = useState(false);
  const [printSecc, setPrintSecc] = useState<string[]>(["resumen", "tareas", "requerimientos"]);
  const [printHoriz, setPrintHoriz] = useState(false);
  // Datos de la impresión en curso (null = sin previsualización abierta).
  const [printPreview, setPrintPreview] = useState<{ secciones: string[]; orient: "vertical" | "horizontal" } | null>(null);

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
    if (otId) {
      fetchOT();
      setShowReprogramar(false);
      setNuevaFechaReq(null);
      setEditing(false);
    }
  }, [otId, fetchOT]);

  // Sync entre pestañas: cuando otra pestaña actualiza esta OT, refrescar
  const notifySync = useTabSync(`ot-${otId ?? "none"}`, () => {
    if (otId) fetchOT();
  });

  // Dirty tracking: cualquier cambio sin guardar (estados+comentarios o edición de campos)
  const dirty = useMemo(() => {
    if (!ot) return false;
    if ((otStatus || "") !== (ot.ot_status_codigo ?? "")) return true;
    if ((recursosStatus || "") !== (ot.recursos_status_codigo ?? "")) return true;
    if ((tallerStatus || "") !== (ot.taller_status_codigo ?? "")) return true;
    if ((comentarios ?? "") !== (ot.comentarios ?? "")) return true;
    if (editing) {
      const norm = (x: unknown): string => {
        if (x == null) return "";
        if (typeof x === "object" && "toString" in (x as object)) return String(x);
        return String(x);
      };
      for (const [k, v] of Object.entries(editData)) {
        const baseline = (ot as unknown as Record<string, unknown>)[k];
        if (norm(baseline) !== norm(v)) return true;
      }
    }
    return false;
  }, [ot, otStatus, recursosStatus, tallerStatus, comentarios, editing, editData]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useUnsavedChangesWarning(dirty, "Hay cambios sin guardar en esta OT.", `ot-detalle-${otId ?? "?"}`);


  async function startEditing() {
    if (!ot) return;
    // Adquirir lock antes de habilitar edición. Si otro usuario lo tiene, abortar.
    const ok = await lock.acquire();
    if (!ok) {
      messageApi.warning(
        lock.lockedBy
          ? `${lock.lockedBy} está editando esta OT. Esperá a que termine.`
          : "No se pudo entrar a edición.",
      );
      return;
    }
    setEditData({
      id_cliente: ot.id_cliente,
      estrategia: ot.estrategia,
      id_cod_rep: ot.id_cod_rep,
      tipo_codigo: ot.tipo_codigo,
      np: ot.np,
      descripcion: ot.descripcion,
      tipo: ot.tipo,
      id_fabricante: ot.id_fabricante,
      material_codigo: ot.material_codigo,
      cod_rep_flota: ot.cod_rep_flota,
      cod_rep_posicion: ot.cod_rep_posicion,
      fecha_requerimiento_cliente: ot.fecha_requerimiento_cliente,
      equipo_codigo: ot.equipo_codigo,
      ns: ot.ns,
      plaqueteo: ot.plaqueteo,
      wo_cliente: ot.wo_cliente,
      po_cliente: ot.po_cliente,
      po_item: ot.po_item,
      cantidad: ot.cantidad,
      id_viajero: ot.id_viajero,
      guia_remision: ot.guia_remision,
      empresa_entrega: ot.empresa_entrega,
      lugar_entrega: ot.lugar_entrega,
      fecha_recepcion: ot.fecha_recepcion,
      pcr: ot.pcr ? Number(ot.pcr) : null,
      horas: ot.horas ? Number(ot.horas) : null,
      garantia_codigo: ot.garantia_codigo,
      atencion_reparacion_codigo: ot.atencion_reparacion_codigo,
      tipo_reparacion_codigo: ot.tipo_reparacion_codigo,
      tipo_garantia_codigo: ot.tipo_garantia_codigo,
      prioridad_atencion_codigo: ot.prioridad_atencion_codigo,
      base_metalica_codigo: ot.base_metalica_codigo,
      monto_cotizacion: ot.monto_cotizacion != null ? Number(ot.monto_cotizacion) : null,
      moneda_cotizacion_codigo: ot.moneda_cotizacion_codigo,
      // Fechas Relevantes + Trabajo Externo (sección nueva).
      fecha_evaluacion: ot.fecha_evaluacion,
      evaluador: ot.evaluador,
      fecha_aprobacion_evaluacion: ot.fecha_aprobacion_evaluacion,
      evaluacion_aprobado_por: ot.evaluacion_aprobado_por,
      fecha_cotizacion: ot.fecha_cotizacion,
      fecha_aprobacion: ot.fecha_aprobacion,
      fecha_facturacion: ot.fecha_facturacion,
      fecha_entrega: ot.fecha_entrega,
      // Default explícito a false para reparacion_externa cuando viene null
      // (OTs viejas creadas antes de que existiera el campo) — la sugerencia
      // del user es que arranque en "No".
      reparacion_externa: ot.reparacion_externa ?? false,
      vendor_externo: ot.vendor_externo,
      caracteristica_cilindro: ot.caracteristica_cilindro,
    });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditData({});
    // Soltar el lock para que otros puedan entrar
    void lock.release();
  }

  function setField(key: string, value: unknown) {
    setEditData((prev) => ({ ...prev, [key]: value }));
  }

  // Al elegir otro Código Reparable (con estrategia), derivamos en el acto los
  // datos del cilindro para que se vean en vivo (igual que en "nueva"). El
  // server vuelve a derivarlos al guardar, así que quedan consistentes.
  function aplicarCodRepEdit(codRepId: number | undefined) {
    if (!codRepId) {
      setEditData((prev) => ({ ...prev, id_cod_rep: null }));
      return;
    }
    const cr = codReps.find((c) => c.cod_rep_id === codRepId);
    setEditData((prev) => ({
      ...prev,
      id_cod_rep: codRepId,
      ...(cr
        ? {
            tipo: cr.tipo?.nombre ?? null,
            np: cr.np ?? null,
            descripcion: cr.descripcion,
            id_fabricante: cr.fabricante?.fabricante_id ?? null,
            cod_rep_flota: cr.flota?.nombre ?? null,
            cod_rep_posicion: cr.posicion?.nombre ?? null,
          }
        : {}),
    }));
  }

  /* ── Guardar estados + comentarios ── */
  async function handleSaveStatuses() {
    if (!ot) return;
    // Para CERRAR la OT, el monto de cotización es obligatorio. Lo validamos
    // contra el valor ya guardado en la OT (se carga en "Editar OT").
    const vaACerrar = otStatus === "Cerrada" && ot.ot_status_codigo !== "Cerrada";
    if (vaACerrar && !(Number(ot.monto_cotizacion ?? 0) > 0)) {
      messageApi.error("Para cerrar la OT, el monto de cotización es obligatorio. Cargalo en 'Editar OT' antes de cerrar.");
      return;
    }
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo/${ot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ot_status_codigo: otStatus,
          recursos_status_codigo: recursosStatus,
          // Estado Taller no aplica a Bien/Servicio → se guarda null.
          taller_status_codigo: bloqueoBien ? null : tallerStatus,
          comentarios: comentarios || null,
          version: ot.version,
        }),
      });
      if (res.status === 409) {
        messageApi.warning("Otro usuario actualizó esta OT. Sincronizando…");
        fetchOT();
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al guardar");
      }
      messageApi.success("Estados y comentarios guardados");
      fetchOT();
      notifySync();
      onUpdated?.();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingStatus(false);
    }
  }

  /**
   * Hace el PUT real a la OT, opcionalmente borra los requerimientos pendientes
   * (SIN_APROBACION sin OC). NO aplica template automáticamente: el usuario
   * lo aplica manualmente desde el tab "Requerimientos" con el botón.
   */
  async function ejecutarSaveEdit(clearPending: boolean): Promise<boolean> {
    if (!ot) return false;
    const payload: Record<string, unknown> = { ...editData };

    // Campos de evaluación: son SOLO LECTURA en el form (se completan solos
    // desde la hoja de evaluación al "Enviar a revisión" / "Aprobar"). Los
    // sacamos del payload para que un guardado manual de la OT nunca los pise.
    delete payload.evaluador;
    delete payload.fecha_evaluacion;
    delete payload.evaluacion_aprobado_por;
    delete payload.fecha_aprobacion_evaluacion;

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

    // Tipo de garantía coherente con el check (igual que en "nueva OT"): con
    // garantía se conserva lo elegido; sin garantía queda "NA".
    payload.tipo_garantia_codigo = payload.garantia_codigo === "Si"
      ? (payload.tipo_garantia_codigo || null)
      : "NA";

    const pcr = Number(payload.pcr);
    const horas = Number(payload.horas);
    if (pcr > 0 && horas >= 0) {
      payload.porcentaje_pcr = Number(((horas / pcr) * 100).toFixed(2));
    }

    const res = await fetch(`/api/ordenes-trabajo/${ot.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, version: ot.version }),
    });
    if (res.status === 409) {
      messageApi.warning("Otro usuario actualizó esta OT. Sincronizando…");
      fetchOT();
      return false;
    }
    if (!res.ok) {
      messageApi.error("Error al guardar");
      return false;
    }
    messageApi.success("OT actualizada");
    setEditing(false);
    void lock.release();

    if (clearPending) {
      try {
        const r2 = await fetch(`/api/ordenes-trabajo/${ot.id}/requerimientos/limpiar-pendientes`, {
          method: "DELETE",
        });
        if (r2.ok) {
          const j = await r2.json();
          if (j.eliminados > 0) {
            messageApi.success(
              `Se eliminaron ${j.eliminados} requerimiento(s) pendiente(s). Aplicá el nuevo template desde el tab Requerimientos.`,
            );
          }
        } else {
          messageApi.warning("No se pudieron limpiar los pendientes.");
        }
      } catch {
        messageApi.warning("Error al limpiar pendientes.");
      }
    }

    fetchOT();
    notifySync();
    onUpdated?.();
    return true;
  }

  /* ── Guardar edición general ── */
  async function handleSaveEdit() {
    if (!ot) return;
    // PO Cliente / PO Item obligatorios para Bien (igual que en creación).
    if (editData.tipo_codigo === "BIE") {
      const poc = String(editData.po_cliente ?? "").trim();
      const poi = String(editData.po_item ?? "").trim();
      if (!poc || !poi) {
        messageApi.error("Para Bien, PO Cliente y PO Item son obligatorios.");
        return;
      }
    }
    setSavingEdit(true);
    try {
      const cambioCodRep =
        editData.id_cod_rep != null && editData.id_cod_rep !== ot.id_cod_rep;

      // Si cambia el cod_rep, chequeo si la OT ya tiene requerimientos para preguntar qué hacer.
      if (cambioCodRep) {
        let tieneReqs = false;
        let countReqs = 0;
        try {
          const resReqs = await fetch(`/api/ordenes-trabajo/${ot.id}/requerimientos`);
          if (resReqs.ok) {
            const j = await resReqs.json();
            countReqs = (j.data ?? []).length;
            tieneReqs = countReqs > 0;
          }
        } catch { /* si falla, asumimos que no tiene */ }

        if (tieneReqs) {
          const codRepNuevo = codReps.find((cr) => cr.cod_rep_id === editData.id_cod_rep);
          await new Promise<void>((resolve) => {
            const m = modalApi.confirm({
              title: "Cambio de código de reparación",
              content: (
                <div>
                  <p>Esta OT tiene <strong>{countReqs}</strong> requerimiento(s) cargado(s) del cod_rep anterior.</p>
                  <p>Vas a cambiar el código a <strong>{codRepNuevo?.codigo ?? "(nuevo)"}</strong>. ¿Qué hago con los requerimientos existentes?</p>
                  <ul style={{ marginLeft: 20, fontSize: 13 }}>
                    <li><strong>Conservar todos</strong>: deja los requerimientos como están (incluso los SIN_APROBACION del cod_rep viejo).</li>
                    <li><strong>Limpiar pendientes</strong>: elimina los SIN_APROBACION sin OC. Los aprobados o con OC se mantienen.</li>
                  </ul>
                  <p style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
                    En cualquier caso, el template del nuevo cod_rep <strong>NO se aplica automáticamente</strong>.
                    Aplicalo cuando quieras desde el tab Requerimientos con el botón &quot;Generar desde template&quot;.
                  </p>
                </div>
              ),
              okText: "Conservar todos",
              cancelText: "Cancelar",
              width: 580,
              footer: (_, { OkBtn, CancelBtn }) => (
                <>
                  <CancelBtn />
                  <Button
                    danger
                    onClick={async () => {
                      m.destroy();
                      await ejecutarSaveEdit(true);
                      resolve();
                    }}
                  >
                    Limpiar pendientes
                  </Button>
                  <OkBtn />
                </>
              ),
              onOk: async () => { await ejecutarSaveEdit(false); resolve(); },
              onCancel: () => { resolve(); /* sigue en edición */ },
            });
          });
          return;
        }
      }

      // Sin cambio de cod_rep o sin requerimientos previos: guardar normal.
      // El template solo se aplica explícitamente desde el botón del tab.
      await ejecutarSaveEdit(false);
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
        body: JSON.stringify({
          fecha_reprogramada: nuevaFechaReq.format("YYYY-MM-DD"),
          version: ot.version,
        }),
      });
      if (res.status === 409) {
        messageApi.warning("Otro usuario actualizó esta OT. Sincronizando…");
        fetchOT();
        return;
      }
      if (!res.ok) throw new Error();
      messageApi.success("Fecha reprogramada");
      setShowReprogramar(false);
      setNuevaFechaReq(null);
      fetchOT();
      notifySync();
      onUpdated?.();
    } catch {
      messageApi.error("Error al reprogramar");
    }
  }

  function fmtDate(d: string | null) {
    return formatDateOnly(d);
  }

  /* ═══════════════════════════════════════════
     TAB RESUMEN (inline JSX, no function component)
     ═══════════════════════════════════════════ */
  const fechaReqActual = ot ? (ot.fecha_reprogramada ?? ot.fecha_requerimiento_cliente) : null;
  const fechaOriginal = ot?.fecha_requerimiento_cliente ?? null;
  const fueReprogramada = ot?.fecha_reprogramada != null;
  const isGarantia = editing ? editData.garantia_codigo === "Si" : ot?.garantia_codigo === "Si";

  // Bloqueo de campos según Tipo OT (BIE/SER). Bien y Servicio no son cilindros
  // físicos a reparar: no aplican datos de recepción, PCR/horas, ni Tipo
  // Reparación / Atención / Base Metálica / Taller Status. Servicio además
  // fuerza Estrategia=No (sin cod_rep asociado).
  // En edición seguimos el Tipo OT del form (editData) para que bloquear/
  // habilitar campos reaccione en vivo; fuera de edición, el valor guardado.
  const tipoOTCodigo = (editing ? (editData.tipo_codigo as string | null) : ot?.tipo_codigo) ?? null;
  const bloqueoBien = tipoOTCodigo === "BIE" || tipoOTCodigo === "SER";
  const bloqueoServicio = tipoOTCodigo === "SER";
  const esBien = tipoOTCodigo === "BIE";
  const esServicio = tipoOTCodigo === "SER";

  // ── Validaciones inline para mostrar arriba del resumen ──
  const validaciones: { type: "warning" | "info" | "error"; message: string; description?: string }[] = [];
  if (ot) {
    const pct = ot.porcentaje_pcr != null ? Number(ot.porcentaje_pcr) : null;
    if (pct != null && pct >= 100 && ot.ot_status_codigo !== "Cerrada") {
      validaciones.push({
        type: "info",
        message: "% PCR alcanzó 100%",
        description: "Considerá cerrar la OT (cambiar Estado OT a 'Cerrada').",
      });
    }
    if (ot.garantia_codigo === "Si" && (!ot.tipo_garantia_codigo || ot.tipo_garantia_codigo === "Por definir")) {
      validaciones.push({
        type: "warning",
        message: "Garantía sin tipo definido",
        description: "La OT está marcada con garantía pero el tipo de garantía sigue como 'Por definir'. Editá la OT para asignarlo.",
      });
    }
    const fechaReqEf = ot.fecha_reprogramada ?? ot.fecha_requerimiento_cliente;
    if (fechaReqEf && ot.ot_status_codigo !== "Cerrada") {
      // dateOnlyLocal: la fecha viene como medianoche UTC; parseada directo con
      // dayjs caía a las 19:00 del día ANTERIOR en Lima, y una OT que vence HOY
      // salía "vencida hace 1 día".
      const diasRestantes = dayjs(dateOnlyLocal(fechaReqEf)).diff(dayjs().startOf("day"), "day");
      if (diasRestantes < 0) {
        validaciones.push({
          type: "error",
          message: `OT vencida hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) === 1 ? "" : "s"}`,
          description: `Fecha de requerimiento: ${formatDateOnly(fechaReqEf)}. Considerá reprogramar o cerrar la OT.`,
        });
      } else if (diasRestantes <= 3) {
        validaciones.push({
          type: "warning",
          message: `OT vence en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`,
          description: `Fecha de requerimiento: ${formatDateOnly(fechaReqEf)}.`,
        });
      }
    }
  }

  const lockBanner = !ot || lock.isOwner || !lock.lockedBy ? null : (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      title={`${lock.lockedBy} está editando esta OT`}
      description="Solo podés ver hasta que termine. Si se quedó colgado el lock se libera solo a los 3 minutos."
    />
  );

  const resumenContent = !ot ? null : (
      <div>
        {lockBanner}
        {/* ── Validaciones (warnings / info) ── */}
        {validaciones.length > 0 && (
          <Space orientation="vertical" size={8} style={{ width: "100%", marginBottom: 16 }}>
            {validaciones.map((v, i) => (
              <Alert key={i} type={v.type} showIcon title={v.message} description={v.description} />
            ))}
          </Space>
        )}

        {/* ── Barra de acciones ── */}
        <div className="ot-print-hide" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 16 }}>
          {ot && <DescargarOTExcelButton otId={ot.id} tipo="externa" />}
          <Button icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
            Imprimir
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={savingStatus}
            disabled={!lock.canEdit}
            onClick={handleSaveStatuses}
          >
            Guardar Estados
          </Button>
          {!editing ? (
            <Button
              icon={<EditOutlined />}
              onClick={startEditing}
              // Bloqueamos edición si la OT está Cerrada — para modificarla
              // primero hay que reabrirla cambiando el OT Status.
              disabled={!lock.canEdit || ot?.ot_status_codigo === "Cerrada"}
              title={
                ot?.ot_status_codigo === "Cerrada"
                  ? "La OT está Cerrada — reabrila primero cambiando OT Status"
                  : !lock.canEdit && lock.lockedBy ? `Editando: ${lock.lockedBy}` : undefined
              }
            >
              Editar OT
            </Button>
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
              <Select showSearch optionFilterProp="label"
                style={{ width: "100%" }}
                value={otStatus || undefined}
                onChange={setOtStatus}
                options={otStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            <Col xs={12} md={6}>
              <FieldLabel>Estado Recursos</FieldLabel>
              <Select showSearch optionFilterProp="label"
                style={{ width: "100%" }}
                value={recursosStatus || undefined}
                onChange={setRecursosStatus}
                options={recursosStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            {/* Estado Taller: NO aplica a Bien/Servicio → se oculta. */}
            {!bloqueoBien && (
            <Col xs={12} md={6}>
              <FieldLabel>Estado Taller</FieldLabel>
              <Select showSearch optionFilterProp="label"
                style={{ width: "100%" }}
                value={tallerStatus || undefined}
                onChange={setTallerStatus}
                options={tallerStatuses.map((s) => ({ value: s.codigo, label: s.nombre }))}
              />
            </Col>
            )}
            <Col xs={12} md={6}>
              {/* Prioridad arriba de todo (pedido del equipo): antes había que
                  scrollear hasta "Documentos y Logística" para verla. */}
              <FieldLabel>Prioridad</FieldLabel>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {ot?.prioridad_atencion ? `${ot.prioridad_atencion.codigo} - ${ot.prioridad_atencion.nombre}` : "—"}
              </div>
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
                <Col xs={12} md={6}><Field label="Nro OT" value={formatOtCodigo(ot.ot, ot.tipo_codigo)} /></Col>
                <Col xs={12} md={6}><Field label="Cliente" value={ot.cliente?.nombre_comercial ?? ot.cliente?.razon_social} /></Col>
                <Col xs={12} md={6}><Field label="Descripción" value={ot.descripcion} /></Col>
                <Col xs={12} md={6}><Field label="Estrategia" value={ot.estrategia ? "Sí" : "No"} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Cod. Reparable" value={ot.codigo_reparacion ? `${ot.codigo_reparacion.codigo} - ${ot.codigo_reparacion.descripcion}` : null} /></Col>
                <Col xs={12} md={6}><Field label="Tipo" value={ot.tipo} /></Col>
                <Col xs={12} md={6}><Field label="N/P" value={ot.np} /></Col>
                <Col xs={12} md={6}><Field label="Cantidad" value={ot.cantidad != null ? String(ot.cantidad) : "1"} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Fabricante" value={ot.fabricante?.nombre} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Flota" value={ot.cod_rep_flota} /></Col>
                <Col xs={12} md={6}><Field label="Posición" value={ot.cod_rep_posicion} /></Col>
                {!esBien && <Col xs={12} md={6}><Field label="Equipo" value={ot.equipo_codigo} /></Col>}
                {!esBien && <Col xs={12} md={6}><Field label="N/S" value={ot.ns} /></Col>}
                {/* Código de Material: Reparación y Bien (no en Servicio). */}
                {!esServicio && <Col xs={12} md={6}><Field label="Código de Material" value={ot.material_codigo} /></Col>}
              </Row>
              {/* Plaqueteo al lado de N/S — antes vivía en "Documentos y
                  Logística"; el user pidió pegarlo a N/S porque son del cilindro
                  físico. También sumamos "Característica" (ESTANDAR / NO_ESTANDAR)
                  acá porque es info del componente, no de logística. */}
              <Row gutter={[16, 4]}>
                {!esBien && <Col xs={12} md={6}><Field label="Plaqueteo" value={ot.plaqueteo} /></Col>}
                <Col xs={12} md={6}>
                  <Field
                    label="Característica Cilindro"
                    value={ot.caracteristica_cilindro
                      ? (ot.caracteristica_cilindro === "NO_ESTANDAR" ? "NO ESTANDAR" : ot.caracteristica_cilindro)
                      : null}
                  />
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}><Field label="Nro OT" value={formatOtCodigo(ot.ot, ot.tipo_codigo)} /></Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Tipo OT</FieldLabel>
                  <Select showSearch optionFilterProp="label" style={{ width: "100%" }} value={editData.tipo_codigo as string} onChange={(v) => setField("tipo_codigo", v)}
                    options={tiposOT.map((t) => ({ value: t.codigo, label: t.nombre }))} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Cliente</FieldLabel>
                  <Select showSearch optionFilterProp="label" style={{ width: "100%" }} value={editData.id_cliente as number} onChange={(v) => setField("id_cliente", v)}
                    options={clientes.map((c) => ({ value: c.cliente_id, label: `${c.codigo} - ${c.nombre_comercial ?? c.razon_social}` }))} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Estrategia</FieldLabel>
                  <Checkbox
                    checked={editData.estrategia as boolean}
                    disabled={bloqueoServicio}
                    onChange={(e) => { setField("estrategia", e.target.checked); if (!e.target.checked) setField("id_cod_rep", null); }}
                  >Sí</Checkbox>
                </Col>
                <Col xs={24} md={12}>
                  <FieldLabel>Código Estratégico</FieldLabel>
                  <Select
                    showSearch optionFilterProp="label" style={{ width: "100%" }}
                    disabled={bloqueoServicio || !editData.estrategia}
                    allowClear
                    placeholder={bloqueoServicio ? "No aplica para Servicio" : undefined}
                    value={editData.id_cod_rep as number}
                    onChange={(v) => aplicarCodRepEdit(v)}
                    options={codReps.map((cr) => ({
                      value: cr.cod_rep_id,
                      label: `${cr.codigo} - ${cr.descripcion}${cr.np ? ` · N/P ${cr.np}` : ""}${cr.flota?.nombre ? ` · ${cr.flota.nombre}` : ""}`,
                    }))}
                  />
                </Col>
              </Row>
              {/* Datos del cilindro. CON estrategia vienen del Código Reparable
                  → solo lectura (no se editan a mano). SIN estrategia → editables.
                  N/S y Equipo NO dependen del cod_rep (son del cilindro físico),
                  así que se editan siempre, más abajo. */}
              {!editData.estrategia ? (
                <>
                  <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                    <Col xs={12} md={6}>
                      <FieldLabel>N/P</FieldLabel>
                      <Input value={(editData.np as string) ?? ""} onChange={(e) => setField("np", e.target.value)} />
                    </Col>
                    <Col xs={24} md={18}>
                      <FieldLabel>Descripción</FieldLabel>
                      <Input value={(editData.descripcion as string) ?? ""} onChange={(e) => setField("descripcion", e.target.value)} />
                    </Col>
                  </Row>
                  <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                    <Col xs={12} md={6}>
                      <FieldLabel>Tipo</FieldLabel>
                      <Select showSearch optionFilterProp="label" allowClear style={{ width: "100%" }}
                        value={editData.tipo as string} onChange={(v) => setField("tipo", v ?? null)}
                        options={tiposCodRep.map((t) => ({ value: t.codigo, label: t.nombre }))} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Fabricante</FieldLabel>
                      <Select showSearch optionFilterProp="label" allowClear style={{ width: "100%" }}
                        value={editData.id_fabricante as number} onChange={(v) => setField("id_fabricante", v ?? null)}
                        options={fabricantes.map((f) => ({ value: f.fabricante_id, label: f.nombre }))} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Flota</FieldLabel>
                      <Input value={(editData.cod_rep_flota as string) ?? ""} onChange={(e) => setField("cod_rep_flota", e.target.value)} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Posición</FieldLabel>
                      <Select showSearch optionFilterProp="label" allowClear style={{ width: "100%" }}
                        value={editData.cod_rep_posicion as string} onChange={(v) => setField("cod_rep_posicion", v ?? null)}
                        options={posiciones.map((p) => ({ value: p.codigo, label: p.nombre }))} />
                    </Col>
                  </Row>
                </>
              ) : (
                <Row gutter={[16, 4]} style={{ marginTop: 12 }}>
                  <Col xs={12} md={6}><Field label="N/P" value={(editData.np as string) ?? ot.np} /></Col>
                  <Col xs={12} md={6}><Field label="Tipo" value={(editData.tipo as string) ?? ot.tipo} /></Col>
                  <Col xs={24} md={12}><Field label="Descripción" value={(editData.descripcion as string) ?? ot.descripcion} /></Col>
                  <Col xs={12} md={6}><Field label="Fabricante" value={fabricantes.find((f) => f.fabricante_id === editData.id_fabricante)?.nombre ?? ot.fabricante?.nombre} /></Col>
                  <Col xs={12} md={6}><Field label="Flota" value={(editData.cod_rep_flota as string) ?? ot.cod_rep_flota} /></Col>
                  <Col xs={12} md={6}><Field label="Posición" value={(editData.cod_rep_posicion as string) ?? ot.cod_rep_posicion} /></Col>
                </Row>
              )}
              {/* Cantidad — siempre editable (aplica a los 3 tipos) */}
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={12} md={4}>
                  <FieldLabel>Cantidad</FieldLabel>
                  <InputNumber
                    style={{ width: "100%" }}
                    min={1}
                    step={1}
                    value={(editData.cantidad as number) ?? 1}
                    onChange={(v) => setField("cantidad", v ?? 1)}
                  />
                </Col>
                {/* Código de Material: Reparación y Bien (oculto en Servicio).
                    Select ligado al catálogo con creación al vuelo ("+ Crear"). */}
                {!esServicio && (
                  <Col xs={12} md={8}>
                    <FieldLabel>Código de Material</FieldLabel>
                    <Select
                      showSearch allowClear style={{ width: "100%" }}
                      placeholder="Buscar o crear material..."
                      optionFilterProp="label"
                      value={(editData.material_codigo as string) ?? undefined}
                      onChange={(v) => setField("material_codigo", v ?? null)}
                      onSearch={(v) => setMatSearch(v)}
                      onBlur={() => setMatSearch("")}
                      options={materiales.map((m) => ({ value: m.codigo, label: `${m.codigo} — ${m.descripcion}` }))}
                      dropdownRender={(menu) => (
                        <div>
                          {menu}
                          {matSearch.trim() && (
                            <div style={{ borderTop: "1px solid #f0f0f0", padding: "6px 8px" }}>
                              <Button type="link" size="small" block
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setMatModalOpen(true)}
                              >
                                + Crear: <b>{`"${matSearch.trim()}"`}</b>
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    />
                  </Col>
                )}
              </Row>
              {/* Equipo / N/S / Plaqueteo: REP y SER; ocultos en Bien. */}
              {!esBien && (
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
              )}
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
                {!esBien && <Col xs={12} md={6}><Field label="WO Cliente" value={ot.wo_cliente} /></Col>}
                <Col xs={12} md={6}><Field label="PO Cliente" value={ot.po_cliente} /></Col>
                <Col xs={12} md={6}><Field label="PO Item" value={ot.po_item} /></Col>
                {esBien && <Col xs={12} md={6}><Field label="Lugar de entrega" value={ot.lugar_entrega} /></Col>}
                {!bloqueoBien && <Col xs={12} md={6}><Field label="ID Viajero" value={ot.id_viajero} /></Col>}
              </Row>
              {!bloqueoBien && (
                <>
                  <Row gutter={[16, 4]}>
                    <Col xs={12} md={6}><Field label="Guía Remisión" value={ot.guia_remision} /></Col>
                  </Row>
                  <Row gutter={[16, 4]}>
                    <Col xs={12} md={6}><Field label="Empresa que entrega" value={ot.empresa_entrega} /></Col>
                    <Col xs={12} md={6}><Field label="Fecha Recepción" value={fmtDate(ot.fecha_recepcion)} /></Col>
                    <Col xs={12} md={6}><Field label="Plaqueteo" value={ot.plaqueteo} /></Col>
                  </Row>
                </>
              )}
              {/* Flujo comercial — se edita desde los sub-tabs de Adjuntos. */}
              <Row gutter={[16, 4]} style={{ marginTop: 4 }}>
                <Col xs={12} md={6}><Field label="Fecha envío cotización" value={fmtDate(ot.fecha_cotizacion)} /></Col>
                <Col xs={12} md={6}><Field label="Fecha generación PO" value={fmtDate(ot.fecha_generacion_po)} /></Col>
                <Col xs={12} md={6}><Field label="Fecha aprob. cotización" value={fmtDate(ot.fecha_aprobacion)} /></Col>
                <Col xs={12} md={6}><Field label="Cotización conforme" value={ot.po_cliente_ok ? <span style={{ color: brand.success, fontWeight: 600 }}>✓ Sí</span> : "No"} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Guía Remisión" value={ot.guia_remision} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Empresa que entrega" value={ot.empresa_entrega} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Recepción" value={fmtDate(ot.fecha_recepcion)} /></Col>
                {/* Prioridad se movió al bloque de arriba "Estados y Fecha
                    Requerimiento" (pedido del equipo: verla sin scrollear). */}
                <Col xs={12} md={6}><Field label="Fecha Req. Cliente" value={fmtDate(ot.fecha_requerimiento_cliente)} /></Col>
              </Row>
              {/* Despacho / recepción del cliente (flujo comercial-logístico que llegó desde main). */}
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Fecha despacho" value={fmtDate(ot.fecha_despacho)} /></Col>
                <Col xs={12} md={6}><Field label="Empresa que recibe" value={ot.empresa_recibe} /></Col>
                <Col xs={12} md={6}><Field label="Fecha facturación" value={fmtDate(ot.fecha_facturacion)} /></Col>
              </Row>
            </>
          ) : (
            <>
              {/* Sincronizado con el form de creación por tipo: para Bien/Servicio
                  se ocultan WO/PO Item/Viajero/Guía/Empresa/Fecha Recepción. */}
              <Row gutter={[16, 12]}>
                {!esBien && (
                  <Col xs={12} md={6}>
                    <FieldLabel>WO Cliente</FieldLabel>
                    <Input value={(editData.wo_cliente as string) ?? ""} onChange={(e) => setField("wo_cliente", e.target.value)} />
                  </Col>
                )}
                <Col xs={12} md={6}>
                  <FieldLabel>{`PO Cliente${esBien ? " *" : ""}`}</FieldLabel>
                  <Input value={(editData.po_cliente as string) ?? ""} onChange={(e) => setField("po_cliente", e.target.value)} />
                </Col>
                {/* PO Item: los 3 tipos; obligatorio en Bien. */}
                <Col xs={12} md={6}>
                  <FieldLabel>{`PO Item${esBien ? " *" : ""}`}</FieldLabel>
                  <Input value={(editData.po_item as string) ?? ""} onChange={(e) => setField("po_item", e.target.value)} />
                </Col>
                {/* Lugar de entrega: solo Bien. */}
                {esBien && (
                  <Col xs={12} md={8}>
                    <FieldLabel>Lugar de entrega</FieldLabel>
                    <Input value={(editData.lugar_entrega as string) ?? ""} onChange={(e) => setField("lugar_entrega", e.target.value)} placeholder="Ej. Almacén mina, dirección…" />
                  </Col>
                )}
                {!bloqueoBien && (
                  <>
                    <Col xs={12} md={6}>
                      <FieldLabel>ID Viajero</FieldLabel>
                      <Input value={(editData.id_viajero as string) ?? ""} onChange={(e) => setField("id_viajero", e.target.value)} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Guía Remisión</FieldLabel>
                      <Input value={(editData.guia_remision as string) ?? ""} onChange={(e) => setField("guia_remision", e.target.value)} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Empresa que entrega</FieldLabel>
                      <Input value={(editData.empresa_entrega as string) ?? ""} onChange={(e) => setField("empresa_entrega", e.target.value)} />
                    </Col>
                    <Col xs={12} md={6}>
                      <FieldLabel>Fecha Recepción</FieldLabel>
                      <DatePicker
                        style={{ width: "100%" }} format="DD/MM/YYYY"
                        value={editData.fecha_recepcion ? dayjs(String(editData.fecha_recepcion).slice(0, 10)) : null}
                        onChange={(d) => setField("fecha_recepcion", d ? d.format("YYYY-MM-DD") : null)}
                      />
                    </Col>
                  </>
                )}
                {/* Fecha Requerimiento: aplica a los 3 tipos. En REP los días se
                    cuentan desde la recepción; en BIE/SER desde la creación. */}
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Requerimiento Cliente</FieldLabel>
                  <DatePicker
                    style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_requerimiento_cliente ? dayjs(String(editData.fecha_requerimiento_cliente).slice(0, 10)) : null}
                    onChange={(d) => setField("fecha_requerimiento_cliente", d ? d.format("YYYY-MM-DD") : null)}
                  />
                </Col>
              </Row>
            </>
          )}
        </Card>

        {/* ── PCR y Horas de Trabajo (solo Reparación; oculto en BIE/SER) ── */}
        {!bloqueoBien && (
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
                <InputNumber
                  style={{ width: "100%" }} min={0}
                  disabled={bloqueoBien}
                  value={editData.pcr as number}
                  onChange={(v) => setField("pcr", v)}
                />
              </Col>
              <Col xs={8} md={5}>
                <FieldLabel>Horas</FieldLabel>
                <InputNumber
                  style={{ width: "100%" }} min={0}
                  disabled={bloqueoBien}
                  value={editData.horas as number}
                  onChange={(v) => setField("horas", v)}
                />
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
        )}

        {/* ── Tipo Reparación y Garantía ── */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Tipo Reparación y Garantía</SectionTitle>
          {!editing ? (
            <Row gutter={[16, 4]}>
              {/* Atención: REP y Bien. Tipo Reparación / Base Metálica: solo REP. */}
              {!esServicio && <Col xs={12} md={4}><Field label="Atención" value={ot.atencion_reparacion?.nombre} /></Col>}
              {!bloqueoBien && <Col xs={12} md={4}><Field label="Tipo Reparación" value={ot.tipo_reparacion?.nombre} /></Col>}
              {/* Prioridad se movió arriba (al bloque "Documentos y Logística"
                  al lado de Fecha Requerimiento Cliente) — pedido del user. */}
              <Col xs={12} md={3}><Field label="Garantía" value={ot.garantia_codigo} /></Col>
              <Col xs={12} md={4}><Field label="Tipo Garantía" value={ot.tipo_garantia?.nombre} /></Col>
              {!bloqueoBien && <Col xs={12} md={3}><Field label="Base Metálica" value={ot.base_metalica_codigo} /></Col>}
              <Col xs={12} md={3}><Field label="Contrato (días)" value={ot.contrato_dias} /></Col>
              <Col xs={24} md={6}>
                <Field
                  label="Cotización"
                  value={
                    ot.monto_cotizacion != null
                      ? `${Number(ot.monto_cotizacion).toLocaleString("es-PE", { minimumFractionDigits: 2 })} ${ot.moneda_cotizacion?.codigo ?? ot.moneda_cotizacion_codigo ?? ""}`.trim()
                      : null
                  }
                />
              </Col>
              {bloqueoBien && (
                <Col xs={12} md={3}><Field label="Cantidad" value={ot.cantidad} /></Col>
              )}
            </Row>
          ) : (
            <Row gutter={[16, 12]}>
              {/* Atención: Reparación y Bien (oculto en Servicio). */}
              {!esServicio && (
              <Col xs={12} md={6}>
                <FieldLabel>Atención Reparación</FieldLabel>
                <Select showSearch optionFilterProp="label"
                  style={{ width: "100%" }}
                  value={editData.atencion_reparacion_codigo as string}
                  onChange={(v) => setField("atencion_reparacion_codigo", v)}
                  options={atencionReparaciones.map((a) => ({ value: a.codigo, label: a.nombre }))}
                />
              </Col>
              )}
              {/* Tipo Reparación: solo Reparación (oculto en BIE/SER). */}
              {!bloqueoBien && (
              <Col xs={12} md={6}>
                <FieldLabel>Tipo Reparación</FieldLabel>
                <Select showSearch optionFilterProp="label"
                  style={{ width: "100%" }}
                  value={editData.tipo_reparacion_codigo as string}
                  onChange={(v) => setField("tipo_reparacion_codigo", v)}
                  options={tipoReparaciones.map((t) => ({ value: t.codigo, label: t.nombre }))}
                />
              </Col>
              )}
              <Col xs={12} md={6}>
                <FieldLabel>Prioridad de Atención</FieldLabel>
                <Select showSearch optionFilterProp="label" style={{ width: "100%" }} value={editData.prioridad_atencion_codigo as string}
                  onChange={(v) => setField("prioridad_atencion_codigo", v)}
                  options={prioridades.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nombre}` }))} />
              </Col>
              <Col xs={8} md={3}>
                <FieldLabel>Garantía</FieldLabel>
                <Checkbox checked={editData.garantia_codigo === "Si"}
                  onChange={(e) => {
                    setField("garantia_codigo", e.target.checked ? "Si" : "No");
                    // Como en "nueva OT": al marcar, se habilita el desplegable (sin
                    // valor, para elegir); al desmarcar, el tipo queda como "NA".
                    setField("tipo_garantia_codigo", e.target.checked ? null : "NA");
                  }}>Sí</Checkbox>
              </Col>
              <Col xs={12} md={6}>
                <FieldLabel>Tipo Garantía</FieldLabel>
                <Select showSearch optionFilterProp="label" style={{ width: "100%" }} disabled={!isGarantia}
                  placeholder={isGarantia ? "Seleccionar" : "NA"}
                  value={editData.tipo_garantia_codigo as string}
                  onChange={(v) => setField("tipo_garantia_codigo", v)}
                  options={tipoGarantias.map((t) => ({ value: t.codigo, label: t.nombre }))} />
              </Col>
              {/* Base Metálica: solo Reparación (oculto en BIE/SER). */}
              {!bloqueoBien && (
              <Col xs={8} md={3}>
                <FieldLabel>Base Metálica</FieldLabel>
                <Checkbox
                  checked={editData.base_metalica_codigo === "Si"}
                  onChange={(e) => setField("base_metalica_codigo", e.target.checked ? "Si" : "No")}
                >Sí</Checkbox>
              </Col>
              )}
              <Col xs={16} md={6}>
                <FieldLabel>Cotización (monto + moneda)</FieldLabel>
                <Space.Compact style={{ display: "flex" }}>
                  <InputNumber
                    placeholder="0.00"
                    min={0}
                    step={100}
                    value={editData.monto_cotizacion as number ?? undefined}
                    onChange={(v) => setField("monto_cotizacion", v)}
                    style={{ flex: 1 }}
                    formatter={(v) => {
                      if (v == null) return "";
                      const n = Number(v);
                      return Number.isNaN(n) ? "" : n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
                    }}
                    parser={(v) => Number((v ?? "").replace(/[^\d.]/g, "")) as 0}
                  />
                  <Select showSearch optionFilterProp="label"
                    placeholder="Moneda"
                    value={editData.moneda_cotizacion_codigo as string}
                    onChange={(v) => setField("moneda_cotizacion_codigo", v)}
                    style={{ width: 110 }}
                    options={monedas.map((m) => ({ value: m.codigo, label: m.codigo }))}
                  />
                </Space.Compact>
              </Col>
              {bloqueoBien && (
                <Col xs={8} md={3}>
                  <FieldLabel>Cantidad</FieldLabel>
                  <InputNumber min={1} step={1} style={{ width: "100%" }}
                    value={editData.cantidad as number ?? undefined}
                    onChange={(v) => setField("cantidad", v)} />
                </Col>
              )}
            </Row>
          )}
        </Card>

        {/* ── Fechas Relevantes + Trabajo Externo ─────────────────────
            Pedido del user: agrupar las fechas del ciclo (eval/cotiz/aprob)
            y los datos de reparación externa en una sección dedicada. La
            fecha de cotización + aprobación + facturación + entrega son
            obligatorias al cerrar la OT (la validación está en el PUT API). */}
        <Card
          size="small"
          styles={{ body: { padding: 16 } }}
          style={{ marginBottom: 16, borderColor: brand.border }}
        >
          <SectionTitle>Fechas Relevantes y Trabajo Externo</SectionTitle>
          {!editing ? (
            <>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Fecha Evaluación" value={fmtDate(ot.fecha_evaluacion)} /></Col>
                <Col xs={12} md={6}><Field label="Evaluador" value={ot.evaluador} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Aprobación Evaluación" value={fmtDate(ot.fecha_aprobacion_evaluacion)} /></Col>
                <Col xs={12} md={6}><Field label="Aprobado por" value={ot.evaluacion_aprobado_por} /></Col>
              </Row>
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Fecha Cotización" value={fmtDate(ot.fecha_cotizacion)} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Aprobación (cliente)" value={fmtDate(ot.fecha_aprobacion)} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Entrega" value={fmtDate(ot.fecha_entrega)} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Facturación" value={fmtDate(ot.fecha_facturacion)} /></Col>
              </Row>
              <Divider style={{ margin: "12px 0" }} />
              <Row gutter={[16, 4]}>
                <Col xs={12} md={6}><Field label="Reparación Externa" value={ot.reparacion_externa ? "Sí" : "No"} /></Col>
                <Col xs={12} md={6}><Field label="Vendor Externo" value={ot.vendor_externo} /></Col>
              </Row>
            </>
          ) : (
            <>
              {/* Evaluación: estos 4 campos NO se editan a mano — se completan
                  automáticamente desde la hoja de evaluación: el evaluador y su
                  fecha al "Enviar a revisión", y el aprobador y su fecha al
                  "Aprobar". Se muestran de solo lectura para evitar pisar el dato. */}
              <Text type="secondary" italic style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                Estos datos se completan solos desde la hoja de evaluación (solo lectura).
              </Text>
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}><Field label="Fecha Evaluación" value={fmtDate(ot.fecha_evaluacion)} /></Col>
                <Col xs={12} md={6}><Field label="Evaluador" value={ot.evaluador} /></Col>
                <Col xs={12} md={6}><Field label="Fecha Aprobación Evaluación" value={fmtDate(ot.fecha_aprobacion_evaluacion)} /></Col>
                <Col xs={12} md={6}><Field label="Aprobado por" value={ot.evaluacion_aprobado_por} /></Col>
              </Row>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Cotización</FieldLabel>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_cotizacion ? dayjs(String(editData.fecha_cotizacion).slice(0, 10)) : null}
                    onChange={(d) => setField("fecha_cotizacion", d ? d.format("YYYY-MM-DD") : null)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Aprobación (cliente)</FieldLabel>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_aprobacion ? dayjs(String(editData.fecha_aprobacion).slice(0, 10)) : null}
                    onChange={(d) => setField("fecha_aprobacion", d ? d.format("YYYY-MM-DD") : null)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Entrega</FieldLabel>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_entrega ? dayjs(String(editData.fecha_entrega).slice(0, 10)) : null}
                    onChange={(d) => setField("fecha_entrega", d ? d.format("YYYY-MM-DD") : null)} />
                </Col>
                <Col xs={12} md={6}>
                  <FieldLabel>Fecha Facturación</FieldLabel>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY"
                    value={editData.fecha_facturacion ? dayjs(String(editData.fecha_facturacion).slice(0, 10)) : null}
                    onChange={(d) => setField("fecha_facturacion", d ? d.format("YYYY-MM-DD") : null)} />
                </Col>
              </Row>
              <Divider style={{ margin: "12px 0" }} />
              <Row gutter={[16, 12]}>
                <Col xs={12} md={6}>
                  <FieldLabel>Reparación Externa</FieldLabel>
                  <Checkbox
                    checked={editData.reparacion_externa as boolean}
                    onChange={(e) => {
                      setField("reparacion_externa", e.target.checked);
                      // Si desmarca, limpia el vendor externo (no aplica).
                      if (!e.target.checked) setField("vendor_externo", null);
                    }}
                  >Sí</Checkbox>
                </Col>
                <Col xs={12} md={12}>
                  <FieldLabel>Vendor Externo</FieldLabel>
                  <Select
                    showSearch optionFilterProp="label" allowClear
                    placeholder={editData.reparacion_externa ? "Seleccionar proveedor externo" : "Marcar 'Reparación Externa' primero"}
                    disabled={!editData.reparacion_externa}
                    style={{ width: "100%" }}
                    // Guarda como string (razon_social) para compat con el VARCHAR
                    // actual del schema. El user pidió reusar la tabla proveedor
                    // como fuente del Select, pero sin migrar a FK.
                    value={(editData.vendor_externo as string) ?? undefined}
                    onChange={(v) => setField("vendor_externo", v ?? null)}
                    options={proveedores.map((p) => ({
                      value: p.razon_social,
                      label: p.nombre_comercial ? `${p.nombre_comercial} — ${p.razon_social}` : p.razon_social,
                    }))}
                  />
                </Col>
              </Row>
              <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
                <Col xs={12} md={6}>
                  <FieldLabel>Característica Cilindro</FieldLabel>
                  <Select
                    allowClear style={{ width: "100%" }}
                    placeholder="—"
                    value={(editData.caracteristica_cilindro as string) ?? undefined}
                    onChange={(v) => setField("caracteristica_cilindro", v ?? null)}
                    options={[
                      { value: "ESTANDAR", label: "ESTANDAR" },
                      { value: "NO_ESTANDAR", label: "NO ESTANDAR" },
                    ]}
                  />
                </Col>
              </Row>
            </>
          )}
        </Card>

        {/* Pie de página: auditoría de creación + última edición */}
        <div style={{
          marginTop: 8,
          padding: "10px 16px",
          background: "#FAFAFA",
          border: `1px solid ${brand.border}`,
          borderRadius: 6,
          fontSize: 11,
          color: "rgba(0,0,0,0.55)",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
        }}>
          <div>
            <span style={{ color: "#888" }}>Creada por:</span>{" "}
            <b style={{ color: brand.navy }}>{ot.usuario_crea ?? "—"}</b>
            {ot.fecha_creacion && (
              <>
                {" · "}
                <span style={{ color: "#888" }}>el</span>{" "}
                <b>{dayjs(ot.fecha_creacion).format("DD/MM/YYYY HH:mm")}</b>
              </>
            )}
          </div>
          {ot.fecha_actualizacion && (
            <div>
              <span style={{ color: "#888" }}>Última edición:</span>{" "}
              <b style={{ color: brand.navy }}>{ot.usuario_actualiza ?? "—"}</b>
              {" · "}
              <span style={{ color: "#888" }}>el</span>{" "}
              <b>{dayjs(ot.fecha_actualizacion).format("DD/MM/YYYY HH:mm")}</b>
            </div>
          )}
        </div>
      </div>
  );

  const placeholderTab = (nombre: string) => (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Text type="secondary">Módulo de {nombre} — próximamente</Text>
    </div>
  );

  const tabItems = [
    { key: "resumen", label: "Resumen", icon: <InfoCircleOutlined />, children: resumenContent },
    { key: "tareas", label: "Tareas", icon: <UnorderedListOutlined />, children: ot ? <OTTareasTab otId={ot.id} codRepCodigo={ot.codigo_reparacion?.codigo ?? null} /> : null },
    { key: "requerimientos", label: "Requerimientos", icon: <InboxOutlined />, children: ot ? <OTRequerimientosTab otId={ot.id} codRepCodigo={ot.codigo_reparacion?.codigo ?? null} otFechaRecepcion={ot.fecha_recepcion} onUpdated={() => fetchOT()} /> : null },
    { key: "costos", label: "Costos", icon: <DollarOutlined />, children: ot ? <OTCostosTab otId={ot.id} /> : null },
    { key: "adjuntos", label: "Adjuntos", icon: <PaperClipOutlined />, children: ot ? (
      <OTAdjuntosTab
        otId={ot.id}
        meta={{
          version: ot.version,
          ot_status_codigo: ot.ot_status_codigo,
          fecha_cotizacion: ot.fecha_cotizacion,
          fecha_aprobacion: ot.fecha_aprobacion,
          fecha_generacion_po: ot.fecha_generacion_po,
          po_cliente_ok: ot.po_cliente_ok,
          fecha_despacho: ot.fecha_despacho,
          empresa_recibe: ot.empresa_recibe,
          fecha_facturacion: ot.fecha_facturacion,
        }}
        onMetaSaved={() => fetchOT()}
      />
    ) : null },
    { key: "historial", label: "Historial", icon: <HistoryOutlined />, children: ot ? <OTHistorialTab otId={ot.id} /> : null },
  ];

  return (
    <div className="ot-detail-root">
      {contextHolder}
      {modalCtx}

      {/* ── Header ── */}
      <div
        className="ot-detail-header"
        style={{
          background: brand.navy,
          padding: "16px 24px",
          borderRadius: roundedHeader ? "8px 8px 0 0" : 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ color: brand.white, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <span>Orden de Trabajo: {ot ? formatOtCodigo(ot.ot, ot.tipo_codigo, "...") : "..."}</span>
            {dirty && (
              <span style={{
                background: "#FAAD14", color: brand.white, fontSize: 10, fontWeight: 600,
                padding: "2px 8px", borderRadius: 10, letterSpacing: 0.4,
              }}>
                CAMBIOS SIN GUARDAR
              </span>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
            Equipo: {ot?.equipo_codigo ?? "-"} &nbsp;|&nbsp; Estado: {ot?.ot_status?.nombre ?? "-"}
            {ot?.fecha_actualizacion && (
              <>
                &nbsp;|&nbsp; Última edición: {ot.usuario_actualiza ?? "—"}
                {" · "}{formatDateOnly(ot.fecha_actualizacion)}
              </>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
            Cilindro: {ot?.codigo_reparacion?.descripcion ?? "-"}
            &nbsp;|&nbsp; N/P: {ot?.np ?? "-"}
            &nbsp;|&nbsp; Flota: {ot?.cod_rep_flota ?? "-"}
            &nbsp;|&nbsp; Cliente: {ot?.cliente?.nombre_comercial ?? ot?.cliente?.razon_social ?? "-"}
          </div>
        </div>
        {headerActions}
      </div>

      {/* ── Contenido ── */}
      {loading && !ot ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <div style={{ padding: "0 24px 20px" }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
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
            @media print {
              @page { size: A4; margin: 12mm; }
              body.ot-printing .ant-layout-sider,
              body.ot-printing .ant-layout-header { display: none !important; }
              body.ot-printing .ant-layout-content { padding: 0 !important; margin: 0 !important; background: #fff !important; }
              body.ot-printing .ant-modal-mask,
              body.ot-printing .ant-modal-wrap { background: #fff !important; }
              body.ot-printing .ant-modal { top: 0 !important; padding: 0 !important; max-width: 100% !important; width: 100% !important; }
              body.ot-printing .ant-modal-content { box-shadow: none !important; border-radius: 0 !important; }
              body.ot-printing .ot-print-hide { display: none !important; }
              body.ot-printing .ot-detail-tabs > .ant-tabs-nav { display: none !important; }
              body.ot-printing .ot-detail-header { border-radius: 0 !important; }
              body.ot-printing .ant-card { box-shadow: none !important; break-inside: avoid; }
            }
          `}</style>
        </div>
      )}

      {/* Imprimir OT: elegir secciones + orientación → abre la vista de impresión. */}
      <Modal
        title={`Imprimir OT ${ot ? formatOtCodigo(ot.ot, ot.tipo_codigo, "") : ""}`}
        open={printOpen}
        onCancel={() => setPrintOpen(false)}
        okText="Imprimir"
        okButtonProps={{ icon: <PrinterOutlined />, disabled: printSecc.length === 0 }}
        onOk={() => {
          if (!ot || printSecc.length === 0) return;
          // Copia del array para forzar re-fetch + re-print aunque se repita la
          // misma selección (OTPrintDoc depende de la identidad de `secciones`).
          setPrintPreview({ secciones: [...printSecc], orient: printHoriz ? "horizontal" : "vertical" });
          setPrintOpen(false);
        }}
      >
        <p style={{ marginTop: 0, color: brand.textSecondary }}>¿Qué secciones incluir?</p>
        <Checkbox.Group
          value={printSecc}
          onChange={(v) => setPrintSecc(v as string[])}
          options={[
            { label: "Resumen (datos de la OT)", value: "resumen" },
            { label: "Tareas (planificación)", value: "tareas" },
            { label: "Requerimientos", value: "requerimientos" },
            { label: "Costos", value: "costos" },
            { label: "Historial", value: "historial" },
          ]}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        />
        <div style={{ marginTop: 16, borderTop: `1px solid ${brand.border}`, paddingTop: 12 }}>
          <Checkbox checked={printHoriz} onChange={(e) => setPrintHoriz(e.target.checked)}>
            Orientación horizontal (para tablas anchas: Costos / Requerimientos)
          </Checkbox>
        </div>
      </Modal>

      {/* Impresión directa: el documento se renderiza en un área oculta porteada
          a <body> y se imprime solo (OTPrintDoc autoPrint). En pantalla queda
          display:none; al imprimir se oculta TODO lo demás (sin páginas en
          blanco, sin recortes de modal). No hay preview del ERP — el navegador
          ya muestra su propia vista previa en el diálogo de impresión. */}
      {printPreview && ot && typeof document !== "undefined" &&
        createPortal(
          <div className="ot-print-area">
            <OTPrintDoc
              otId={ot.id}
              secciones={printPreview.secciones}
              orient={printPreview.orient}
              autoPrint
            />
          </div>,
          document.body,
        )}
      <style>{`
        .ot-print-area { display: none; }
        @media print {
          body > *:not(.ot-print-area) { display: none !important; }
          .ot-print-area { display: block !important; }
        }
      `}</style>

      {/* Crear material al vuelo desde el Select "Código de Material". */}
      <MaterialQuickCreateModal
        open={matModalOpen}
        initialDescripcion={matSearch.trim()}
        onClose={() => setMatModalOpen(false)}
        onCreated={(mat) => {
          setMateriales((prev) => [{ codigo: mat.codigo, descripcion: mat.descripcion }, ...prev]);
          setField("material_codigo", mat.codigo);
          setMatSearch("");
        }}
      />
    </div>
  );
}

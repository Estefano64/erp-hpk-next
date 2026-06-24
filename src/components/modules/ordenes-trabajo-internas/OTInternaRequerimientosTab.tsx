"use client";

// Tab "Requerimientos" del detalle de OT Interna.
//
// CALCA de OTRequerimientosTab (OT externas): misma UI, columnas y
// comportamientos, adaptando:
//   - Endpoints → /api/ordenes-trabajo-internas/[id]/requerimientos...
//   - "Generar desde template" (cod_rep) → "Aplicar Task List" (equipo +
//     estrategia PM1..PM4 con cascada acumulativa).
//   - Sin fecha_recepcion: las OT internas no la tienen, así que la fecha
//     requerida no valida contra un piso.
//
// OTRepuesto es polimórfico (ot_id o orden_trabajo_interna_id), por lo que las
// rutas por item (/api/requerimientos/[id], adjuntos) son compartidas.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, DatePicker, AutoComplete,
  message, Popconfirm, Tooltip, Empty, Alert, Row, Col, Typography, Radio, Card, Popover,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, CloseOutlined, SaveOutlined,
  EditOutlined, DeleteOutlined, SendOutlined,
  PaperClipOutlined, CalendarOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { formatDateOnly } from "@/lib/dates";
import { brand } from "@/lib/theme";
import { useResponsive, modalWidth } from "@/lib/responsive";
import { useCachedFetch } from "@/lib/useCachedFetch";
import {
  useColumnasOcultas,
  ColumnasToggleButton,
  visibleColumns,
  filtroPorColumna,
  useRangoFechas,
  RangoFechasFiltro,
  dentroDeRango,
  useColumnasRedimensionables,
} from "@/lib/tables";
import { uploadToR2 } from "@/lib/r2-client";
import { R2FileLink } from "@/components/R2FileLink";

const { Text } = Typography;

interface RequerimientoRow {
  id: number;
  nro_req: string | null;
  item_req: number | null;
  tipo_codigo: string;
  material_id: number | null;
  material_codigo: string | null;
  material: { codigo: string; descripcion: string; precio?: string | null; moneda_codigo?: string | null } | null;
  cantidad: string;
  unidad_medida: string | null;
  descripcion: string | null;
  texto: string | null;
  fabricante_codigo: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  precio_unitario: string | null;
  moneda: string | null;
  status_requerimiento_codigo: string | null;
  status_cotizacion_codigo: string | null;
  status_oc_codigo: string | null;
  status_requerimiento: { codigo: string; nombre: string } | null;
  status_cotizacion: { codigo: string; nombre: string } | null;
  status_oc: { codigo: string; nombre: string } | null;
  proveedor: { id: number; razon_social: string } | null;
  compra: { id: number; numero_po: string; fecha_entrega_esperada: string | null } | null;
  adjuntos?: { id: number; nombre_archivo: string; r2_key: string; tamano: number }[];
  po_id: number | null;
  nro_oc: string | null;
  // Precio override desde el editor de OC: cuando el comprador modifica el
  // precio en la OC, queda acá sin pisar `precio_unitario` (el estimado del
  // requerimiento). Es el precio REAL al que se compró.
  oc_precio_unitario: string | null;
  es_adicional: boolean | null;
  observaciones: string | null;
  usuario_solicita: string;
  usuario_envia: string | null;
  fecha_envio_aprobacion: string | null;
  usuario_aprueba: string | null;
  fecha_aprobacion: string | null;
}

interface MaterialOpt {
  material_id: number;
  codigo: string;
  descripcion: string;
  fabricante_codigo: string | null;
  unidad_medida_codigo: string | null;
  precio: string | null;
  moneda_codigo: string | null;
  np: string | null;
}

interface Props {
  otInternaId: number;
  onUpdated?: () => void;
}

// ── Conversión entre unidades equivalentes (regla de OTs internas) ──
// Hoy solo cilindro ↔ galón (1 cil = 55 gal — combustibles/lubricantes HPK).
// Se usa para: mostrar el equivalente al lado de la cantidad y del precio, y
// re-escalar el precio referencial cuando la UM elegida en el draft difiere de
// la UM con la que el material está cotizado en catálogo.
const CONVERSION_FACTORES: Record<string, Record<string, number>> = {
  cil: { gl: 55 },
  gl: { cil: 1 / 55 },
};

// Factor "from → to": 55 significa "1 unidad de FROM = 55 unidades de TO".
function factorEntreUM(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = (from ?? "").toLowerCase();
  const b = (to ?? "").toLowerCase();
  if (!a || !b || a === b) return null;
  return CONVERSION_FACTORES[a]?.[b] ?? null;
}

// Equivalencia de una UM convertible: a qué unidad se traduce y con qué factor.
function equivalenteUM(um: string | null | undefined): { to: string; factor: number } | null {
  const u = (um ?? "").toLowerCase();
  if (u === "cil") return { to: "gl", factor: 55 };
  if (u === "gl") return { to: "cil", factor: 1 / 55 };
  return null;
}

// Formatea un número con hasta 4 decimales, sin ceros a la derecha.
function fmtCant(n: number): string {
  return Number(n.toFixed(4)).toLocaleString("es-PE", { maximumFractionDigits: 4 });
}

const TIPO_COLOR: Record<string, string> = { MAC: "blue", CAD: "orange", SER: "purple" };
const REQ_COLOR: Record<string, string> = {
  BORRADOR: "warning",
  SIN_APROBACION: "default",
  APROBADO: "success",
  DESAPROBADO: "error",
  ANULADO: "default",
  CERRADO: "blue",
};
const COT_COLOR: Record<string, string> = {
  PEND_COT: "default",
  PEND_APROB: "processing",
  APROBADO: "success",
  COMPLETO: "success",
  ANULADO: "error",
};
const OC_COLOR: Record<string, string> = {
  PEND_OC: "default",
  PROCESO: "processing",
  ENTREGADO: "success",
  COMPLETO: "success",
  INCOMPLETO: "warning",
  ANULADO: "error",
  DEVOLUCION: "warning",
};

export default function OTInternaRequerimientosTab({ otInternaId, onUpdated }: Props) {
  const [rows, setRows] = useState<RequerimientoRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Evita doble "Aplicar Task List" (doble click / carga lenta).
  const [aplicandoTpl, setAplicandoTpl] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const { screens } = useResponsive();
  const [modalApi, modalCtx] = Modal.useModal();
  const { ocultas, setOcultas } = useColumnasOcultas("ot-interna-requerimientos-cols-v2");
  const { rango: rangoSol, setRango: setRangoSol } = useRangoFechas();
  const { rango: rangoReq, setRango: setRangoReq } = useRangoFechas();

  // Info de la OT interna (equipo + estrategia PM) — habilita "Aplicar Task List".
  // Equivalente al codRepCodigo de las OT externas.
  const [otInfo, setOtInfo] = useState<{ equipo_codigo: string | null; estrategia_pm: string | null }>({
    equipo_codigo: null,
    estrategia_pm: null,
  });
  const taskListDisponible = !!otInfo.equipo_codigo && !!otInfo.estrategia_pm;

  useEffect(() => {
    fetch(`/api/ordenes-trabajo-internas/${otInternaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.data) return;
        const estCodigo: string | undefined = j.data.estrategia?.codigo;
        const esPM = estCodigo && /^PM[1-4]$/.test(estCodigo);
        setOtInfo({
          equipo_codigo: j.data.equipo_codigo ?? null,
          estrategia_pm: esPM ? estCodigo : null,
        });
      })
      .catch(() => { /* el botón queda deshabilitado */ });
  }, [otInternaId]);

  // Modal solo para editar 1 item
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  type Adjunto = { id: number; nombre_archivo: string; r2_key: string; tamano: number; fecha_subida: string };
  const [editAdjuntos, setEditAdjuntos] = useState<Adjunto[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  async function fetchAdjuntos(itemId: number) {
    try {
      const res = await fetch(`/api/requerimientos/${itemId}/adjuntos`);
      if (res.ok) {
        const j = await res.json();
        setEditAdjuntos(j.data ?? []);
      }
    } catch { /* noop */ }
  }
  async function subirAdjuntoExistente(file: File) {
    if (!editingId) return;
    setUploadingFile(true);
    try {
      const meta = await uploadToR2({
        file,
        uploadUrlEndpoint: `/api/requerimientos/${editingId}/adjuntos/upload-url`,
      });
      const res = await fetch(`/api/requerimientos/${editingId}/adjuntos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al registrar archivo.");
        return;
      }
      messageApi.success("Archivo adjuntado.");
      await fetchAdjuntos(editingId);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "Error al subir archivo.");
    } finally {
      setUploadingFile(false);
    }
  }
  async function eliminarAdjunto(adjuntoId: number) {
    if (!editingId) return;
    const res = await fetch(`/api/requerimientos/${editingId}/adjuntos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjunto_id: adjuntoId }),
    });
    if (!res.ok) {
      messageApi.error("Error al eliminar adjunto.");
      return;
    }
    setEditAdjuntos((prev) => prev.filter((a) => a.id !== adjuntoId));
  }

  // Draft inline: crear nuevo requerimiento con múltiples items
  type DraftItem = {
    id: string; // local UUID
    tipo_codigo: "MAC" | "CAD" | "SER";
    material_codigo?: string;
    servicio_codigo?: string;
    descripcion: string;
    cantidad: number;
    unidad_medida?: string;
    fabricante_codigo?: string;
    fecha_requerida?: dayjs.Dayjs | null;
    observaciones?: string;
    archivos?: File[]; // archivos pendientes de subir
    // Precio referencial para SER y CAD (MAC usa el del catálogo).
    precio_unitario?: number;
    moneda?: "USD" | "SOL";
  };
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  // Si está seteado, los items del draft se agregan a este nro_req (en vez de crear uno nuevo).
  const [draftAppendToNroReq, setDraftAppendToNroReq] = useState<string | null>(null);

  function abrirDraft(appendToNroReq: string | null = null) {
    setDraftAppendToNroReq(appendToNroReq);
    setDraftItems([{
      id: crypto.randomUUID(),
      tipo_codigo: "MAC",
      descripcion: "",
      cantidad: 1,
    }]);
    setDraftOpen(true);
  }
  function cerrarDraft() {
    setDraftOpen(false);
    setDraftItems([]);
    setDraftAppendToNroReq(null);
  }
  function agregarItemDraft() {
    setDraftItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tipo_codigo: "MAC",
        descripcion: "",
        cantidad: 1,
      },
    ]);
  }
  function quitarItemDraft(id: string) {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  }
  function actualizarDraftItem(id: string, patch: Partial<DraftItem>) {
    setDraftItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      let next = { ...it, ...patch };
      // Si cambió el tipo: limpiar TODOS los datos dependientes del tipo
      // (material/servicio/descripción/fabricante/cantidad/UM) para evitar arrastrar datos del tipo anterior.
      if (patch.tipo_codigo && patch.tipo_codigo !== it.tipo_codigo) {
        next = {
          ...next,
          material_codigo: undefined,
          servicio_codigo: undefined,
          descripcion: "",
          fabricante_codigo: undefined,
          cantidad: 1,
          unidad_medida: undefined,
        };
      }
      // Si cambió material_codigo: auto-llenar descripcion/fabricante/unidad
      if (patch.material_codigo && patch.material_codigo !== it.material_codigo) {
        const m = materiales.find((x) => x.codigo === patch.material_codigo);
        if (m) {
          next.descripcion = m.descripcion;
          next.fabricante_codigo = m.fabricante_codigo ?? undefined;
          next.unidad_medida = m.unidad_medida_codigo ?? next.unidad_medida ?? "UNIDAD";
        }
      }
      // Si cambió servicio_codigo: auto-llenar descripcion
      if (patch.servicio_codigo && patch.servicio_codigo !== it.servicio_codigo) {
        const s = servicios.find((x) => x.codigo === patch.servicio_codigo);
        if (s) {
          next.descripcion = s.nombre;
        }
      }
      // Conversión cil ↔ gl (factor 55): si la UM elegida difiere de la UM del
      // catálogo del material, escalamos el precio referencial a la UM elegida
      // (ej. material cotizado en gl a USD 10 → con UM=cil pasa a USD 550/cil).
      // Sin esto, el precio de catálogo (por gl) no correspondería a la cantidad
      // en cilindros y el subtotal saldría 55 veces menor. Si la UM vuelve a la
      // del catálogo, se limpia el precio para que lo resuelva el catálogo.
      if (next.tipo_codigo === "MAC" && next.material_codigo) {
        const m2 = materiales.find((x) => x.codigo === next.material_codigo);
        const matPrecio = m2?.precio != null ? Number(m2.precio) : null;
        if (m2?.unidad_medida_codigo && next.unidad_medida && matPrecio != null && matPrecio > 0) {
          const factor = factorEntreUM(m2.unidad_medida_codigo, next.unidad_medida);
          if (factor != null) {
            next.precio_unitario = Number((matPrecio / factor).toFixed(4));
            next.moneda = next.moneda ?? (m2.moneda_codigo === "SOL" ? "SOL" : "USD");
          } else if (patch.unidad_medida && m2.unidad_medida_codigo === next.unidad_medida) {
            // Volvió a la UM del catálogo → el precio vuelve a resolverse por catálogo.
            next.precio_unitario = undefined;
          }
        }
      }
      return next;
    }));
  }
  async function guardarDraft() {
    // Validar
    const errors: string[] = [];
    for (const [idx, it] of draftItems.entries()) {
      if (!it.descripcion?.trim()) errors.push(`Item ${idx + 1}: descripción requerida`);
      if (!it.cantidad || it.cantidad <= 0) errors.push(`Item ${idx + 1}: cantidad debe ser > 0`);
      if (it.tipo_codigo === "MAC" && !it.material_codigo) errors.push(`Item ${idx + 1}: tipo MAC requiere material`);
      // F. requerida es OPCIONAL al CREAR; se vuelve obligatoria al ENVIAR a
      // aprobación (lo valida el endpoint /enviar).
    }
    if (errors.length > 0) {
      messageApi.error(errors[0]);
      return;
    }
    setSavingDraft(true);
    try {
      const payload = {
        items: draftItems.map((it) => ({
          tipo_codigo: it.tipo_codigo,
          material_codigo: it.material_codigo ?? null,
          cantidad: it.cantidad,
          descripcion: it.descripcion,
          unidad_medida: it.unidad_medida ?? "UNIDAD",
          fabricante_codigo: it.fabricante_codigo ?? null,
          fecha_requerida: it.fecha_requerida ? it.fecha_requerida.format("YYYY-MM-DD") : null,
          observaciones: it.observaciones ?? null,
          // Precio referencial:
          //   - SER/CAD → manual del usuario.
          //   - MAC con precio en catálogo → null (el backend lo resuelve por material_id).
          //   - MAC sin precio en catálogo → manual del usuario.
          precio_unitario: it.precio_unitario ?? null,
          moneda: it.moneda ?? "USD",
        })),
        nro_req: draftAppendToNroReq ?? undefined,
      };
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al crear requerimiento.");
        return;
      }
      const j = await res.json();
      // Subir archivos de cada item (si los hay). j.items viene en el mismo orden de payload.items
      const itemsCreados: { id: number; item_req: number }[] = j.items ?? [];
      let archivosSubidos = 0;
      let archivosFallidos = 0;
      for (let i = 0; i < draftItems.length; i++) {
        const archivos = draftItems[i].archivos ?? [];
        if (archivos.length === 0) continue;
        const creado = itemsCreados[i];
        if (!creado) continue;
        for (const file of archivos) {
          try {
            const meta = await uploadToR2({
              file,
              uploadUrlEndpoint: `/api/requerimientos/${creado.id}/adjuntos/upload-url`,
            });
            const r = await fetch(`/api/requerimientos/${creado.id}/adjuntos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(meta),
            });
            if (r.ok) archivosSubidos++;
            else archivosFallidos++;
          } catch {
            archivosFallidos++;
          }
        }
      }
      // Registrar nuevos servicios en catálogo (idempotente): para items SER con
      // descripción tipeada, guardamos el servicio para que pueda reutilizarse.
      const serviciosNuevos = new Set<string>();
      const descripcionesSer = draftItems
        .filter((it) => it.tipo_codigo === "SER" && it.descripcion?.trim())
        .map((it) => it.descripcion.trim());
      for (const nombre of [...new Set(descripcionesSer)]) {
        try {
          const r = await fetch("/api/servicios-reparacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre }),
          });
          if (r.ok) {
            const sj = await r.json().catch(() => null);
            if (sj && !sj.reused) serviciosNuevos.add(nombre);
          }
        } catch { /* falla silenciosa: no bloquear el flujo principal */ }
      }
      messageApi.success(
        (draftAppendToNroReq
          ? `Agregados ${j.creados} item(s) a ${j.nro_req}.`
          : `Requerimiento ${j.nro_req} creado con ${j.creados} item(s).`) +
        (archivosSubidos > 0 ? ` ${archivosSubidos} archivo(s) subido(s).` : "") +
        (archivosFallidos > 0 ? ` ${archivosFallidos} archivo(s) fallaron.` : "") +
        (serviciosNuevos.size > 0 ? ` ${serviciosNuevos.size} servicio(s) nuevo(s) en catálogo.` : "")
      );
      cerrarDraft();
      fetchData();
      onUpdated?.();
    } finally {
      setSavingDraft(false);
    }
  }
  const [form] = Form.useForm<{
    tipo_codigo: "MAC" | "CAD" | "SER";
    material_codigo?: string;
    cantidad: number;
    descripcion: string;
    unidad_medida?: string;
    fabricante_codigo?: string;
    fecha_requerida?: dayjs.Dayjs | null;
    observaciones?: string;
    nro_req?: string | null;
    precio_unitario?: number;
    moneda?: string;
  }>();
  const tipoSeleccionado = Form.useWatch("tipo_codigo", form);

  // Catálogos cacheados
  type Wrapped<T> = { data: T[] } | null;
  const matsRes = useCachedFetch<Wrapped<MaterialOpt>>("/api/materiales?limit=10000");
  const materiales = matsRes?.data ?? [];
  const fabsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string }>>("/api/catalogos?tabla=fabricante");
  const fabricantes = fabsRes?.data ?? [];
  const sersRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string; descripcion: string | null }>>("/api/catalogos?tabla=servicioReparacion");
  const servicios = sersRes?.data ?? [];
  const umsRes = useCachedFetch<Wrapped<{ codigo: string; nombre: string; abreviatura?: string }>>("/api/catalogos?tabla=unidadMedida");
  const unidades = umsRes?.data ?? [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos`);
      if (res.ok) {
        const j = await res.json();
        setRows(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [otInternaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Aplicar Task List ──
  async function aplicarTaskList(estrategia: "replace_pending" | "keep_all" | "skip_if_any") {
    if (aplicandoTpl) return; // re-entrada (doble click)
    setAplicandoTpl(true);
    try {
      const res = await fetch(`/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/aplicar-tasklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estrategia }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al aplicar task list.");
        return;
      }
      const j = await res.json();
      if (j.skipped) {
        messageApi.info(`No se hizo nada: ya hay ${j.existentes} requerimientos.`);
      } else {
        messageApi.success(`Task list aplicado: ${j.creados} creados${j.eliminados ? `, ${j.eliminados} reemplazados` : ""}.`);
      }
      fetchData();
      onUpdated?.();
    } catch {
      messageApi.error("Error al aplicar task list.");
    } finally {
      setAplicandoTpl(false);
    }
  }

  function abrirDialogTaskList() {
    if (!taskListDisponible) {
      messageApi.warning(
        !otInfo.equipo_codigo
          ? "La OT no tiene equipo asignado — el task list se filtra por equipo."
          : "La estrategia debe ser PM1, PM2, PM3 o PM4. Asignala en el tab Detalle.",
      );
      return;
    }
    if (rows.length === 0) {
      // Sin requerimientos, aplicar directo
      aplicarTaskList("replace_pending");
      return;
    }
    modalApi.confirm({
      title: "Aplicar task list de requerimientos",
      content: (
        <div>
          <p>
            La OT ya tiene <strong>{rows.length}</strong> requerimiento(s). ¿Qué hacemos con los del task list
            del equipo <strong>{otInfo.equipo_codigo}</strong> (cascada <strong>{otInfo.estrategia_pm}</strong>)?
          </p>
          <ul style={{ marginLeft: 20, marginTop: 8 }}>
            <li><strong>Reemplazar pendientes</strong>: borra los SIN_APROBACION sin OC y aplica el task list (los aprobados o con OC se mantienen).</li>
            <li><strong>Sumar todos</strong>: agrega los del task list encima sin tocar lo existente (puede generar duplicados).</li>
          </ul>
        </div>
      ),
      okText: "Reemplazar pendientes",
      cancelText: "Cancelar",
      okButtonProps: { type: "primary" },
      onOk: () => aplicarTaskList("replace_pending"),
      // Botón extra: "Sumar todos" — uso footer custom
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button onClick={() => { Modal.destroyAll(); aplicarTaskList("keep_all"); }}>
            Sumar todos
          </Button>
          <OkBtn />
        </>
      ),
    });
  }

  // ── Modal editar ──
  function abrirEditar(r: RequerimientoRow) {
    setEditingId(r.id);
    setEditAdjuntos([]);
    fetchAdjuntos(r.id);
    // Si el item no tiene descripción / fabricante / unidad cargados, se usa
    // lo del catálogo del material. Si ya tiene valores propios, se mantienen.
    const matFromCat = r.material_codigo ? materiales.find((x) => x.codigo === r.material_codigo) : null;
    form.setFieldsValue({
      tipo_codigo: r.tipo_codigo as "MAC" | "CAD" | "SER",
      material_codigo: r.material_codigo ?? undefined,
      cantidad: Number(r.cantidad),
      descripcion: r.descripcion ?? matFromCat?.descripcion ?? "",
      unidad_medida: r.unidad_medida ?? matFromCat?.unidad_medida_codigo ?? undefined,
      fabricante_codigo: r.fabricante_codigo ?? matFromCat?.fabricante_codigo ?? undefined,
      fecha_requerida: r.fecha_requerida ? dayjs(r.fecha_requerida) : null,
      observaciones: r.observaciones ?? undefined,
      precio_unitario: r.precio_unitario != null ? Number(r.precio_unitario) : undefined,
      moneda: r.moneda ?? "USD",
    });
    setModalOpen(true);
  }
  function onMaterialSelect(codigo: string | undefined) {
    if (!codigo) return;
    const m = materiales.find((x) => x.codigo === codigo);
    if (!m) return;
    // Autocomplete: pisa descripcion/fabricante/unidad/precio/moneda con el
    // material seleccionado. El precio del catálogo se usa como estimado
    // inicial del requerimiento. Compras puede sobreescribirlo después.
    const patch: Record<string, unknown> = {
      descripcion: m.descripcion,
      fabricante_codigo: m.fabricante_codigo ?? undefined,
      unidad_medida: m.unidad_medida_codigo ?? undefined,
    };
    if (m.precio != null) {
      patch.precio_unitario = Number(m.precio);
      patch.moneda = m.moneda_codigo === "SOL" ? "SOL" : "USD";
    }
    form.setFieldsValue(patch);
  }
  function onServicioSelect(codigo: string | undefined) {
    if (!codigo) return;
    const s = servicios.find((x) => x.codigo === codigo);
    if (!s) return;
    form.setFieldsValue({
      descripcion: s.nombre,
      observaciones: s.descripcion ?? form.getFieldValue("observaciones") ?? undefined,
    });
  }
  async function onSubmit(keepOpen = false) {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const payload = {
        ...values,
        fecha_requerida: values.fecha_requerida ? values.fecha_requerida.format("YYYY-MM-DD") : null,
      };
      const url = editingId
        ? `/api/requerimientos/${editingId}`
        : `/api/ordenes-trabajo-internas/${otInternaId}/requerimientos`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        messageApi.error(err?.error ?? "Error al guardar.");
        return;
      }
      const j = await res.json().catch(() => null);
      messageApi.success(editingId ? "Requerimiento actualizado." : "Item creado.");
      fetchData();
      onUpdated?.();
      if (keepOpen && !editingId) {
        // Mantener nro_req del item recién creado para agregar más al mismo requerimiento
        const nroReq = j?.data?.nro_req ?? values.nro_req;
        form.resetFields();
        form.setFieldsValue({ tipo_codigo: "MAC", cantidad: 1, nro_req: nroReq });
      } else {
        setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Enviar a aprobación ──
  // En la UI siempre enviamos el requerimiento completo (todos los items de un nro_req).
  async function enviarTodosBorrador() {
    const borradores = rows.filter((r) => r.status_requerimiento_codigo === "BORRADOR");
    if (borradores.length === 0) return;
    const gruposUnicos = [...new Set(borradores.map((r) => r.nro_req).filter((n): n is string => !!n))];
    let ok = 0, errs = 0;
    for (const nro of gruposUnicos) {
      const res = await fetch(
        `/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/${encodeURIComponent(nro)}/enviar`,
        { method: "POST" },
      );
      if (res.ok) ok++; else errs++;
    }
    if (ok > 0) messageApi.success(`${ok} requerimiento(s) enviados a aprobación.`);
    if (errs > 0) messageApi.warning(`${errs} con error.`);
    fetchData();
    onUpdated?.();
  }
  async function setFechaRequeridaGrupo(nroReq: string, fecha: dayjs.Dayjs | null) {
    const res = await fetch(
      `/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/${encodeURIComponent(nroReq)}/fecha-requerida`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha_requerida: fecha ? fecha.format("YYYY-MM-DD") : null }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al actualizar fecha requerida.");
      return;
    }
    const j = await res.json().catch(() => null);
    messageApi.success(
      fecha
        ? `Fecha requerida actualizada en ${j?.data?.actualizados ?? 0} item(s).`
        : `Fecha requerida limpiada en ${j?.data?.actualizados ?? 0} item(s).`,
    );
    fetchData();
    onUpdated?.();
  }
  async function enviarGrupo(nroReq: string) {
    const res = await fetch(
      `/api/ordenes-trabajo-internas/${otInternaId}/requerimientos/${encodeURIComponent(nroReq)}/enviar`,
      { method: "POST" },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al enviar requerimiento.");
      return;
    }
    const j = await res.json().catch(() => null);
    const enviados = j?.data?.enviados ?? 0;
    messageApi.success(`${nroReq} enviado a aprobación (${enviados} item${enviados !== 1 ? "s" : ""}).`);
    fetchData();
    onUpdated?.();
  }

  // (Las acciones aprobar/desaprobar/anular se gestionan desde el módulo /requerimientos por admin)
  async function eliminar(r: RequerimientoRow) {
    const res = await fetch(`/api/requerimientos/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      messageApi.error(err?.error ?? "Error al eliminar.");
      return;
    }
    messageApi.success("Eliminado.");
    fetchData();
    onUpdated?.();
  }

  // ── Stats ──
  const stats = useMemo(() => {
    let borrador = 0, aprobados = 0, sinAprob = 0, conOC = 0, anulados = 0;
    // Totales por moneda. Para cada item: si tiene precio_unitario lo usa (real/quote),
    // si no usa el precio del catálogo del material (estimado). Si no hay ninguno → no suma.
    const totalReal: Record<string, number> = {};
    const totalEstimado: Record<string, number> = {};
    let itemsConPrecio = 0, itemsSinPrecio = 0;
    for (const r of rows) {
      const sr = r.status_requerimiento_codigo;
      if (sr === "BORRADOR") borrador++;
      else if (sr === "APROBADO") aprobados++;
      else if (sr === "SIN_APROBACION") sinAprob++;
      else if (sr === "ANULADO") anulados++;
      if (r.po_id) conOC++;
      if (sr === "ANULADO" || sr === "DESAPROBADO") continue; // no cuentan en costo
      const cant = Number(r.cantidad);
      const pu = r.precio_unitario != null ? Number(r.precio_unitario) : null;
      const moneda = r.moneda ?? "USD";
      if (pu != null && Number.isFinite(pu)) {
        totalReal[moneda] = (totalReal[moneda] ?? 0) + cant * pu;
        itemsConPrecio++;
      } else if (r.material?.precio != null) {
        const cat = Number(r.material.precio);
        const monedaCat = r.material.moneda_codigo ?? moneda;
        totalEstimado[monedaCat] = (totalEstimado[monedaCat] ?? 0) + cant * cat;
        itemsConPrecio++;
      } else {
        itemsSinPrecio++;
      }
    }
    return { borrador, aprobados, sinAprob, conOC, anulados, totalReal, totalEstimado, itemsConPrecio, itemsSinPrecio };
  }, [rows]);
  const hayBorradores = stats.borrador > 0;
  // Helper para mostrar precio efectivo de un item (real o catálogo).
  // Jerarquía de precio:
  //   1. oc_precio_unitario  → REAL: el comprador lo seteó en la OC
  //   2. precio_unitario con po_id → REAL: precio del req copiado a CompraDetalle al crear OC
  //   3. precio_unitario sin OC → ESTIMADO: cotización pendiente
  //   4. material.precio → ESTIMADO: precio de catálogo (fallback)
  function precioEfectivo(r: RequerimientoRow): { precio: number; moneda: string; esEstimado: boolean } | null {
    if (r.oc_precio_unitario != null) {
      const pu = Number(r.oc_precio_unitario);
      if (Number.isFinite(pu)) return { precio: pu, moneda: r.moneda ?? "USD", esEstimado: false };
    }
    if (r.precio_unitario != null) {
      const pu = Number(r.precio_unitario);
      if (Number.isFinite(pu)) return { precio: pu, moneda: r.moneda ?? "USD", esEstimado: r.po_id == null };
    }
    if (r.material?.precio != null) {
      const pu = Number(r.material.precio);
      if (Number.isFinite(pu)) return { precio: pu, moneda: r.material.moneda_codigo ?? r.moneda ?? "USD", esEstimado: true };
    }
    return null;
  }
  function fmtMonto(n: number): string {
    return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Valores únicos para filtros derivados de relaciones
  const reqStatusValores = [...new Set(rows.map((r) => r.status_requerimiento?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));
  const cotStatusValores = [...new Set(rows.map((r) => r.status_cotizacion?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));
  const ocStatusValores = [...new Set(rows.map((r) => r.status_oc?.nombre).filter(Boolean) as string[])]
    .sort().map((v) => ({ text: v, value: v }));

  // ── Columnas ──
  const columns: ColumnsType<RequerimientoRow> = [
    {
      key: "item_req", title: "#", dataIndex: "item_req", width: 50, align: "center",
      sorter: (a, b) => (a.item_req ?? 0) - (b.item_req ?? 0),
      filters: [...new Set(rows.map((r) => r.item_req).filter((v): v is number => v != null))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(r.item_req) === value,
    },
    {
      title: "Nro Req", key: "nro", width: 130,
      ...filtroPorColumna(rows, "nro_req"),
      render: (_, r) => (
        <Space size={4} orientation="vertical" style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 11 }}>{r.nro_req ?? "—"}</Text>
          {r.es_adicional && <Tag color="gold" style={{ fontSize: 9, margin: 0 }}>ADICIONAL</Tag>}
        </Space>
      ),
    },
    {
      key: "tipo_codigo",
      title: "Tipo", dataIndex: "tipo_codigo", width: 70, align: "center",
      filters: [
        { text: "MAC", value: "MAC" },
        { text: "CAD", value: "CAD" },
        { text: "SER", value: "SER" },
      ],
      onFilter: (value, r) => r.tipo_codigo === value,
      render: (v: string) => <Tag color={TIPO_COLOR[v] ?? "default"} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: "Cód. Material", key: "material_codigo", width: 120,
      ...filtroPorColumna(rows, "material_codigo"),
      render: (_, r) => r.material_codigo
        ? <Tag style={{ fontSize: 10, margin: 0 }}>{r.material_codigo}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: "Descripción", key: "desc", width: 280, ellipsis: true,
      ...filtroPorColumna(rows, "descripcion"),
      render: (_, r) => {
        // Para MAC con material vinculado, mostrar la descripción REAL del material
        // (no la genérica heredada del task list que viene en r.descripcion).
        const descripcionMostrada = r.tipo_codigo === "MAC" && r.material?.descripcion
          ? r.material.descripcion
          : r.descripcion;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 12 }}>{descripcionMostrada}</div>
            {r.fabricante_codigo && (
              <Text type="secondary" style={{ fontSize: 10 }}>{r.fabricante_codigo}</Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Cant.", key: "qty", width: 80, align: "right",
      sorter: (a, b) => Number(a.cantidad) - Number(b.cantidad),
      filters: [...new Set(rows.map((r) => Number(r.cantidad)))]
        .sort((a, b) => a - b).map((v) => ({ text: String(v), value: String(v) })),
      filterSearch: true,
      onFilter: (value, r) => String(Number(r.cantidad)) === value,
      render: (_, r) => {
        // cil/gl: mostrar el equivalente debajo (factor 55).
        const eq = equivalenteUM(r.unidad_medida);
        const cant = Number(r.cantidad);
        return (
          <div style={{ lineHeight: 1.15 }}>
            {cant.toLocaleString()}
            {eq && cant > 0 && (
              <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>
                ≈ {fmtCant(cant * eq.factor)} {eq.to}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "P. Unit.", key: "precio_unit", width: 110, align: "right",
      sorter: (a, b) => {
        const pa = precioEfectivo(a)?.precio ?? -1;
        const pb = precioEfectivo(b)?.precio ?? -1;
        return pa - pb;
      },
      render: (_, r) => {
        const eff = precioEfectivo(r);
        if (!eff) return <Text type="secondary">—</Text>;
        return (
          <Tooltip title={eff.esEstimado ? "Precio del catálogo (estimado)" : "Precio cargado (real)"}>
            <div style={{ lineHeight: 1.1 }}>
              <Text style={{ fontSize: 12, color: eff.esEstimado ? "#888" : brand.navy }}>
                {eff.moneda} {fmtMonto(eff.precio)}
              </Text>
              {eff.esEstimado && (
                <div style={{ fontSize: 9, color: "#aaa" }}>estimado</div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Subtotal", key: "subtotal", width: 130, align: "right",
      sorter: (a, b) => {
        const pa = (precioEfectivo(a)?.precio ?? 0) * Number(a.cantidad);
        const pb = (precioEfectivo(b)?.precio ?? 0) * Number(b.cantidad);
        return pa - pb;
      },
      render: (_, r) => {
        const eff = precioEfectivo(r);
        if (!eff) return <Text type="secondary">—</Text>;
        const sub = eff.precio * Number(r.cantidad);
        return (
          <Text strong style={{ fontSize: 12, color: eff.esEstimado ? "#888" : brand.navy }}>
            {eff.moneda} {fmtMonto(sub)}
          </Text>
        );
      },
    },
    {
      title: "U.M.", key: "unidad_medida", width: 90,
      ...filtroPorColumna(rows, "unidad_medida"),
      render: (_, r) => r.unidad_medida
        ? <Text style={{ fontSize: 12 }}>{r.unidad_medida}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "F. Requerida", key: "fecha_requerida", width: 120,
      sorter: (a, b) => (a.fecha_requerida ?? "").localeCompare(b.fecha_requerida ?? ""),
      render: (_, r) => r.fecha_requerida
        ? <Text style={{ fontSize: 12 }}>{formatDateOnly(r.fecha_requerida)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "Observaciones / Adjuntos", key: "observaciones", width: 240,
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          {r.observaciones && (
            <div style={{ fontSize: 12, marginBottom: r.adjuntos?.length ? 4 : 0 }}>
              {r.observaciones}
            </div>
          )}
          {r.adjuntos && r.adjuntos.length > 0 && (
            <Space size={4} wrap>
              {r.adjuntos.map((a) => (
                <Tooltip key={a.id} title={`${a.nombre_archivo} (${(a.tamano / 1024).toFixed(1)} KB)`}>
                  <Tag style={{ fontSize: 10, margin: 0, cursor: "pointer" }}>
                    <R2FileLink
                      resource="req-adjunto"
                      resourceId={a.id}
                      r2Key={a.r2_key}
                      style={{ color: "inherit" }}
                    >
                      <PaperClipOutlined /> {a.nombre_archivo.length > 18 ? a.nombre_archivo.slice(0, 15) + "…" : a.nombre_archivo}
                    </R2FileLink>
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          )}
          {!r.observaciones && (!r.adjuntos || r.adjuntos.length === 0) && (
            <Text type="secondary">—</Text>
          )}
        </div>
      ),
    },
    {
      title: "REQ", key: "req", width: 110, align: "center",
      filters: reqStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_requerimiento?.nombre === value,
      render: (_, r) => r.status_requerimiento ? (
        <Tag color={REQ_COLOR[r.status_requerimiento.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_requerimiento.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "F. Enviado", key: "fecha_envio_aprobacion", width: 110,
      sorter: (a, b) => (a.fecha_envio_aprobacion ?? "").localeCompare(b.fecha_envio_aprobacion ?? ""),
      render: (_, r) => r.fecha_envio_aprobacion ? (
        <Tooltip title={r.usuario_envia ? `Enviado por ${r.usuario_envia}` : undefined}>
          <Text style={{ fontSize: 11 }}>{formatDateOnly(r.fecha_envio_aprobacion)}</Text>
        </Tooltip>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: "F. Aprobado", key: "fecha_aprobacion", width: 110,
      sorter: (a, b) => (a.fecha_aprobacion ?? "").localeCompare(b.fecha_aprobacion ?? ""),
      render: (_, r) => r.fecha_aprobacion ? (
        <Tooltip title={r.usuario_aprueba ? `Aprobado por ${r.usuario_aprueba}` : undefined}>
          <Text style={{ fontSize: 11 }}>{formatDateOnly(r.fecha_aprobacion)}</Text>
        </Tooltip>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: "COT", key: "cot", width: 110, align: "center",
      filters: cotStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_cotizacion?.nombre === value,
      render: (_, r) => r.status_cotizacion ? (
        <Tag color={COT_COLOR[r.status_cotizacion.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
          {r.status_cotizacion.nombre}
        </Tag>
      ) : "—",
    },
    {
      title: "OC", key: "oc", width: 150, align: "center",
      filters: ocStatusValores, filterSearch: true,
      onFilter: (value, r) => r.status_oc?.nombre === value,
      render: (_, r) => (
        <Space orientation="vertical" size={2} style={{ lineHeight: 1.2 }}>
          {r.status_oc ? (
            <Tag color={OC_COLOR[r.status_oc.codigo] ?? "default"} style={{ margin: 0, fontSize: 10 }}>
              {r.status_oc.nombre}
            </Tag>
          ) : <Text type="secondary">—</Text>}
          {r.compra?.numero_po && (
            <Text style={{ fontSize: 10 }} code>{r.compra.numero_po}</Text>
          )}
          {r.compra?.fecha_entrega_esperada && (
            <Text type="secondary" style={{ fontSize: 10 }}>
              📦 Llega: {formatDateOnly(r.compra.fecha_entrega_esperada)}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "", key: "actions", width: 130, fixed: "right",
      render: (_, r) => {
        const sr = r.status_requerimiento_codigo;
        // En el tab OT solo permitimos editar/eliminar mientras está en BORRADOR.
        // El envío a aprobación es a nivel de requerimiento completo (botón en la cabecera del card).
        const isBorrador = sr === "BORRADOR";
        const canEdit = isBorrador;
        const canDelete = isBorrador;
        return (
          <Space size={0}>
            {canEdit && (
              <Tooltip title="Editar">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => abrirEditar(r)} />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm title="Eliminar permanentemente" onConfirm={() => eliminar(r)} okText="Eliminar" okButtonProps={{ danger: true }} cancelText="Cancelar">
                <Tooltip title="Eliminar">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
            {!isBorrador && (
              <Tooltip title="Gestión disponible solo desde Logística → Requerimientos">
                <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const { columnas: columnsResizable, components: tableComponents, resetAnchos } =
    useColumnasRedimensionables<RequerimientoRow>(columns, "ot-interna-req-cols-widths-v1");

  const monedasActivas = useMemo(() => {
    return [...new Set([...Object.keys(stats.totalReal), ...Object.keys(stats.totalEstimado)])].sort();
  }, [stats.totalReal, stats.totalEstimado]);

  return (
    <div>
      {contextHolder}
      {modalCtx}
      {/* Card de costos estimados/reales */}
      {rows.length > 0 && monedasActivas.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12, background: "#FAFCFE", borderColor: "#D6E4FF" }}
          styles={{ body: { padding: 12 } }}
        >
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Space size={20} wrap>
                {monedasActivas.map((moneda) => {
                  const real = stats.totalReal[moneda] ?? 0;
                  const est = stats.totalEstimado[moneda] ?? 0;
                  const total = real + est;
                  return (
                    <div key={moneda} style={{ lineHeight: 1.2 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Costo total ({moneda})</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, color: brand.navy }}>
                        {moneda} {fmtMonto(total)}
                      </div>
                      <div style={{ fontSize: 10, color: "#888" }}>
                        Real (PO/quote): <b>{fmtMonto(real)}</b>
                        {est > 0 && <> · Estimado catálogo: <b>{fmtMonto(est)}</b></>}
                      </div>
                    </div>
                  );
                })}
              </Space>
            </Col>
            <Col>
              <Space size={6} orientation="vertical" style={{ textAlign: "right" }}>
                <Tag color="success">{stats.itemsConPrecio} item(s) con precio</Tag>
                {stats.itemsSinPrecio > 0 && (
                  <Tooltip title="Items sin precio_unitario y sin precio de catálogo. Editá el item o cargá precio al material.">
                    <Tag color="warning">{stats.itemsSinPrecio} sin precio</Tag>
                  </Tooltip>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      )}
      {/* Toolbar */}
      <Row gutter={12} style={{ marginBottom: 12 }} wrap>
        <Col flex="auto">
          <Space wrap>
            <Tag color={brand.navy}>Total: {rows.length}</Tag>
            {stats.borrador > 0 && <Tag color="warning">Borrador: {stats.borrador}</Tag>}
            <Tag color="default">Sin aprob.: {stats.sinAprob}</Tag>
            <Tag color="success">Aprobados: {stats.aprobados}</Tag>
            <Tag color="processing">Con OC: {stats.conOC}</Tag>
            {stats.anulados > 0 && <Tag>Anulados: {stats.anulados}</Tag>}
          </Space>
        </Col>
        <Col>
          <Space>
            {hayBorradores && (
              <Popconfirm
                title={`Enviar ${stats.borrador} borrador(es) a aprobación`}
                description="Una vez enviados, no podrás editarlos desde acá. Solo un admin desde el módulo Requerimientos."
                onConfirm={enviarTodosBorrador}
                okText="Enviar todos" cancelText="Cancelar"
              >
                <Button type="primary" ghost icon={<SendOutlined />}>
                  Enviar todos a aprobación ({stats.borrador})
                </Button>
              </Popconfirm>
            )}
            <ColumnasToggleButton<RequerimientoRow>
              columns={columns}
              ocultas={ocultas}
              setOcultas={setOcultas}
              obligatorias={["item_req", "desc"]}
            />
          <Button onClick={resetAnchos}>Restablecer anchos</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>Refrescar</Button>
            <Tooltip
              title={
                !otInfo.equipo_codigo
                  ? "La OT no tiene equipo asignado — el task list se filtra por equipo."
                  : !otInfo.estrategia_pm
                    ? "La estrategia debe ser PM1, PM2, PM3 o PM4. Asignala en el tab Detalle."
                    : `Copia los items del Task List del equipo ${otInfo.equipo_codigo} con cascada ${otInfo.estrategia_pm}`
              }
            >
              <Button
                icon={<ThunderboltOutlined />}
                onClick={abrirDialogTaskList}
                loading={aplicandoTpl}
                disabled={aplicandoTpl || !taskListDisponible}
              >
                Aplicar Task List{otInfo.estrategia_pm ? ` (${otInfo.estrategia_pm})` : ""}
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirDraft()} disabled={draftOpen}>
              Nuevo Requerimiento
            </Button>
          </Space>
        </Col>
      </Row>

      {!taskListDisponible && rows.length === 0 && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          title="Sin task list aplicable"
          description="Esta OT no tiene equipo asignado o su estrategia no es PM1..PM4, por lo que no hay task list para aplicar. Agregá los items manualmente con 'Nuevo Requerimiento'."
        />
      )}

      {/* ── Draft inline: nuevo requerimiento con múltiples items ──
          Resuelto a favor del patrón Card inline (`draftOpen` + `cerrarDraft`).
          El resto del archivo referencia `abrirDraft`/`cerrarDraft`/
          `actualizarDraftItem` y `draftAppendToNroReq`; el wrapper Modal
          alternativo usaba `setDraftNroReq` que no está declarado y rompía
          el archivo. Mantenemos Card también porque hay un `</Card>` + `)}`
          de cierre al final de esta sección. */}
      {draftOpen && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderColor: brand.cyan, background: "#F0FAFB" }}
          styles={{ body: { padding: 16 } }}
          title={
            <Space>
              <span style={{ fontWeight: 600 }}>
                {draftAppendToNroReq ? `Agregar items a ${draftAppendToNroReq}` : "Nuevo Requerimiento"}
              </span>
              <Tag color="orange">BORRADOR</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({draftItems.length} item{draftItems.length !== 1 ? "s" : ""})
              </Text>
            </Space>
          }
          extra={
            <Button size="small" type="text" icon={<CloseOutlined />} onClick={cerrarDraft} aria-label="Cerrar" />
          }
        >
          <Table
            dataSource={draftItems}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 1200 }}
            columns={[
              {
                title: "Ítem", key: "n", width: 50, align: "center",
                render: (_: unknown, _r: DraftItem, idx: number) => idx + 1,
              },
              {
                title: "Tipo", key: "tipo", width: 80,
                render: (_: unknown, r: DraftItem) => (
                  <Select showSearch optionFilterProp="label"
                    size="small" style={{ width: "100%" }}
                    value={r.tipo_codigo}
                    onChange={(v) => actualizarDraftItem(r.id, { tipo_codigo: v as "MAC" | "CAD" | "SER", material_codigo: undefined })}
                    options={[
                      { value: "MAC", label: "MAC" },
                      { value: "CAD", label: "CAD" },
                      { value: "SER", label: "SER" },
                    ]}
                  />
                ),
              },
              {
                title: "Material / Servicio", key: "mat", width: 240,
                render: (_: unknown, r: DraftItem) => {
                  if (r.tipo_codigo === "MAC") {
                    return (
                      <Select
                        size="small" style={{ width: "100%" }}
                        placeholder="Buscar material…"
                        showSearch optionFilterProp="label" allowClear
                        // Después de seleccionar muestra solo el código (la descripción ya va en su propio campo).
                        optionLabelProp="value"
                        value={r.material_codigo}
                        onChange={(v) => {
                          const m = v ? materiales.find((x) => x.codigo === v) : undefined;
                          const patch: Partial<DraftItem> = { material_codigo: v };
                          if (m?.precio != null) {
                            patch.precio_unitario = Number(m.precio);
                            patch.moneda = m.moneda_codigo === "SOL" ? "SOL" : "USD";
                          }
                          actualizarDraftItem(r.id, patch);
                        }}
                        options={materiales.map((m) => ({
                          value: m.codigo,
                          label: `${m.codigo} — ${m.descripcion}${m.np ? ` · NP ${m.np}` : ""}`,
                        }))}
                      />
                    );
                  }
                  // SER y CAD: no usan dropdown — la descripción es donde el usuario tipea el servicio/cargo.
                  return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                },
              },
              {
                title: "Descripción *", key: "desc", width: 250,
                render: (_: unknown, r: DraftItem) => {
                  // Para SER usamos AutoComplete con sugerencias del catálogo de servicios
                  // (lo que escriben se guarda al guardar; reutilizable después).
                  if (r.tipo_codigo === "SER") {
                    // Usamos `descripcion` del catálogo (es el "nombre visible" del servicio).
                    // Fallback a `nombre` por compatibilidad con entries viejos.
                    const opciones = servicios.map((s) => {
                      const valor = s.descripcion?.trim() || s.nombre;
                      return { value: valor, label: valor };
                    });
                    return (
                      <AutoComplete
                        size="small"
                        placeholder="Tipeá un servicio (ej. SVC Cromado)..."
                        value={r.descripcion}
                        onChange={(v) => actualizarDraftItem(r.id, { descripcion: v })}
                        options={opciones}
                        filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                        style={{ width: "100%" }}
                      />
                    );
                  }
                  return (
                    <Input
                      size="small"
                      placeholder="Descripción"
                      value={r.descripcion}
                      onChange={(e) => actualizarDraftItem(r.id, { descripcion: e.target.value })}
                    />
                  );
                },
              },
              {
                title: "Marca", key: "marca", width: 140,
                render: (_: unknown, r: DraftItem) => (
                  <Select
                    size="small" style={{ width: "100%" }}
                    placeholder="Marca" allowClear showSearch optionFilterProp="label"
                    value={r.fabricante_codigo}
                    onChange={(v) => actualizarDraftItem(r.id, { fabricante_codigo: v })}
                    options={fabricantes.map((f) => ({ value: f.codigo, label: f.nombre }))}
                  />
                ),
              },
              {
                title: "Cant. *", key: "cant", width: 80, align: "right",
                render: (_: unknown, r: DraftItem) => {
                  // cil/gl: equivalente debajo (factor 55) para no calcular mentalmente.
                  const eq = equivalenteUM(r.unidad_medida);
                  return (
                    <div>
                      <InputNumber
                        size="small" style={{ width: "100%" }}
                        min={0.01} step={1}
                        value={r.cantidad}
                        onChange={(v) => actualizarDraftItem(r.id, { cantidad: Number(v ?? 0) })}
                      />
                      {eq && Number(r.cantidad ?? 0) > 0 && (
                        <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                          ≈ {fmtCant(Number(r.cantidad) * eq.factor)} {eq.to}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                title: "U.M.", key: "um", width: 110,
                render: (_: unknown, r: DraftItem) => (
                  <Select
                    size="small" style={{ width: "100%" }}
                    placeholder="U.M."
                    showSearch optionFilterProp="label" allowClear
                    value={r.unidad_medida}
                    onChange={(v) => actualizarDraftItem(r.id, { unidad_medida: v })}
                    options={unidades.map((u) => ({
                      value: u.codigo,
                      label: `${u.nombre}${u.abreviatura ? ` (${u.abreviatura})` : ""}`,
                    }))}
                  />
                ),
              },
              {
                // Precio referencial:
                //   - MAC con material y precio en catálogo → muestra el del
                //     catálogo en read-only (con tooltip).
                //   - MAC sin precio en catálogo (o sin material elegido aún)
                //     → input editable, igual que SER/CAD.
                //   - SER/CAD → siempre editable.
                title: "Precio ref.", key: "precio", width: 150, align: "right",
                render: (_: unknown, r: DraftItem) => {
                  const mat = r.tipo_codigo === "MAC" && r.material_codigo
                    ? materiales.find((m) => m.codigo === r.material_codigo)
                    : null;
                  const eq = equivalenteUM(r.unidad_medida);
                  // Read-only del catálogo SOLO si no hay precio propio en el
                  // draft: la conversión cil↔gl setea precio_unitario escalado y
                  // debe verse (y guardarse) ese, no el del catálogo.
                  if (mat?.precio && r.precio_unitario == null) {
                    return (
                      <Tooltip title="Precio del catálogo de material">
                        <div>
                          <Text style={{ fontSize: 12 }}>
                            {Number(mat.precio).toFixed(2)} {mat.moneda_codigo ?? "USD"}
                          </Text>
                          {eq && (
                            <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)" }}>
                              ≈ {mat.moneda_codigo ?? "USD"} {fmtCant(Number(mat.precio) / eq.factor)}/{eq.to}
                            </div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  }
                  // Input editable: SER, CAD, MAC sin precio en catálogo, o MAC
                  // con precio re-escalado por conversión de UM.
                  const pu = r.precio_unitario != null ? Number(r.precio_unitario) : null;
                  return (
                    <div>
                      <Space.Compact style={{ width: "100%" }}>
                        <InputNumber
                          size="small" style={{ width: 80 }}
                          min={0} step={0.01}
                          placeholder="0.00"
                          value={r.precio_unitario}
                          onChange={(v) => actualizarDraftItem(r.id, { precio_unitario: v == null ? undefined : Number(v) })}
                        />
                        <Select showSearch optionFilterProp="label"
                          size="small" style={{ width: 70 }}
                          value={r.moneda ?? "USD"}
                          onChange={(v) => actualizarDraftItem(r.id, { moneda: v })}
                          options={[
                            { value: "USD", label: "USD" },
                            { value: "SOL", label: "SOL" },
                          ]}
                        />
                      </Space.Compact>
                      {eq && pu != null && pu > 0 && (
                        <div style={{ fontSize: 10, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                          ≈ {r.moneda ?? "USD"} {fmtCant(pu / eq.factor)}/{eq.to}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                title: <span>F. requerida</span>, key: "freq", width: 130,
                render: (_: unknown, r: DraftItem) => (
                  <DatePicker
                    size="small" style={{ width: "100%" }}
                    format="DD/MM/YYYY"
                    value={r.fecha_requerida ?? null}
                    onChange={(d) => actualizarDraftItem(r.id, { fecha_requerida: d })}
                  />
                ),
              },
              {
                title: "Observaciones / Adjuntos", key: "obs",
                render: (_: unknown, r: DraftItem) => (
                  <div>
                    <Space.Compact style={{ width: "100%" }}>
                      <Input
                        size="small"
                        placeholder="Obs."
                        value={r.observaciones ?? ""}
                        onChange={(e) => actualizarDraftItem(r.id, { observaciones: e.target.value })}
                      />
                      <Tooltip title="Adjuntar archivo(s)">
                        <Button
                          size="small"
                          icon={<PaperClipOutlined />}
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.multiple = true;
                            input.onchange = (e) => {
                              const files = Array.from((e.target as HTMLInputElement).files ?? []);
                              if (files.length === 0) return;
                              actualizarDraftItem(r.id, {
                                archivos: [...(r.archivos ?? []), ...files],
                              });
                            };
                            input.click();
                          }}
                        />
                      </Tooltip>
                    </Space.Compact>
                    {(r.archivos ?? []).length > 0 && (
                      <Space size={4} wrap style={{ marginTop: 4 }}>
                        {(r.archivos ?? []).map((f, i) => (
                          <Tag
                            key={i}
                            closable
                            onClose={() => actualizarDraftItem(r.id, {
                              archivos: (r.archivos ?? []).filter((_, j) => j !== i),
                            })}
                            style={{ fontSize: 10, margin: 0 }}
                          >
                            <PaperClipOutlined /> {f.name.length > 20 ? f.name.slice(0, 17) + "…" : f.name}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </div>
                ),
              },
              {
                title: "", key: "del", width: 40, align: "center",
                render: (_: unknown, r: DraftItem) => (
                  <Button
                    type="text" size="small" danger icon={<DeleteOutlined />}
                    disabled={draftItems.length === 1}
                    onClick={() => quitarItemDraft(r.id)}
                  />
                ),
              },
            ]}
          />
          <Row justify="space-between" align="middle" style={{ marginTop: 12 }}>
            <Col>
              <Button icon={<PlusOutlined />} onClick={agregarItemDraft}>
                Agregar otro ítem
              </Button>
            </Col>
            <Col>
              <Space>
                <Button onClick={cerrarDraft}>Cancelar</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={savingDraft} onClick={guardarDraft}>
                  Guardar Requerimiento
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha solicitud" value={rangoSol} onChange={setRangoSol} />
        </Col>
        <Col xs={24} md={12}>
          <RangoFechasFiltro label="Fecha requerida" value={rangoReq} onChange={setRangoReq} />
        </Col>
      </Row>

      {rows.length === 0 ? (
        <Empty description="Sin requerimientos. Aplicá el task list o agregá uno nuevo." />
      ) : (
        <RequerimientosAgrupados
          rows={rows.filter((r) =>
            dentroDeRango(r, "fecha_solicitud", rangoSol) &&
            dentroDeRango(r, "fecha_requerida", rangoReq)
          )}
          columns={visibleColumns(columnsResizable, ocultas, ["item_req", "desc"])}
          components={tableComponents}
          loading={loading}
          onAddItems={(nro) => abrirDraft(nro)}
          onEnviarGrupo={enviarGrupo}
          onSetFechaRequerida={setFechaRequeridaGrupo}
        />
      )}

      {/* Modal editar */}
      <Modal
        title={editingId ? "Editar requerimiento" : "Nuevo requerimiento adicional"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={modalWidth(screens, 680)}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)}>Cancelar</Button>,
          ...(editingId
            ? [<Button key="save" type="primary" loading={saving} onClick={() => onSubmit(false)}>Guardar</Button>]
            : [
                <Button key="saveAdd" loading={saving} onClick={() => onSubmit(true)}>Guardar y agregar otro</Button>,
                <Button key="save" type="primary" loading={saving} onClick={() => onSubmit(false)}>Guardar y cerrar</Button>,
              ]),
        ]}
      >
        <Form form={form} layout="vertical">
          {!editingId && (
            <Form.Item
              name="nro_req"
              label="Requerimiento"
              extra="Crear uno nuevo o agregar este item a uno existente (solo BORRADOR / SIN_APROBACION)."
              initialValue={null}
            >
              <Select showSearch optionFilterProp="label"
                placeholder="Crear nuevo requerimiento"
                allowClear
                options={[
                  ...(() => {
                    // Agrupar items por nro_req y mostrar los editables
                    const byReq = new Map<string, RequerimientoRow[]>();
                    for (const r of rows) {
                      if (!r.nro_req) continue;
                      const status = r.status_requerimiento_codigo ?? "BORRADOR";
                      if (!["BORRADOR", "SIN_APROBACION"].includes(status)) continue;
                      if (!byReq.has(r.nro_req)) byReq.set(r.nro_req, []);
                      byReq.get(r.nro_req)!.push(r);
                    }
                    return [...byReq.entries()].map(([nro, items]) => ({
                      value: nro,
                      label: `${nro} — ${items.length} item${items.length !== 1 ? "s" : ""}`,
                    }));
                  })(),
                ]}
              />
            </Form.Item>
          )}
          <Form.Item
            name="tipo_codigo"
            label="Tipo"
            rules={[{ required: true }]}
          >
            <Radio.Group disabled={!!editingId}>
              <Radio.Button value="MAC">MAC (Material catalogado)</Radio.Button>
              <Radio.Button value="CAD">CAD (Cargo directo)</Radio.Button>
              <Radio.Button value="SER">SER (Servicio)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {tipoSeleccionado === "MAC" && (
            <Form.Item
              name="material_codigo"
              label="Material"
              rules={[{ required: true, message: "Material requerido para tipo MAC" }]}
            >
              <Select
                showSearch
                placeholder="Buscá por código o descripción…"
                optionFilterProp="label"
                optionLabelProp="value"
                onChange={onMaterialSelect}
                options={materiales.map((m) => ({
                  value: m.codigo,
                  label: `${m.codigo} — ${m.descripcion}${m.fabricante_codigo ? ` [${m.fabricante_codigo}]` : ""}`,
                }))}
              />
            </Form.Item>
          )}

          {tipoSeleccionado === "SER" && (
            <Form.Item
              label="Servicio (catálogo)"
              extra="Seleccioná uno del catálogo y se autocompleta la descripción. Podés editar después."
            >
              <Select
                showSearch
                placeholder="Buscar servicio del catálogo…"
                optionFilterProp="label"
                onChange={onServicioSelect}
                allowClear
                options={servicios.map((s) => ({
                  value: s.codigo,
                  label: `${s.codigo} — ${s.nombre}`,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item
            name="descripcion"
            label="Descripción"
            rules={[{ required: true, max: 500 }]}
          >
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>

          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true }]}>
                <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unidad_medida" label="Unidad">
                <Input placeholder="UNIDAD" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricante_codigo" label="Fabricante">
                <Select
                  showSearch allowClear
                  optionFilterProp="label"
                  placeholder="Elegir fabricante…"
                  options={fabricantes.map((f) => ({ value: f.codigo, label: `${f.codigo} — ${f.nombre}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Precio referencial para SER / CAD — no se piden para MAC porque
              ese ya viene del catálogo de material. Es manual y orientativo;
              el precio definitivo lo carga el comprador en la OC. */}
          {(tipoSeleccionado === "SER" || tipoSeleccionado === "CAD") && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="precio_unitario"
                  label="Precio referencial"
                  tooltip="Precio orientativo de quien crea el requerimiento. El precio definitivo lo carga el área de compras en la OC."
                >
                  <InputNumber min={0} step={0.01} style={{ width: "100%" }} placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="moneda" label="Moneda" initialValue="USD">
                  <Select showSearch optionFilterProp="label"
                    options={[
                      { value: "USD", label: "USD ($)" },
                      { value: "SOL", label: "SOL (S/)" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Form.Item
            name="fecha_requerida"
            label="Fecha requerida"
            tooltip="Opcional al crear. Se vuelve obligatoria al enviar el requerimiento a aprobación."
          >
            <DatePicker
              style={{ width: 200 }}
              format="DD/MM/YYYY"
            />
          </Form.Item>

          <Form.Item name="observaciones" label="Observaciones">
            <Input.TextArea rows={2} />
          </Form.Item>

          {editingId && (
            <Form.Item label="Adjuntos">
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                <Button
                  size="small" icon={<PaperClipOutlined />} loading={uploadingFile}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.onchange = async (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files ?? []);
                      for (const f of files) await subirAdjuntoExistente(f);
                    };
                    input.click();
                  }}
                >
                  Subir archivo(s)
                </Button>
                {editAdjuntos.length === 0 ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>Sin adjuntos.</Text>
                ) : (
                  <Space size={4} wrap>
                    {editAdjuntos.map((a) => (
                      <Tag
                        key={a.id}
                        closable
                        onClose={(e) => { e.preventDefault(); eliminarAdjunto(a.id); }}
                        style={{ fontSize: 11, margin: 0 }}
                      >
                        <PaperClipOutlined />{" "}
                        <R2FileLink resource="req-adjunto" resourceId={a.id} r2Key={a.r2_key}>
                          {a.nombre_archivo}
                        </R2FileLink>
                      </Tag>
                    ))}
                  </Space>
                )}
              </Space>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <style jsx global>{`
        .req-anulado > td { background: #FFF1F0 !important; opacity: 0.7; }
      `}</style>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Componente: items agrupados por nro_req como Cards colapsables.
// ───────────────────────────────────────────────────────────────────────────
function RequerimientosAgrupados({
  rows,
  columns,
  components,
  loading,
  onAddItems,
  onEnviarGrupo,
  onSetFechaRequerida,
}: {
  rows: RequerimientoRow[];
  columns: ColumnsType<RequerimientoRow>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components?: any;
  loading: boolean;
  onAddItems?: (nroReq: string) => void;
  onEnviarGrupo?: (nroReq: string) => void;
  onSetFechaRequerida?: (nroReq: string, fecha: dayjs.Dayjs | null) => Promise<void>;
}) {
  // Agrupar por nro_req (preservando orden por fecha desc del primer item de cada grupo)
  const groups = useMemo(() => {
    const m = new Map<string, RequerimientoRow[]>();
    for (const r of rows) {
      const key = r.nro_req ?? "(sin nro)";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    // Ordenar grupos: primero por fecha_solicitud desc del item más reciente
    return [...m.entries()]
      .map(([nro, items]) => {
        const sorted = [...items].sort((a, b) => (a.item_req ?? 0) - (b.item_req ?? 0));
        return { nro, items: sorted };
      })
      .sort((a, b) => (b.items[0]?.fecha_solicitud ?? "").localeCompare(a.items[0]?.fecha_solicitud ?? ""));
  }, [rows]);

  // Estado de colapso por grupo
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  function toggle(nro: string) {
    setCollapsed((prev) => ({ ...prev, [nro]: !prev[nro] }));
  }

  if (loading && rows.length === 0) return <div style={{ padding: 16 }}><Text type="secondary">Cargando…</Text></div>;

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {groups.map(({ nro, items }) => {
        const first = items[0];
        const status = first?.status_requerimiento?.nombre ?? first?.status_requerimiento_codigo ?? "BORRADOR";
        const statusColor = REQ_COLOR[first?.status_requerimiento_codigo ?? "BORRADOR"] ?? "default";
        const isCollapsed = !!collapsed[nro];
        const hasBorrador = items.some((i) => i.status_requerimiento_codigo === "BORRADOR");
        const allEditable = items.every(
          (i) => i.status_requerimiento_codigo === "BORRADOR" || i.status_requerimiento_codigo === "SIN_APROBACION",
        );
        const isRealReq = nro !== "(sin nro)";
        const cantBorradores = items.filter((i) => i.status_requerimiento_codigo === "BORRADOR").length;
        // Subtotal del grupo por moneda (real + estimado catálogo, excluye ANULADO/DESAPROBADO)
        const subtotalGrupo: Record<string, number> = {};
        for (const it of items) {
          const sr = it.status_requerimiento_codigo;
          if (sr === "ANULADO" || sr === "DESAPROBADO") continue;
          const cant = Number(it.cantidad);
          let pu: number | null = null;
          let moneda = it.moneda ?? "USD";
          // Misma jerarquía que precioEfectivo: oc_precio_unitario > precio_unitario > material.precio.
          if (it.oc_precio_unitario != null) {
            pu = Number(it.oc_precio_unitario);
          } else if (it.precio_unitario != null) {
            pu = Number(it.precio_unitario);
          } else if (it.material?.precio != null) {
            pu = Number(it.material.precio);
            moneda = it.material.moneda_codigo ?? moneda;
          }
          if (pu != null && Number.isFinite(pu)) {
            subtotalGrupo[moneda] = (subtotalGrupo[moneda] ?? 0) + cant * pu;
          }
        }
        const subtotalTexto = Object.entries(subtotalGrupo)
          .map(([m, t]) => `${m} ${t.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
          .join(" · ");
        // Fecha del header: la más lejana de llegada de OC (fecha_entrega_esperada
        // de las OCs vinculadas a los items del grupo). Sirve para saber cuándo
        // llegará el requerimiento completo. Si ningún item tiene OC todavía,
        // cae a fecha_solicitud del primer item.
        const fechasOC = items
          .map((i) => i.compra?.fecha_entrega_esperada)
          .filter((d): d is string => !!d);
        const fechaMaxOC = fechasOC.length > 0
          ? fechasOC.reduce((a, b) => (a > b ? a : b))
          : null;
        const fechaHeader = fechaMaxOC ?? first?.fecha_solicitud ?? null;
        const fechaHeaderTooltip = fechaMaxOC
          ? "Fecha de llegada del último requerimiento en llegar"
          : "Fecha de solicitud (aún no hay OCs vinculadas)";
        return (
          <Card
            key={nro}
            size="small"
            styles={{ body: { padding: isCollapsed ? 0 : 0 } }}
            title={
              <Space size={8}>
                <Button
                  type="text" size="small"
                  icon={<span style={{ fontSize: 12 }}>{isCollapsed ? "▶" : "▼"}</span>}
                  onClick={() => toggle(nro)}
                />
                <Text strong style={{ fontSize: 13 }}>{nro}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {items.length} ítem{items.length !== 1 ? "s" : ""}
                  {fechaHeader && (
                    <Tooltip title={fechaHeaderTooltip}>
                      <span style={{ marginLeft: 4 }}>· {formatDateOnly(fechaHeader)}</span>
                    </Tooltip>
                  )}
                </Text>
                {subtotalTexto && (
                  <Tooltip title="Subtotal del requerimiento (precio real + estimado catálogo)">
                    <Tag color="blue" style={{ marginLeft: 4 }}>
                      💰 {subtotalTexto}
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            }
            extra={
              <Space size={6}>
                {isRealReq && allEditable && onSetFechaRequerida && (
                  <FechaRequeridaBulkButton
                    nroReq={nro}
                    onApply={onSetFechaRequerida}
                  />
                )}
                {isRealReq && allEditable && onAddItems && (
                  <Tooltip title="Agregar más items a este requerimiento">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => onAddItems(nro)}>
                      Agregar items
                    </Button>
                  </Tooltip>
                )}
                {isRealReq && hasBorrador && onEnviarGrupo && (
                  <Popconfirm
                    title={`Enviar ${nro} a aprobación`}
                    description={`Se enviarán los ${cantBorradores} item(s) en BORRADOR. Después no se podrá editar desde acá.`}
                    onConfirm={() => onEnviarGrupo(nro)}
                    okText="Enviar" cancelText="Cancelar"
                  >
                    <Button size="small" type="primary" icon={<SendOutlined />}>
                      Enviar requerimiento ({cantBorradores})
                    </Button>
                  </Popconfirm>
                )}
                <Tag color={statusColor}>{status}</Tag>
              </Space>
            }
          >
            {!isCollapsed && (
              <Table
                rowKey="id"
                columns={columns.filter((c) => (c as { key?: React.Key }).key !== "nro")}
                components={components as never}
                dataSource={items}
                pagination={false}
                size="small"
                scroll={{ x: 2160 }}
                rowClassName={(r) => r.status_requerimiento_codigo === "ANULADO" ? "req-anulado" : ""}
              />
            )}
          </Card>
        );
      })}
    </Space>
  );
}

// Botón con Popover que abre un DatePicker para setear fecha_requerida en todos los items del grupo.
function FechaRequeridaBulkButton({
  nroReq,
  onApply,
}: {
  nroReq: string;
  onApply: (nroReq: string, fecha: dayjs.Dayjs | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState<dayjs.Dayjs | null>(null);
  const [saving, setSaving] = useState(false);

  async function aplicar() {
    setSaving(true);
    try {
      await onApply(nroReq, fecha);
      setOpen(false);
      setFecha(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      content={
        <div style={{ width: 240 }}>
          <Text strong style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
            Fecha requerida para todo {nroReq}
          </Text>
          <DatePicker
            value={fecha}
            onChange={setFecha}
            format="DD/MM/YYYY"
            style={{ width: "100%" }}
          />
          <Space style={{ marginTop: 10, width: "100%", justifyContent: "flex-end" }}>
            <Button size="small" onClick={() => { setOpen(false); setFecha(null); }}>
              Cancelar
            </Button>
            <Button size="small" type="primary" onClick={aplicar} loading={saving} disabled={!fecha}>
              Aplicar a todos
            </Button>
          </Space>
        </div>
      }
    >
      <Tooltip title="Fijar fecha requerida en todos los items del requerimiento">
        <Button size="small" icon={<CalendarOutlined />}>F. Requerida</Button>
      </Tooltip>
    </Popover>
  );
}

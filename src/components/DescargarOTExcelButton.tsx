"use client";

// Botón que descarga TODO el detalle de una OT (externa o interna) como un
// .xlsx con varias hojas. Sale del detalle, NO toca el endpoint del listado.
//
// Hojas:
//   1. Resumen        — datos generales en formato Campo / Valor (vertical).
//   2. Requerimientos — items con cantidades, material, precio, status, OC.
//   3. Adjuntos       — archivos subidos a la OT con tamaño y etapa.
//   4. Costos         — desglose de materiales/HH/total.
//   5. Cambios        — filtrado del historial: SOLO cambios reales
//                       (CAMBIO_ESTADO, EDICION, REPROGRAMACION). Se omiten
//                       eventos automáticos como CREACION o REQUERIMIENTO
//                       para que la hoja sea legible de un vistazo.
//
// Funciona client-side: arma el .xlsx en el browser llamando a los endpoints
// existentes en paralelo. No requiere nueva ruta de API.

import { useState } from "react";
import { Button, App, Tooltip } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

type Tipo = "externa" | "interna";

interface Props {
  otId: number;
  tipo: Tipo;
  /** Texto del botón. Default: "Descargar Excel" */
  children?: React.ReactNode;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

function basePath(tipo: Tipo, otId: number): string {
  return tipo === "externa"
    ? `/api/ordenes-trabajo/${otId}`
    : `/api/ordenes-trabajo-internas/${otId}`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data ?? json) as T;
  } catch {
    return null;
  }
}

// ── Tipos mínimos para tipear el armado del Excel ─────────────────────────
// Pensados como "lo que el endpoint devuelve y nosotros usamos". Si la API
// cambia de shape, este archivo TS romperá donde corresponda.

type ScalarOrObj = string | number | boolean | null | undefined | { codigo?: string; nombre?: string; razon_social?: string; nombre_comercial?: string; descripcion?: string };

interface OTRecord {
  id: number;
  ot?: number | string | null;
  tipo_codigo?: string | null;
  descripcion?: string | null;
  fecha_recepcion?: string | null;
  fecha_requerimiento_cliente?: string | null;
  fecha_reprogramada?: string | null;
  fecha_inicio_plan?: string | null;
  fecha_fin_plan?: string | null;
  fecha_inicio_real?: string | null;
  fecha_fin_real?: string | null;
  fecha_cierre?: string | null;
  fecha_creacion?: string | null;
  usuario_crea?: string | null;
  cliente?: { codigo?: string; razon_social?: string; nombre_comercial?: string | null } | null;
  codigo_reparacion?: { codigo?: string; descripcion?: string } | null;
  equipo?: { codigo?: string; descripcion?: string } | null;
  equipo_codigo?: string | null;
  np?: string | null;
  ns?: string | null;
  fabricante?: { nombre?: string } | null;
  tipo_ot?: { codigo?: string; nombre?: string } | null;
  tipo_ot_interna?: { codigo?: string; nombre?: string } | null;
  prioridad_atencion?: { codigo?: string; nombre?: string } | null;
  ot_status?: { codigo?: string; nombre?: string } | null;
  recursos_status?: { codigo?: string; nombre?: string } | null;
  taller_status?: { codigo?: string; nombre?: string } | null;
  user_status?: { codigo?: string; nombre?: string } | null;
  area_taller?: string | null;
  planta?: { codigo?: string; nombre?: string } | null;
  estrategia?: { codigo?: string; descripcion?: string } | null;
  task_list?: string | null;
  semana_revision?: string | null;
  asignado_a?: string | null;
  comentarios?: string | null;
  pcr?: number | null;
  horas?: number | null;
  porcentaje_pcr?: number | null;
  monto_cotizacion?: string | number | null;
  moneda_cotizacion_codigo?: string | null;
  nro_cotizacion?: string | null;
  garantia?: { nombre?: string } | null;
  tipo_garantia?: { nombre?: string } | null;
  atencion_reparacion?: { nombre?: string } | null;
  tipo_reparacion?: { nombre?: string } | null;
  [key: string]: unknown;
}

interface RequerimientoRow {
  id: number;
  nro_req?: string | null;
  item_req?: number | null;
  tipo_codigo?: string | null;
  descripcion?: string | null;
  material_codigo?: string | null;
  material?: { codigo?: string; descripcion?: string; unidad_medida_codigo?: string | null } | null;
  cantidad?: number | string | null;
  cantidad_recibida?: number | string | null;
  unidad_medida?: string | null;
  precio_unitario?: number | string | null;
  moneda?: string | null;
  fecha_requerida?: string | null;
  fecha_entrega_real?: string | null;
  status_requerimiento?: { codigo?: string; nombre?: string } | null;
  status_oc?: { codigo?: string; nombre?: string } | null;
  proveedor?: { razon_social?: string } | null;
  compra?: { numero_po?: string; fecha_entrega_esperada?: string | null } | null;
  observaciones?: string | null;
}

interface AdjuntoRow {
  id: number;
  nombre_archivo?: string | null;
  tipo_mime?: string | null;
  tamano?: number | null;
  etapa_codigo?: string | null;
  fecha_subida?: string | null;
  usuario?: string | null;
}

interface CostosData {
  totalGeneral?: number;
  totalMateriales?: number;
  totalHoras?: number;
  totalHHCosto?: number;
  totalServicios?: number;
  moneda?: string;
  items?: Array<{
    tipo?: string;
    fecha?: string | null;
    descripcion?: string;
    cantidad?: number;
    precio_unitario?: number;
    subtotal?: number;
    moneda?: string;
    documento?: string;
    usuario?: string;
  }>;
}

interface HistorialRow {
  id: number;
  tipo_operacion?: string | null;
  descripcion?: string | null;
  usuario?: string | null;
  fecha?: string | null;
  createdAt?: string | null;
  datos_adicionales?: string | null;
}

// ── Helpers de formateo ───────────────────────────────────────────────────

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD/MM/YYYY") : "";
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = dayjs(v);
  return d.isValid() ? d.format("DD/MM/YYYY HH:mm") : "";
}

function fmtNum(v: number | string | null | undefined, decimals = 2): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-PE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function nombreDe(v: ScalarOrObj): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return v.nombre ?? v.descripcion ?? v.codigo ?? v.razon_social ?? v.nombre_comercial ?? "";
}

function bytesLegibles(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// Solo eventos de historial que representan CAMBIOS reales hechos por usuarios.
// Excluye CREACION (registro automático al crear la OT) y eventos automáticos
// disparados desde otros módulos (REQUERIMIENTO, OC creada/aceptada, etc.).
const TIPOS_CAMBIO = new Set(["CAMBIO_ESTADO", "EDICION", "REPROGRAMACION"]);

// Parsea datos_adicionales (JSON con campo, valor_anterior, valor_nuevo) para
// extraer las columnas "Campo / Antes / Ahora". Cuando viene null o no parsea,
// devuelve strings vacíos — la descripción ya contiene el resumen legible.
function parseDatosAdicionales(s: string | null | undefined): { campo: string; antes: string; ahora: string } {
  if (!s) return { campo: "", antes: "", ahora: "" };
  try {
    const j = JSON.parse(s) as { campo?: string; valor_anterior?: unknown; valor_nuevo?: unknown };
    const fmt = (v: unknown): string => {
      if (v == null) return "(vacío)";
      if (typeof v === "string") return v;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      return JSON.stringify(v);
    };
    return {
      campo: j.campo ?? "",
      antes: fmt(j.valor_anterior),
      ahora: fmt(j.valor_nuevo),
    };
  } catch {
    return { campo: "", antes: "", ahora: "" };
  }
}

// ── Componente ────────────────────────────────────────────────────────────

export function DescargarOTExcelButton({ otId, tipo, children }: Props) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  async function descargar() {
    setLoading(true);
    try {
      const base = basePath(tipo, otId);

      // Fetch en paralelo de las 5 secciones del detalle.
      const [ot, requerimientos, adjuntos, costos, historial] = await Promise.all([
        fetchJson<OTRecord>(base),
        fetchJson<RequerimientoRow[]>(`${base}/requerimientos`),
        fetchJson<AdjuntoRow[]>(`${base}/adjuntos`),
        fetchJson<CostosData>(`${base}/costos`),
        fetchJson<HistorialRow[]>(`${base}/historial`),
      ]);

      if (!ot) {
        message.error("No se pudo cargar el detalle de la OT");
        return;
      }

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // ── Hoja 1: Resumen ───────────────────────────────────────────────
      // Una fila por campo para no encimar todo en pocas columnas anchas.
      // El orden refleja el detalle visual del UI.
      const resumen: Array<{ Campo: string; Valor: string }> = [];
      const addCampo = (campo: string, valor: ScalarOrObj | undefined) => {
        const v = nombreDe(valor);
        resumen.push({ Campo: campo, Valor: v });
      };

      if (tipo === "externa") {
        addCampo("OT N°", ot.ot != null ? String(ot.ot) : "");
        addCampo("Tipo OT", ot.tipo_ot ?? ot.tipo_codigo);
        addCampo("Descripción", ot.descripcion);
        addCampo("Cliente", ot.cliente?.nombre_comercial || ot.cliente?.razon_social || "");
        addCampo("Cod. Reparación", ot.codigo_reparacion?.codigo);
        addCampo("Cod. Reparación - Descripción", ot.codigo_reparacion?.descripcion);
        addCampo("Equipo", ot.equipo_codigo);
        addCampo("N° Serie (NS)", ot.ns);
        addCampo("N/P", ot.np);
        addCampo("Fabricante", ot.fabricante);
        addCampo("Prioridad", ot.prioridad_atencion);
        addCampo("OT Status", ot.ot_status);
        addCampo("Recursos Status", ot.recursos_status);
        addCampo("Taller Status", ot.taller_status);
        addCampo("Atención Rep.", ot.atencion_reparacion);
        addCampo("Tipo Rep.", ot.tipo_reparacion);
        addCampo("Garantía", ot.garantia);
        addCampo("Tipo Garantía", ot.tipo_garantia);
        addCampo("F. Recepción", fmtDate(ot.fecha_recepcion));
        addCampo("F. Req. Cliente", fmtDate(ot.fecha_requerimiento_cliente));
        addCampo("F. Reprogramada", fmtDate(ot.fecha_reprogramada));
        addCampo("PCR", ot.pcr != null ? String(ot.pcr) : "");
        addCampo("Horas", ot.horas != null ? String(ot.horas) : "");
        addCampo("% PCR", ot.porcentaje_pcr != null ? `${ot.porcentaje_pcr}%` : "");
        addCampo("N° Cotización", ot.nro_cotizacion);
        addCampo(
          "Monto Cotización",
          ot.monto_cotizacion != null && ot.monto_cotizacion !== ""
            ? `${ot.moneda_cotizacion_codigo ?? ""} ${fmtNum(ot.monto_cotizacion)}`.trim()
            : "",
        );
        addCampo("Comentarios", ot.comentarios);
        addCampo("Creada por", ot.usuario_crea);
        addCampo("F. Creación", fmtDateTime(ot.fecha_creacion));
      } else {
        // OT interna
        addCampo("OT Interna N°", ot.ot != null ? String(ot.ot) : "");
        addCampo("Tipo", ot.tipo_ot_interna);
        addCampo("Descripción", ot.descripcion);
        addCampo("Área asignada", ot.area_taller);
        addCampo("Planta", ot.planta);
        addCampo("Equipo", ot.equipo
          ? `${ot.equipo.codigo} — ${ot.equipo.descripcion}`
          : (ot.equipo_codigo ?? ""));
        addCampo("Prioridad", ot.prioridad_atencion);
        addCampo("OT Status", ot.ot_status);
        addCampo("User Status", ot.user_status);
        addCampo("Recursos Status", ot.recursos_status);
        addCampo("Estrategia", ot.estrategia ? `${ot.estrategia.codigo} — ${ot.estrategia.descripcion}` : "");
        addCampo("Task List", ot.task_list);
        addCampo("Semana Revisión", ot.semana_revision);
        addCampo("Asignado a", ot.asignado_a);
        addCampo("F. Inicio Planificado", fmtDate(ot.fecha_inicio_plan));
        addCampo("F. Fin Planificado", fmtDate(ot.fecha_fin_plan));
        addCampo("F. Inicio Real", fmtDate(ot.fecha_inicio_real));
        addCampo("F. Fin Real", fmtDate(ot.fecha_fin_real));
        addCampo("F. Cierre", fmtDate(ot.fecha_cierre));
        addCampo("Comentarios", ot.comentarios);
        addCampo("Creada por", ot.usuario_crea);
        addCampo("F. Creación", fmtDateTime(ot.fecha_creacion));
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

      // ── Hoja 2: Requerimientos ────────────────────────────────────────
      const reqsRows = (requerimientos ?? []).map((r) => ({
        "Nro Req.": r.nro_req ?? "",
        "Item": r.item_req ?? "",
        "Tipo": r.tipo_codigo ?? "",
        "Material": r.material?.codigo ?? r.material_codigo ?? "",
        "Descripción": r.material?.descripcion ?? r.descripcion ?? "",
        "Cantidad": r.cantidad != null ? Number(r.cantidad) : "",
        "Recibida": r.cantidad_recibida != null ? Number(r.cantidad_recibida) : "",
        "UM": r.material?.unidad_medida_codigo ?? r.unidad_medida ?? "",
        "Precio Unit.": r.precio_unitario != null && r.precio_unitario !== ""
          ? Number(r.precio_unitario)
          : "",
        "Moneda": r.moneda ?? "",
        "Total": r.cantidad != null && r.precio_unitario != null
          ? Number(r.cantidad) * Number(r.precio_unitario)
          : "",
        "Status Req.": r.status_requerimiento?.nombre ?? r.status_requerimiento?.codigo ?? "",
        "Status OC": r.status_oc?.nombre ?? r.status_oc?.codigo ?? "",
        "Proveedor": r.proveedor?.razon_social ?? "",
        "N° OC": r.compra?.numero_po ?? "",
        "F. Requerida": fmtDate(r.fecha_requerida),
        "F. Entrega Real": fmtDate(r.fecha_entrega_real),
        "Observaciones": r.observaciones ?? "",
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(reqsRows.length > 0 ? reqsRows : [{ "Nro Req.": "(sin requerimientos)" }]),
        "Requerimientos",
      );

      // ── Hoja 3: Adjuntos ──────────────────────────────────────────────
      const adjRows = (adjuntos ?? []).map((a) => ({
        "Nombre": a.nombre_archivo ?? "",
        "Etapa": a.etapa_codigo ?? "",
        "Tamaño": bytesLegibles(a.tamano),
        "Tipo MIME": a.tipo_mime ?? "",
        "Subido por": a.usuario ?? "",
        "Fecha de subida": fmtDateTime(a.fecha_subida),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(adjRows.length > 0 ? adjRows : [{ "Nombre": "(sin adjuntos)" }]),
        "Adjuntos",
      );

      // ── Hoja 4: Costos ────────────────────────────────────────────────
      const costosResumen: Array<{ Concepto: string; Valor: string }> = [];
      const moneda = costos?.moneda ?? "";
      const num = (v: number | undefined) => (v != null ? `${moneda} ${fmtNum(v)}`.trim() : "");
      costosResumen.push({ Concepto: "Total Materiales", Valor: num(costos?.totalMateriales) });
      if (costos?.totalServicios != null) {
        costosResumen.push({ Concepto: "Total Servicios", Valor: num(costos.totalServicios) });
      }
      if (costos?.totalHoras != null || costos?.totalHHCosto != null) {
        costosResumen.push({ Concepto: "Horas HH", Valor: costos?.totalHoras != null ? String(costos.totalHoras) : "" });
        costosResumen.push({ Concepto: "Costo HH", Valor: num(costos?.totalHHCosto) });
      }
      costosResumen.push({ Concepto: "TOTAL", Valor: num(costos?.totalGeneral) });
      costosResumen.push({ Concepto: "", Valor: "" });
      costosResumen.push({ Concepto: "── Detalle de items ──", Valor: "" });

      // Append items con los mismos headers (Concepto/Valor) o desnormalizados.
      // Para mejor lectura, los pongo en un segundo bloque con columnas planas.
      const costosWS = XLSX.utils.json_to_sheet(costosResumen);
      const itemRows = (costos?.items ?? []).map((it) => ({
        "Tipo": it.tipo ?? "",
        "Fecha": fmtDate(it.fecha ?? null),
        "Descripción": it.descripcion ?? "",
        "Cantidad": it.cantidad ?? "",
        "Precio Unit.": it.precio_unitario != null ? fmtNum(it.precio_unitario) : "",
        "Subtotal": it.subtotal != null ? fmtNum(it.subtotal) : "",
        "Moneda": it.moneda ?? "",
        "Documento": it.documento ?? "",
        "Usuario": it.usuario ?? "",
      }));
      // Pegar el detalle abajo del resumen (después de N filas vacías).
      if (itemRows.length > 0) {
        XLSX.utils.sheet_add_json(costosWS, itemRows, { origin: -1, skipHeader: false });
      }
      XLSX.utils.book_append_sheet(wb, costosWS, "Costos");

      // ── Hoja 5: Cambios ───────────────────────────────────────────────
      // SOLO eventos que representen cambios reales hechos por usuarios.
      // CREACION + REQUERIMIENTO + eventos cross-módulo (OC creada, etc.) se
      // omiten. La hoja queda como un audit-log limpio de qué se editó.
      const cambios = (historial ?? [])
        .filter((h) => TIPOS_CAMBIO.has(h.tipo_operacion ?? ""))
        .map((h) => {
          const extra = parseDatosAdicionales(h.datos_adicionales ?? null);
          return {
            "Fecha": fmtDateTime(h.createdAt ?? h.fecha ?? null),
            "Usuario": h.usuario ?? "",
            "Tipo": h.tipo_operacion ?? "",
            "Campo": extra.campo,
            "Antes": extra.antes,
            "Ahora": extra.ahora,
            "Descripción": h.descripcion ?? "",
          };
        });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          cambios.length > 0 ? cambios : [{ "Fecha": "(sin cambios registrados)" }],
        ),
        "Cambios",
      );

      // ── Nombre de archivo ─────────────────────────────────────────────
      const otCodigo = ot.ot != null
        ? (tipo === "externa"
            ? `${ot.tipo_codigo === "BIE" ? "V" : ot.tipo_codigo === "SER" ? "S" : ""}${String(ot.ot).padStart(6, "0")}`
            : `OI${String(ot.ot).padStart(6, "0")}`)
        : `id${otId}`;
      const ts = dayjs().format("YYYYMMDD-HHmm");
      const filename = `${tipo === "externa" ? "OT" : "OTI"}-${otCodigo}-${ts}.xlsx`;
      XLSX.writeFile(wb, filename);
      message.success(`Descargado: ${filename}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al generar el Excel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip title="Descarga un .xlsx con todas las secciones del detalle (Resumen, Requerimientos, Adjuntos, Costos) más una hoja de cambios realizados.">
      <Button
        icon={<FileExcelOutlined />}
        loading={loading}
        onClick={descargar}
        style={{ background: "#1d6f42", color: "#fff", borderColor: "#1d6f42" }}
      >
        {children ?? "Descargar Excel"}
      </Button>
    </Tooltip>
  );
}

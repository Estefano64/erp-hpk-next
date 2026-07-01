"use client";

// Botón que descarga TODO el detalle de una OT (externa o interna) como un
// .docx con secciones en tablas. Reemplazo del anterior DescargarOTExcelButton
// — misma información pero en formato Word más presentable (tablas, títulos,
// mejor lectura).
//
// Secciones:
//   1. Resumen         — tabla Campo | Valor con los datos generales.
//   2. Requerimientos  — tabla con encabezado (Nro Req / Item / Material / ...).
//   3. Adjuntos        — tabla (Nombre / Etapa / Tamaño / Fecha).
//   4. Costos          — tabla con resumen (Concepto / Valor) + detalle.
//   5. Cambios         — audit log filtrado (solo CAMBIO_ESTADO, EDICION,
//                        REPROGRAMACION). Se omiten eventos automáticos.
//
// El .docx se arma client-side con la librería `docx` (no toca R2 ni un
// endpoint específico de descarga; usa los endpoints existentes del detalle).

import { useState } from "react";
import { Button, App, Tooltip } from "antd";
import { FileWordOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
// El valor de `docx` se importa dinámico dentro del handler para que solo
// llegue al bundle cuando el user toca el botón. Para tipar los helpers
// internos usamos alias locales — los valores del enum AlignmentType de docx
// son strings ("left" | "center" | ...) así que trabajamos con esa forma.
type AlignType = "left" | "center" | "right" | "both" | "distribute";
type DocxParagraph = import("docx").Paragraph;
type DocxTable = import("docx").Table;
// HeadingLevel en docx es un const object con valores string ("Heading1", ...).
// Definimos la union para tipar el parámetro `level` de nuestro helper.
type DocxHeadingLevel =
  | "Title" | "Heading1" | "Heading2" | "Heading3"
  | "Heading4" | "Heading5" | "Heading6";

type Tipo = "externa" | "interna";

interface Props {
  otId: number;
  tipo: Tipo;
  /** Texto del botón. Default: "Descargar Word" */
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

// ── Tipos mínimos para tipear el armado del documento ────────────────────

type ScalarOrObj = string | number | boolean | null | undefined | {
  codigo?: string; nombre?: string; razon_social?: string;
  nombre_comercial?: string; descripcion?: string;
};

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

const TIPOS_CAMBIO = new Set(["CAMBIO_ESTADO", "EDICION", "REPROGRAMACION"]);

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

export function DescargarOTWordButton({ otId, tipo, children }: Props) {
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

      // Import dinámico — pesa varios KB y solo lo necesitamos al descargar.
      const docx = await import("docx");
      const {
        Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell,
        WidthType, AlignmentType, BorderStyle, ShadingType,
      } = docx;

      // ── Helpers para armar tabla Word ─────────────────────────────────

      const CELL_MARGIN = { top: 60, bottom: 60, left: 100, right: 100 };
      const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
      const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      const HEADER_SHADING = { type: ShadingType.CLEAR, fill: "1B3B6F", color: "auto" }; // navy
      const HEADER_TEXT_COLOR = "FFFFFF";

      const cellText = (text: string, opts: { bold?: boolean; color?: string; align?: AlignType } = {}) =>
        new TableCell({
          margins: CELL_MARGIN,
          borders: CELL_BORDERS,
          children: [new Paragraph({
            alignment: opts.align ?? AlignmentType.LEFT,
            children: [new TextRun({
              text: text || "—",
              bold: opts.bold ?? false,
              color: opts.color,
              size: 20, // 10pt
            })],
          })],
        });

      const headerCell = (text: string, align: AlignType = AlignmentType.LEFT) =>
        new TableCell({
          margins: CELL_MARGIN,
          borders: CELL_BORDERS,
          shading: HEADER_SHADING,
          children: [new Paragraph({
            alignment: align,
            children: [new TextRun({
              text,
              bold: true,
              color: HEADER_TEXT_COLOR,
              size: 20,
            })],
          })],
        });

      const heading = (text: string, level: DocxHeadingLevel = HeadingLevel.HEADING_1) =>
        new Paragraph({
          heading: level,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text, bold: true, color: "1B3B6F", size: 28 })],
        });

      const parrafo = (text: string, opts: { bold?: boolean; italic?: boolean } = {}) =>
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: 20 })],
        });

      // Tabla Campo | Valor (Resumen).
      const tablaCampoValor = (rows: Array<{ campo: string; valor: string }>) =>
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                headerCell("Campo"),
                headerCell("Valor"),
              ],
            }),
            ...rows.map((r) => new TableRow({
              children: [cellText(r.campo, { bold: true }), cellText(r.valor)],
            })),
          ],
        });

      // Celda con shading gris muy suave (para zebra rows).
      const cellTextZebra = (text: string, opts: { bold?: boolean; align?: AlignType } = {}) =>
        new TableCell({
          margins: CELL_MARGIN,
          borders: CELL_BORDERS,
          shading: { type: ShadingType.CLEAR, fill: "F5F7FA", color: "auto" },
          children: [new Paragraph({
            alignment: opts.align ?? AlignmentType.LEFT,
            children: [new TextRun({ text: text || "—", bold: opts.bold ?? false, size: 20 })],
          })],
        });

      // Tabla genérica con encabezados custom y filas alternadas (zebra).
      // Ayuda a leer tablas anchas cuando las columnas quedan angostas.
      const tablaGrid = (headers: string[], rows: string[][], colAligns?: AlignType[]) =>
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: headers.map((h, i) => headerCell(h, colAligns?.[i] ?? AlignmentType.LEFT)),
            }),
            ...rows.map((r, rowIdx) => new TableRow({
              children: r.map((c, colIdx) => rowIdx % 2 === 1
                ? cellTextZebra(c, { align: colAligns?.[colIdx] })
                : cellText(c, { align: colAligns?.[colIdx] })),
            })),
          ],
        });

      // ── Sección 1: Resumen ────────────────────────────────────────────

      const resumenRows: Array<{ campo: string; valor: string }> = [];
      const addCampo = (campo: string, valor: ScalarOrObj | undefined) => {
        const v = nombreDe(valor);
        resumenRows.push({ campo, valor: v || "—" });
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

      const otCodigo = ot.ot != null
        ? (tipo === "externa"
            ? `${ot.tipo_codigo === "BIE" ? "V" : ot.tipo_codigo === "SER" ? "S" : ""}${String(ot.ot).padStart(6, "0")}`
            : `OI${String(ot.ot).padStart(6, "0")}`)
        : `id${otId}`;

      const tituloDoc = `${tipo === "externa" ? "OT Externa" : "OT Interna"} — ${otCodigo}`;

      // ── Sección 2: Requerimientos ─────────────────────────────────────
      // Reducidas a 9 columnas para que quede legible (antes 17 quedaban muy
      // apretadas). Se preservan los datos importantes: identificación,
      // descripción, cantidad+UM en una sola col, precio+total+moneda, quién
      // provee y cuándo se necesita.

      const reqsHeaders = [
        "Nro Req / Item", "Material", "Descripción",
        "Cant.", "P. Unit.", "Total", "Estado OC",
        "Proveedor / N° OC", "F. Requerida",
      ];
      const reqsAligns: AlignType[] = [
        AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.LEFT,
        AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT,
        AlignmentType.LEFT, AlignmentType.LEFT, AlignmentType.CENTER,
      ];
      const reqsRows = (requerimientos ?? []).map((r) => {
        const total = r.cantidad != null && r.precio_unitario != null
          ? Number(r.cantidad) * Number(r.precio_unitario)
          : null;
        const um = r.material?.unidad_medida_codigo ?? r.unidad_medida ?? "";
        const cantConUm = r.cantidad != null
          ? `${fmtNum(r.cantidad)}${um ? " " + um : ""}`
          : "";
        const puConMoneda = r.precio_unitario != null && r.precio_unitario !== ""
          ? `${r.moneda ? r.moneda + " " : ""}${fmtNum(r.precio_unitario)}`
          : "";
        const totalConMoneda = total != null
          ? `${r.moneda ? r.moneda + " " : ""}${fmtNum(total)}`
          : "";
        const provOC = [
          r.proveedor?.razon_social,
          r.compra?.numero_po ? `OC ${r.compra.numero_po}` : "",
        ].filter(Boolean).join(" · ");
        return [
          `${r.nro_req ?? ""}${r.item_req != null ? " / " + r.item_req : ""}`,
          r.material?.codigo ?? r.material_codigo ?? "",
          r.material?.descripcion ?? r.descripcion ?? "",
          cantConUm,
          puConMoneda,
          totalConMoneda,
          r.status_oc?.nombre ?? r.status_oc?.codigo ?? "",
          provOC,
          fmtDate(r.fecha_requerida),
        ];
      });

      // ── Sección 3: Adjuntos ───────────────────────────────────────────
      // Reducidas a 4 columnas — el MIME y usuario_sube ya no se muestran
      // (rara vez útil en el reporte).

      const adjHeaders = ["Nombre", "Etapa", "Tamaño", "F. Subida"];
      const adjAligns: AlignType[] = [
        AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER,
      ];
      const adjRows = (adjuntos ?? []).map((a) => [
        a.nombre_archivo ?? "",
        a.etapa_codigo ?? "",
        bytesLegibles(a.tamano),
        fmtDate(a.fecha_subida),
      ]);

      // ── Sección 4: Costos ─────────────────────────────────────────────

      const monedaC = costos?.moneda ?? "";
      const num = (v: number | undefined) => (v != null ? `${monedaC} ${fmtNum(v)}`.trim() : "—");
      const costosResumenRows: Array<{ campo: string; valor: string }> = [];
      costosResumenRows.push({ campo: "Total Materiales", valor: num(costos?.totalMateriales) });
      if (costos?.totalServicios != null) {
        costosResumenRows.push({ campo: "Total Servicios", valor: num(costos.totalServicios) });
      }
      if (costos?.totalHoras != null || costos?.totalHHCosto != null) {
        costosResumenRows.push({ campo: "Horas HH", valor: costos?.totalHoras != null ? String(costos.totalHoras) : "—" });
        costosResumenRows.push({ campo: "Costo HH", valor: num(costos?.totalHHCosto) });
      }
      costosResumenRows.push({ campo: "TOTAL", valor: num(costos?.totalGeneral) });

      // Detalle de costos — reducido a 6 columnas. El documento y usuario
      // salen de la vista principal (siguen en el historial completo).
      const costosItemHeaders = ["Tipo", "Fecha", "Descripción", "Cant.", "P. Unit.", "Subtotal"];
      const costosItemAligns: AlignType[] = [
        AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT,
        AlignmentType.RIGHT, AlignmentType.RIGHT, AlignmentType.RIGHT,
      ];
      const costosItemRows = (costos?.items ?? []).map((it) => [
        it.tipo ?? "",
        fmtDate(it.fecha ?? null),
        it.descripcion ?? "",
        it.cantidad != null ? String(it.cantidad) : "",
        it.precio_unitario != null
          ? `${it.moneda ? it.moneda + " " : ""}${fmtNum(it.precio_unitario)}`
          : "",
        it.subtotal != null
          ? `${it.moneda ? it.moneda + " " : ""}${fmtNum(it.subtotal)}`
          : "",
      ]);

      // ── Sección 5: Cambios ────────────────────────────────────────────
      // Reducida a 5 columnas — el diff completo (antes/ahora) suele
      // aparecer también en la descripción del historial. Se prioriza qué
      // cambió (Campo) y quién lo cambió.

      const cambiosHeaders = ["Fecha", "Usuario", "Tipo", "Campo", "Descripción"];
      const cambiosAligns: AlignType[] = [
        AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER,
        AlignmentType.LEFT, AlignmentType.LEFT,
      ];
      const cambios = (historial ?? [])
        .filter((h) => TIPOS_CAMBIO.has(h.tipo_operacion ?? ""))
        .map((h) => {
          const extra = parseDatosAdicionales(h.datos_adicionales ?? null);
          // Compone la descripción con el diff si viene en datos_adicionales.
          const descBase = h.descripcion ?? "";
          const descConDiff = extra.antes || extra.ahora
            ? `${descBase}${descBase ? " · " : ""}${extra.antes || "(vacío)"} → ${extra.ahora || "(vacío)"}`.trim()
            : descBase;
          return [
            fmtDateTime(h.createdAt ?? h.fecha ?? null),
            h.usuario ?? "",
            h.tipo_operacion ?? "",
            extra.campo,
            descConDiff,
          ];
        });

      // ── Ensamblar documento ───────────────────────────────────────────

      const children: (DocxParagraph | DocxTable)[] = [];

      // Título centrado.
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: tituloDoc, bold: true, color: "1B3B6F", size: 36 }),
          ],
        }),
      );
      children.push(parrafo(`Generado: ${dayjs().format("DD/MM/YYYY HH:mm")}`, { italic: true }));

      children.push(heading("1. Resumen"));
      children.push(tablaCampoValor(resumenRows));

      children.push(heading("2. Requerimientos"));
      if (reqsRows.length > 0) {
        children.push(tablaGrid(reqsHeaders, reqsRows, reqsAligns));
      } else {
        children.push(parrafo("(sin requerimientos)", { italic: true }));
      }

      children.push(heading("3. Adjuntos"));
      if (adjRows.length > 0) {
        children.push(tablaGrid(adjHeaders, adjRows, adjAligns));
      } else {
        children.push(parrafo("(sin adjuntos)", { italic: true }));
      }

      children.push(heading("4. Costos"));
      children.push(tablaCampoValor(costosResumenRows));
      if (costosItemRows.length > 0) {
        children.push(heading("Detalle de items", HeadingLevel.HEADING_2));
        children.push(tablaGrid(costosItemHeaders, costosItemRows, costosItemAligns));
      }

      children.push(heading("5. Cambios realizados"));
      if (cambios.length > 0) {
        children.push(tablaGrid(cambiosHeaders, cambios, cambiosAligns));
      } else {
        children.push(parrafo("(sin cambios registrados)", { italic: true }));
      }

      const doc = new Document({
        creator: "ERP HPK",
        title: tituloDoc,
        description: `Detalle de ${tituloDoc}`,
        styles: {
          default: {
            document: {
              run: { font: "Calibri", size: 20 },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5" — más aire
            },
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const ts = dayjs().format("YYYYMMDD-HHmm");
      const filename = `${tipo === "externa" ? "OT" : "OTI"}-${otCodigo}-${ts}.docx`;

      // Trigger de descarga.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      message.success(`Descargado: ${filename}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Error al generar el Word");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip title="Descarga un .docx con todas las secciones del detalle (Resumen, Requerimientos, Adjuntos, Costos, Cambios) en tablas ordenadas.">
      <Button
        icon={<FileWordOutlined />}
        loading={loading}
        onClick={descargar}
        style={{ background: "#2b579a", color: "#fff", borderColor: "#2b579a" }}
      >
        {children ?? "Descargar Word"}
      </Button>
    </Tooltip>
  );
}

// Generador del PDF con formato HPK-M-F-07 (Reporte de Mantenimiento
// Correctivo). Compartido entre:
//   - /api/mantenimiento/correctivos/[id]/pdf  (fuente ReporteCorrectivo)
//   - /api/ordenes-trabajo/[id]/reporte-correctivo/pdf  (fuente OT externa)
//   - /api/ordenes-trabajo-internas/[id]/reporte-correctivo/pdf  (fuente OT interna)
//
// Los tres consumen un mismo shape de entrada; el caller decide de dónde salen
// los valores (ReporteCorrectivo tiene sus campos propios; las OTs los infieren
// de su equipo/área/descripción).

import {
  buildPdfBuffer,
  drawHPKHeader,
  drawLabelValueRow,
  drawTextBlock,
} from "@/lib/pdf/hpk-header";

export interface ReporteCorrectivoPDFData {
  /** Cabecera opcional — se muestra si viene ("Reporte N° RC-0001-26"). */
  reporte_numero?: string | null;
  /** Cabecera de campos. */
  area_nombre: string | null;
  equipo_nombre: string | null;
  equipo_codigo: string | null;
  fecha: string; // pre-formateada (DD/MM/YYYY)
  /** Contenido principal. */
  detalle_falla: string | null;
  descripcion_correctivo: string | null;
  /** Firmas — 2 cajas al pie. */
  realizado_por: string | null;
  fecha_realizado: string; // pre-formateada
  responsable_area: string | null;
  fecha_responsable: string; // pre-formateada
  /** Adjuntos — se listan por nombre en un bloque debajo del texto (opcional). */
  adjuntos?: Array<{ nombre_archivo: string | null; etapa_codigo?: string | null }>;
}

export async function buildReporteCorrectivoPDF(
  data: ReporteCorrectivoPDFData,
): Promise<Buffer> {
  return await buildPdfBuffer((doc) => {
    const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    drawHPKHeader(doc, {
      titulo: "REPORTE DE MANTENIMIENTO CORRECTIVO",
      codigoFormato: "HPK-M-F-07",
      version: "01",
      revision: "01",
      fechaAprobacion: "21/02/2019",
    });

    if (data.reporte_numero) {
      drawLabelValueRow(doc, "Reporte N°:", data.reporte_numero, totalW);
    }

    // Cabecera de campos.
    drawLabelValueRow(doc, "Área:", data.area_nombre ?? "", totalW);
    drawLabelValueRow(doc, "Nombre equipo:", data.equipo_nombre ?? "", totalW);
    drawLabelValueRow(doc, "Código:", data.equipo_codigo ?? "", totalW);
    drawLabelValueRow(doc, "Fecha:", data.fecha, totalW);

    doc.y += 6;

    // Detalle de Falla.
    drawTextBlock(doc, "Detalle de Falla", data.detalle_falla, totalW, 120);

    doc.y += 6;

    // Descripción del correctivo.
    drawTextBlock(doc, "Descripción de Mantenimiento Correctivo", data.descripcion_correctivo, totalW, 160);

    // Adjuntos — solo nombre + etapa, no descarga. Solo si vienen.
    if (data.adjuntos && data.adjuntos.length > 0) {
      doc.y += 8;
      const startY = doc.y;
      const headerH = 16;
      doc.lineWidth(0.6).strokeColor("#000")
        .rect(doc.page.margins.left, startY, totalW, headerH)
        .fillAndStroke("#E5E5E5", "#000");
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(10)
        .text("Adjuntos", doc.page.margins.left, startY + 4, { width: totalW, align: "center" });

      doc.y = startY + headerH;
      doc.font("Helvetica").fontSize(9).fillColor("#000");
      for (const a of data.adjuntos) {
        const nombre = a.nombre_archivo ?? "(sin nombre)";
        const etapa = a.etapa_codigo ? ` — ${a.etapa_codigo}` : "";
        doc.text(`• ${nombre}${etapa}`, doc.page.margins.left + 6, doc.y, { width: totalW - 12 });
        doc.y += 2;
      }
      doc.y += 4;
    }

    doc.y += 12;

    // Firmas — 2 columnas con NOMBRE / FECHA / FIRMA.
    const x = doc.page.margins.left;
    const yFirma = doc.y;
    const colW = totalW / 2 - 8;

    const drawFirmaCol = (left: number, titulo: string, nombre: string, fecha: string) => {
      const h = 100;
      doc.lineWidth(0.6).strokeColor("#000").rect(left, yFirma, colW, h).stroke();
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000")
        .text(titulo, left, yFirma + 4, { width: colW, align: "center" });

      const rowH = (h - 16) / 3;
      for (let i = 0; i < 3; i++) {
        const yy = yFirma + 16 + i * rowH;
        doc.moveTo(left, yy).lineTo(left + colW, yy).strokeColor("#000").lineWidth(0.3).stroke();
      }
      const labels = ["NOMBRE", "FECHA", "FIRMA"];
      const values = [nombre, fecha, ""];
      for (let i = 0; i < 3; i++) {
        const yy = yFirma + 16 + i * rowH;
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#000")
          .text(labels[i], left + 4, yy + 4, { width: 60 });
        doc.font("Helvetica").fontSize(8)
          .text(values[i] || "", left + 70, yy + 4, { width: colW - 76 });
      }
    };

    drawFirmaCol(x, "Realizado Por", data.realizado_por ?? "", data.fecha_realizado);
    drawFirmaCol(x + colW + 16, "Responsable de Área", data.responsable_area ?? "", data.fecha_responsable);
    doc.y = yFirma + 100;
  });
}

// Formatea una Date | null a "DD/MM/YYYY" o cadena vacía.
export function fmtFechaPDF(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

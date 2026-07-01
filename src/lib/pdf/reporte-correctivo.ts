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
  /** Datos generales de la OT — se renderizan en un grid antes del bloque
   *  "Detalle de Falla". Cada fila es un {label, value, wide?}.
   *  `wide: true` → renderiza a ancho completo (para textos largos como
   *  Descripción o Comentarios). Vacíos se omiten. */
  datos_ot?: Array<{ label: string; value: string | null | undefined; wide?: boolean }>;
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

    // Datos generales de la OT (opcional). Los campos "wide" (Descripción,
    // Comentarios, etc.) se renderizan a ancho completo para evitar
    // desborde a la celda de al lado; los demás en grid de 2 columnas.
    const datosNonEmpty = (data.datos_ot ?? []).filter(
      (r) => r.value != null && String(r.value).trim() !== "",
    );
    if (datosNonEmpty.length > 0) {
      doc.y += 6;
      // Header gris de sección.
      const startYd = doc.y;
      const headerH = 16;
      doc.lineWidth(0.6).strokeColor("#000")
        .rect(doc.page.margins.left, startYd, totalW, headerH)
        .fillAndStroke("#E5E5E5", "#000");
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(10)
        .text("Datos de la OT", doc.page.margins.left, startYd + 4, { width: totalW, align: "center" });
      doc.y = startYd + headerH;

      // Separamos por tipo: wide primero abajo del header, luego grid 2col.
      const anchos = datosNonEmpty.filter((r) => r.wide);
      const angostos = datosNonEmpty.filter((r) => !r.wide);
      const colW = totalW / 2;
      const labelWnarrow = 90;
      const labelWwide = 110;
      const paddingX = 4;
      const paddingY = 3;
      const fontSize = 8;
      doc.font("Helvetica").fontSize(fontSize);

      // Helper para dibujar una celda con altura calculada.
      const drawCell = (
        x: number, y: number, w: number,
        label: string, value: string, labelW: number,
      ): number => {
        const valueW = w - labelW - paddingX;
        const valueH = doc.heightOfString(value, { width: valueW });
        const rowH = Math.max(14, valueH + paddingY * 2);
        doc.lineWidth(0.3).strokeColor("#666")
          .rect(x, y, w, rowH).stroke();
        doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#000")
          .text(label, x + paddingX, y + paddingY, { width: labelW - paddingX });
        doc.font("Helvetica").fontSize(fontSize)
          .text(value, x + labelW, y + paddingY, { width: valueW });
        return rowH;
      };

      // Filas wide (una por fila, ancho completo).
      for (const item of anchos) {
        const h = drawCell(
          doc.page.margins.left, doc.y, totalW,
          item.label, String(item.value ?? ""), labelWwide,
        );
        doc.y += h;
      }
      // Filas angostas — 2 columnas. Recorremos en pares: [izq, der].
      for (let i = 0; i < angostos.length; i += 2) {
        const izq = angostos[i];
        const der = angostos[i + 1];
        const yRow = doc.y;
        // Dibujamos ambas celdas — necesitamos que tengan la misma altura
        // para que el grid se vea parejo; calculamos las 2 y usamos la max.
        const izqValW = colW - labelWnarrow - paddingX;
        const izqH = doc.heightOfString(String(izq.value ?? ""), { width: izqValW }) + paddingY * 2;
        let derH = 14;
        if (der) {
          const derValW = colW - labelWnarrow - paddingX;
          derH = doc.heightOfString(String(der.value ?? ""), { width: derValW }) + paddingY * 2;
        }
        const rowH = Math.max(14, izqH, derH);
        // Celda izquierda.
        doc.lineWidth(0.3).strokeColor("#666")
          .rect(doc.page.margins.left, yRow, colW, rowH).stroke();
        doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#000")
          .text(izq.label, doc.page.margins.left + paddingX, yRow + paddingY, { width: labelWnarrow - paddingX });
        doc.font("Helvetica").fontSize(fontSize)
          .text(String(izq.value ?? ""), doc.page.margins.left + labelWnarrow, yRow + paddingY, {
            width: colW - labelWnarrow - paddingX,
          });
        // Celda derecha (si existe).
        if (der) {
          const xDer = doc.page.margins.left + colW;
          doc.lineWidth(0.3).strokeColor("#666")
            .rect(xDer, yRow, colW, rowH).stroke();
          doc.font("Helvetica-Bold").fontSize(fontSize).fillColor("#000")
            .text(der.label, xDer + paddingX, yRow + paddingY, { width: labelWnarrow - paddingX });
          doc.font("Helvetica").fontSize(fontSize)
            .text(String(der.value ?? ""), xDer + labelWnarrow, yRow + paddingY, {
              width: colW - labelWnarrow - paddingX,
            });
        }
        doc.y = yRow + rowH;
      }
    }

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

    // Si el espacio restante no alcanza para las firmas (100pt + label), corte
    // de página. Sin esto, cuando el "Datos de la OT" ocupa mucho vertical,
    // los recuadros de firma se dibujaban fuera de la hoja y aparecían solo
    // los labels "FIRMA" en páginas nuevas.
    const espacioMinFirmas = 100 + 16;
    const yLimite = doc.page.height - doc.page.margins.bottom;
    if (doc.y + espacioMinFirmas > yLimite) {
      doc.addPage();
    }

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

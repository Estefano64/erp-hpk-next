// Helpers para construir formatos físicos HPK con pdfkit.
//
// Convenciones (consistentes con los Excel/Word originales):
//   - Página A4 vertical, márgenes 40pt.
//   - Color de texto y bordes: negro #000.
//   - Tipografía base: Helvetica (incluida por defecto en pdfkit, sin necesidad
//     de cargar TTFs adicionales — evita problemas de empaquetado en Next).
//
// Estos helpers son utilitarios "thin" — el caller decide la composición del
// formato. La cabecera y los recuadros de campo son los dos elementos que se
// repiten entre todos los formatos HPK.

export interface HPKHeaderOptions {
  titulo: string;          // "REPORTE DE MANTENIMIENTO CORRECTIVO"
  codigoFormato: string;   // "HPK-M-F-07"
  version?: string;        // "01"
  revision?: string;       // "01"
  fechaAprobacion?: string; // texto libre (formato Excel original: número serial)
  paginas?: string;        // "Pág. 1 de 1"
}

/**
 * Dibuja la cabecera estándar de un formato HPK en la posición actual.
 *
 * Estructura:
 *   ┌──────────┬────────────────────────────┬─────────────────────────┐
 *   │  [LOGO]  │       <TITULO FORMATO>     │  Código: HPK-X-F-NN     │
 *   │          │                            │  Version: 01 / Rev: 01  │
 *   │          │                            │  Aprobación: ddmmyyyy   │
 *   │          │                            │  Pág 1 de 1             │
 *   └──────────┴────────────────────────────┴─────────────────────────┘
 *
 * El logo es un placeholder textual "HP&K" — sin archivo de imagen para no
 * depender de assets externos. Si en el futuro se desea logo real, agregar
 * un .png/.jpg en /public/logo-hpk.png y reemplazar el placeholder con
 * doc.image().
 *
 * Avanza el cursor doc.y al final de la cabecera + 8pt de respiro.
 */
export function drawHPKHeader(
  doc: PDFKit.PDFDocument,
  opts: HPKHeaderOptions,
): void {
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const logoW = 80;
  const infoW = 180;
  const titleW = totalWidth - logoW - infoW;
  const rowH = 60;

  // Borde exterior
  doc.lineWidth(0.8).strokeColor("#000")
    .rect(startX, startY, totalWidth, rowH).stroke();

  // Divisiones verticales
  doc.moveTo(startX + logoW, startY).lineTo(startX + logoW, startY + rowH).stroke();
  doc.moveTo(startX + logoW + titleW, startY).lineTo(startX + logoW + titleW, startY + rowH).stroke();

  // Logo placeholder
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#000")
    .text("HP&K", startX, startY + (rowH - 16) / 2, {
      width: logoW,
      align: "center",
    });

  // Título (centrado vertical/horizontal en la celda)
  doc.font("Helvetica-Bold").fontSize(11)
    .text(opts.titulo, startX + logoW + 6, startY + rowH / 2 - 8, {
      width: titleW - 12,
      align: "center",
    });

  // Info de versión/código (4 sub-filas)
  const infoX = startX + logoW + titleW;
  const subH = rowH / 4;
  const lineas: Array<[string, string]> = [
    ["Código:", opts.codigoFormato],
    ["Versión / Rev.:", `${opts.version ?? "01"} / ${opts.revision ?? "01"}`],
    ["Aprobación:", opts.fechaAprobacion ?? "—"],
    ["Páginas:", opts.paginas ?? "Pág. 1 de 1"],
  ];
  doc.font("Helvetica").fontSize(8);
  for (let i = 0; i < lineas.length; i++) {
    const [k, v] = lineas[i];
    const yLinea = startY + i * subH;
    if (i > 0) {
      doc.moveTo(infoX, yLinea).lineTo(infoX + infoW, yLinea).strokeColor("#000").lineWidth(0.4).stroke();
    }
    doc.font("Helvetica-Bold").text(k, infoX + 4, yLinea + subH / 2 - 4, { width: 80, align: "left" });
    doc.font("Helvetica").text(v, infoX + 84, yLinea + subH / 2 - 4, { width: infoW - 88, align: "left" });
  }

  doc.y = startY + rowH + 8;
  doc.x = startX;
}

/**
 * Dibuja una fila de campo etiqueta/valor:
 *
 *   ┌──────────────┬───────────────────────────────────────────────┐
 *   │ Label:       │ valor                                         │
 *   └──────────────┴───────────────────────────────────────────────┘
 *
 * width: ancho total. labelWidth: ancho fijo del label.
 * Avanza doc.y al final de la fila.
 */
export function drawLabelValueRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  width: number,
  labelWidth: number = 110,
  rowH: number = 22,
): void {
  const x = doc.page.margins.left;
  const y = doc.y;
  doc.lineWidth(0.6).strokeColor("#000").rect(x, y, width, rowH).stroke();
  doc.moveTo(x + labelWidth, y).lineTo(x + labelWidth, y + rowH).stroke();
  doc.font("Helvetica-Bold").fontSize(9)
    .text(label, x + 4, y + (rowH - 9) / 2, { width: labelWidth - 8, align: "left" });
  doc.font("Helvetica").fontSize(9)
    .text(value || "—", x + labelWidth + 4, y + (rowH - 9) / 2, {
      width: width - labelWidth - 8,
      align: "left",
      ellipsis: true,
    });
  doc.y = y + rowH;
}

/**
 * Dibuja una caja con título arriba y un área grande de texto multilínea
 * abajo. Si `value` se pasa, lo escribe; si no, deja el espacio en blanco
 * (útil para que el formato impreso se llene a mano).
 *
 * Avanza doc.y al final de la caja.
 */
export function drawTextBlock(
  doc: PDFKit.PDFDocument,
  titulo: string,
  value: string | null | undefined,
  width: number,
  height: number,
): void {
  const x = doc.page.margins.left;
  const y = doc.y;
  const titleH = 18;
  // Caja exterior
  doc.lineWidth(0.6).strokeColor("#000").rect(x, y, width, height).stroke();
  // Banda de título
  doc.fillColor("#e6e6e6").rect(x, y, width, titleH).fill();
  doc.strokeColor("#000").rect(x, y, width, titleH).stroke();
  doc.fillColor("#000").font("Helvetica-Bold").fontSize(9)
    .text(titulo, x + 6, y + (titleH - 9) / 2, { width: width - 12, align: "left" });

  // Contenido
  if (value) {
    doc.font("Helvetica").fontSize(9)
      .text(value, x + 6, y + titleH + 4, {
        width: width - 12,
        height: height - titleH - 8,
        ellipsis: true,
      });
  }
  doc.y = y + height;
}

/**
 * Genera el PDF en buffer y lo devuelve. Espera a que `end()` se complete
 * para que el caller pueda devolverlo como respuesta.
 */
export function buildPdfBuffer(
  build: (doc: PDFKit.PDFDocument) => void | Promise<void>,
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      // pdfkit es CJS; lo importamos dinámicamente para evitar issues con SSR.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PDFDocumentCtor = require("pdfkit");
      const doc: PDFKit.PDFDocument = new PDFDocumentCtor({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      await build(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

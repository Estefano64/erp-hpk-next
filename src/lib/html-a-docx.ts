// Convierte un HTML (con imágenes en data URL) a un archivo .docx REAL.
//
// Motivo: hasta ago-2026 el "Descargar Word" de la hoja de evaluación bajaba un
// HTML con extensión .doc. Word lo abre, pero al editarlo y guardar con Ctrl+S
// lo conserva como "Página web" y manda las fotos a una carpeta externa
// `NOMBRE_archivos/`, que nunca se sube al ERP → imágenes rotas en otras PCs.
// Con un .docx real Word guarda por defecto como .docx y embebe las fotos.
//
// Técnica: paquete OOXML mínimo con un `w:altChunk` que apunta a un MHT
// (message/rfc822). El HTML va como parte principal del MHT y cada imagen
// data: URL se extrae a una parte MIME propia (Content-Location). Es lo mismo
// que hace html-docx-js, reimplementado con JSZip para no depender de una lib
// sin mantener. Word desktop 2007+ renderiza el altChunk y al guardar lo
// convierte a contenido nativo con las imágenes embebidas.
//
// Limitación conocida: LibreOffice / Google Docs no renderizan altChunk (ya
// tampoco abrían bien el .doc HTML anterior, así que no hay regresión).

export interface OpcionesDocx {
  /** Orientación de página. Default: portrait. */
  orientation?: "portrait" | "landscape";
  /** Márgenes en cm { top, right, bottom, left }. Default: 2.54 cm. */
  margenesCm?: { top: number; right: number; bottom: number; left: number };
}

const CM_A_TWIPS = 566.929; // 1 cm = 566.93 twips
const A4_W_TWIPS = 11906;
const A4_H_TWIPS = 16838;
const BOUNDARY = "NEXT.ITEM-BOUNDARY";

const twips = (cm: number) => Math.round(cm * CM_A_TWIPS);

// Corta base64 en líneas de 76 chars (RFC 2045).
function wrap76(b64: string): string {
  return b64.replace(/.{76}/g, "$&\r\n");
}

// Extrae las imágenes data: URL del HTML y las reemplaza por Content-Location
// ficticias. Devuelve el HTML modificado y la lista de partes.
function extraerImagenes(html: string): { html: string; partes: { location: string; mime: string; b64: string }[] } {
  const partes: { location: string; mime: string; b64: string }[] = [];
  const cache = new Map<string, string>(); // dataUrl → location (dedup logo, refs)
  const out = html.replace(/src=(["'])data:([^;"']+);base64,([^"']+)\1/gi, (_m, q: string, mime: string, b64: string) => {
    const dataUrl = `${mime};${b64}`;
    let location = cache.get(dataUrl);
    if (!location) {
      const ext = mime.includes("png") ? "png" : mime.includes("gif") ? "gif" : "jpg";
      location = `file:///C:/fake/image${partes.length}.${ext}`;
      partes.push({ location, mime, b64: b64.replace(/\s+/g, "") });
      cache.set(dataUrl, location);
    }
    return `src=${q}${location}${q}`;
  });
  return { html: out, partes };
}

function armarMht(html: string, partes: { location: string; mime: string; b64: string }[]): string {
  const cabecera =
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/related;\r\n` +
    `    type="text/html";\r\n` +
    `    boundary="${BOUNDARY}"\r\n` +
    `X-MimeOLE: Produced By Microsoft MimeOLE V6.00.2900.2869\r\n\r\n`;
  const principal =
    `--${BOUNDARY}\r\n` +
    `Content-Type: text/html;\r\n` +
    `    charset="utf-8"\r\n` +
    `Content-Location: file:///C:/fake/document.html\r\n\r\n` +
    html + `\r\n\r\n`;
  const imgs = partes
    .map(
      (p) =>
        `--${BOUNDARY}\r\n` +
        `Content-Location: ${p.location}\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Type: ${p.mime}\r\n\r\n` +
        wrap76(p.b64) + `\r\n\r\n`,
    )
    .join("");
  return cabecera + principal + imgs + `--${BOUNDARY}--`;
}

function documentXml(opts: OpcionesDocx): string {
  const landscape = opts.orientation === "landscape";
  const w = landscape ? A4_H_TWIPS : A4_W_TWIPS;
  const h = landscape ? A4_W_TWIPS : A4_H_TWIPS;
  const m = opts.margenesCm ?? { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 };
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body><w:altChunk r:id="htmlChunk"/>` +
    `<w:sectPr>` +
    `<w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ""}/>` +
    `<w:pgMar w:top="${twips(m.top)}" w:right="${twips(m.right)}" w:bottom="${twips(m.bottom)}" w:left="${twips(m.left)}" w:header="720" w:footer="720" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="mht" ContentType="message/rfc822"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.mht"/>` +
  `</Relationships>`;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Genera el .docx como Blob (lado cliente). */
export async function htmlADocx(html: string, opts: OpcionesDocx = {}): Promise<Blob> {
  const { html: htmlSinData, partes } = extraerImagenes(html);
  // Import dinámico: JSZip (~100 KB) solo se carga al generar el documento.
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", documentXml(opts));
  zip.file("word/_rels/document.xml.rels", DOC_RELS);
  zip.file("word/afchunk.mht", armarMht(htmlSinData, partes));
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });
}

// Utilidades para validar uploads de archivos en endpoints API.

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export interface ValidacionUpload {
  ok: boolean;
  error?: string;
}

const TYPE_DOCUMENTOS = {
  ext: new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"]),
  mime: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
  ]),
};

const TYPE_INFORMES = {
  ext: new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]),
  mime: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
};

// Solo imágenes (fotos de evaluación técnica). El cliente comprime la imagen
// a ~300px de alto antes de subir, así que el JPEG resultante es pequeño
// (<300KB típico); aún así dejamos 15MB de cap por si suben una foto original.
const TYPE_IMAGENES = {
  ext: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  mime: new Set(["image/png", "image/jpeg", "image/webp"]),
};

export type CategoriaUpload = "documentos" | "informes" | "imagenes";

export function validarArchivo(
  file: File,
  categoria: CategoriaUpload,
  maxSize = MAX_FILE_SIZE,
): ValidacionUpload {
  if (!file) return { ok: false, error: "No se envió ningún archivo" };
  if (file.size === 0) return { ok: false, error: "El archivo está vacío" };
  if (file.size > maxSize) {
    return { ok: false, error: `El archivo excede ${Math.round(maxSize / 1024 / 1024)} MB` };
  }
  const allowed =
    categoria === "informes" ? TYPE_INFORMES
    : categoria === "imagenes" ? TYPE_IMAGENES
    : TYPE_DOCUMENTOS;
  const lowerName = (file.name || "").toLowerCase();
  const dot = lowerName.lastIndexOf(".");
  const ext = dot >= 0 ? lowerName.slice(dot) : "";
  if (!allowed.ext.has(ext)) {
    const opts = [...allowed.ext].join(", ");
    return { ok: false, error: `Extensión no permitida. Se acepta: ${opts}` };
  }
  // El navegador puede no incluir type; lo aceptamos solo si la extensión cuadra.
  if (file.type && !allowed.mime.has(file.type)) {
    return { ok: false, error: `Tipo MIME ${file.type} no permitido para esta extensión` };
  }
  return { ok: true };
}

// Sanitiza un nombre de archivo para uso como filename en disco. No depende de path.extname
// para evitar sorpresas con nombres raros.
export function sanitizarNombreArchivo(nombre: string, fallback = "archivo"): string {
  const limpio = (nombre || fallback)
    .replace(/[\/\\:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\.+$/g, "")
    .trim();
  return limpio.length > 0 ? limpio : fallback;
}

// ── Detección de formato real por bytes mágicos ────────────────────────────
// Motivo: los técnicos abren el Word que genera el ERP (HTML con extensión
// .doc), lo editan en Word de escritorio y guardan con Ctrl+S. Word lo vuelve
// a guardar como "Página web": el texto queda en el .doc y las fotos se van a
// una carpeta externa `NOMBRE_archivos/` que NUNCA se sube. En cualquier otra
// PC las imágenes salen como "No se puede mostrar la imagen vinculada".
// Detectamos ese caso mirando los primeros bytes: un .doc/.docx/.xls/.xlsx
// legítimo es OLE (D0 CF 11 E0) o ZIP (50 4B); un PDF empieza con %PDF.
export type FormatoArchivo = "ole" | "zip" | "pdf" | "html" | "desconocido";

export function detectarFormatoArchivo(bytes: Uint8Array): FormatoArchivo {
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "zip";
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // HTML: texto plano (UTF-8 con/sin BOM) o UTF-16 LE con BOM (así lo guarda Word).
  let texto = "";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const chars: number[] = [];
    for (let i = 2; i + 1 < bytes.length && chars.length < 512; i += 2) chars.push(bytes[i] | (bytes[i + 1] << 8));
    texto = String.fromCharCode(...chars);
  } else {
    texto = String.fromCharCode(...Array.from(bytes.slice(0, 512)));
  }
  if (/<(!doctype|html|\?xml)[\s>]/i.test(texto)) return "html";
  return "desconocido";
}

export const MSG_INFORME_HTML =
  "Este Word tiene las fotos en una carpeta externa (Word lo guardó como \"Página web\"), " +
  "por eso en otras PCs salen como \"no se puede mostrar la imagen\". " +
  "Ábrelo en Word y usa Archivo → Guardar como → PDF (o Documento de Word .docx) y sube ese archivo.";

// Valida que el contenido (primeros bytes) coincida con la extensión declarada.
// Solo para la categoría "informes" (informe técnico de evaluación).
export function validarContenidoInforme(fileName: string, cabecera: Uint8Array): ValidacionUpload {
  const lower = (fileName || "").toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  const fmt = detectarFormatoArchivo(cabecera);
  if (ext === ".pdf") {
    return fmt === "pdf" ? { ok: true } : { ok: false, error: "El archivo no es un PDF válido." };
  }
  if (ext === ".doc" || ext === ".xls") {
    if (fmt === "ole" || fmt === "zip") return { ok: true };
    if (fmt === "html") return { ok: false, error: MSG_INFORME_HTML };
    return { ok: false, error: `El archivo ${ext} no es un documento de Office válido.` };
  }
  if (ext === ".docx" || ext === ".xlsx") {
    if (fmt === "zip") return { ok: true };
    if (fmt === "html") return { ok: false, error: MSG_INFORME_HTML };
    return { ok: false, error: `El archivo ${ext} no es un documento de Office válido.` };
  }
  return { ok: true };
}

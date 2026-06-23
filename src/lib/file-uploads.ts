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

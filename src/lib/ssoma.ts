// Constantes y formatos compartidos del módulo SSOMA - SIG.
// Client-safe: lo importan tanto las páginas como los route handlers.
// Los correlativos (server-only, Prisma) viven en src/lib/ssoma-numero.ts.

// ── Estados ──────────────────────────────────────────────────────
// Reporte de Seguridad (HPK-S-F-03): ABIERTO → APROBADO → CERRADO.
export const RS_ESTADOS: Record<string, { label: string; color: string }> = {
  ABIERTO: { label: "Abierto", color: "orange" },
  APROBADO: { label: "Aprobado", color: "blue" },
  CERRADO: { label: "Cerrado", color: "green" },
};

// Salida No Conforme (HPK-SIG-F-05): ABIERTO → CERRADO.
export const SNC_ESTADOS: Record<string, { label: string; color: string }> = {
  ABIERTO: { label: "Abierto", color: "orange" },
  CERRADO: { label: "Cerrado", color: "green" },
};

// SAC (SIG-G-F-10): ABIERTA → CERRADA.
export const SAC_ESTADOS: Record<string, { label: string; color: string }> = {
  ABIERTA: { label: "Abierta", color: "orange" },
  CERRADA: { label: "Cerrada", color: "green" },
};

// ── Opciones de los formatos ─────────────────────────────────────
export const RS_TIPOS = [
  { value: "ACTO_INSEGURO", label: "Acto inseguro" },
  { value: "CONDICION_INSEGURA", label: "Condición insegura" },
] as const;

// "Daños potenciales" del HPK-S-F-03 (multi-check).
export const RS_DANOS_POTENCIALES = [
  { value: "PERSONAL", label: "Personal" },
  { value: "EQUIPOS_MATERIALES_AMBIENTALES", label: "Equipos, materiales o ambientales" },
  { value: "VEHICULARES", label: "Vehiculares" },
] as const;

export const SAC_TIPOS_DESVIACION = [
  { value: "NC_REAL", label: "No Conformidad Real" },
  { value: "NC_POTENCIAL", label: "No Conformidad Potencial" },
  { value: "SERVICIO_NO_CONFORME", label: "Servicio No Conforme" },
  { value: "SUGERENCIAS", label: "Sugerencias" },
  { value: "QUEJAS", label: "Quejas" },
] as const;

export const SAC_FUENTES = [
  { value: "AUDITORIA_INTERNA", label: "Auditoría Interna" },
  { value: "AUDITORIA_EXTERNA", label: "Auditoría Externa" },
  { value: "REVISION_DIRECCION", label: "Revisión por la Dirección" },
  { value: "INSPECCION", label: "Inspección" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "REPORTE_INCIDENTES", label: "Reporte de Incidentes" },
  { value: "OTROS", label: "Otros" },
] as const;

export const SAC_SISTEMAS = [
  { value: "CALIDAD", label: "Calidad" },
  { value: "MEDIO_AMBIENTE", label: "Medio Ambiente" },
  { value: "SEGURIDAD", label: "Seguridad" },
] as const;

// Helper para pintar el label de una opción a partir del value guardado.
export function labelDe(
  opciones: readonly { value: string; label: string }[],
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  return opciones.find((o) => o.value === value)?.label ?? value;
}

// ── Códigos visibles ─────────────────────────────────────────────
// Mismo esquema que RC-NNNN-YY del reporte correctivo: numero = correlativo
// crudo per-año, anio = 2 dígitos.
function formatCodigo(
  prefijo: string,
  numero: number | null | undefined,
  anio: number | null | undefined,
  fallback: string,
): string {
  if (numero == null || anio == null) return fallback;
  return `${prefijo}-${String(numero).padStart(4, "0")}-${String(anio).padStart(2, "0")}`;
}

export function formatReporteSeguridadCodigo(
  numero: number | null | undefined,
  anio: number | null | undefined,
  fallback = "—",
): string {
  return formatCodigo("RS", numero, anio, fallback);
}

export function formatSalidaNoConformeCodigo(
  numero: number | null | undefined,
  anio: number | null | undefined,
  fallback = "—",
): string {
  return formatCodigo("SNC", numero, anio, fallback);
}

export function formatSacCodigo(
  numero: number | null | undefined,
  anio: number | null | undefined,
  fallback = "—",
): string {
  return formatCodigo("SAC", numero, anio, fallback);
}

// Parsea "RS-0012-26" / "SNC-12-26" / "SAC001226" tipeado en un buscador.
// Devuelve { numero, anio } o null si no matchea el patrón del prefijo dado.
export function parseSsomaCodigoSearch(
  prefijo: "RS" | "SNC" | "SAC",
  search: string,
): { numero: number; anio: number } | null {
  const m = search.trim().match(new RegExp(`^${prefijo}-?(\\d+)-?(\\d{2})$`, "i"));
  if (!m) return null;
  return { numero: Number(m[1]), anio: Number(m[2]) };
}

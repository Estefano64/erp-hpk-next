// Helpers para parsear fechas que vienen del cliente como "YYYY-MM-DD".
// Sin esto, `new Date("2026-05-12")` se interpreta como UTC y en zonas
// horarias al oeste de UTC (ej. Lima UTC-5) la fecha resultante guarda
// el día anterior cuando se mira en hora local.

/**
 * Parsea un string. Si tiene formato YYYY-MM-DD (sin hora), lo interpreta
 * como medianoche local — no UTC — para que el día no se corra.
 * Para strings ISO completos con hora/zona, se delega al constructor estándar.
 */
export function parseDateOnly(s: string | Date | null | undefined): Date | null {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // Local midnight: evita el shift de UTC.
    return new Date(s + "T00:00:00");
  }
  return new Date(s);
}

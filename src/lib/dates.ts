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

/**
 * Formatea una fecha "solo día" como DD/MM/YYYY sin que se desplace por zona horaria.
 * Acepta strings ISO ("2026-05-13T00:00:00.000Z"), "YYYY-MM-DD" o Date.
 * Toma solo la parte de fecha (los primeros 10 caracteres del ISO) para evitar conversiones.
 */
export function formatDateOnly(v: string | Date | null | undefined): string {
  if (!v) return "-";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Fecha "solo día" para COMPARAR sin corrimiento de zona horaria: toma la parte
 * de fecha (YYYY-MM-DD) del valor y la devuelve como medianoche LOCAL.
 *
 * Por qué: estas columnas se guardan como medianoche UTC ("...T00:00:00.000Z").
 * Miradas desde Lima (UTC-5) con `dayjs(v)` caen a las 19:00 del DÍA ANTERIOR,
 * y una OT que vence HOY aparecía "vencida hace 1 día".
 */
export function dateOnlyLocal(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) {
    // Un Date de estas columnas viene de medianoche UTC: las partes UTC
    // conservan el día original (las locales ya estarían corridas).
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Igual que formatDateOnly pero con año de 2 dígitos (DD/MM/YY). */
export function formatDateOnlyShort(v: string | Date | null | undefined): string {
  const full = formatDateOnly(v);
  if (full === "-" || full.length < 10) return full;
  return full.slice(0, 6) + full.slice(8); // "DD/MM/YYYY" → "DD/MM/YY"
}

/**
 * Fecha "hoy" en America/Lima como Date apuntando a mediodía UTC.
 *
 * Por qué: Railway corre en UTC. `new Date()` a las 20:00 hora Lima devuelve
 * `2026-07-11T01:00Z`. Cuando Prisma lo guarda en un `@db.Date`, Postgres
 * extrae la parte de fecha en UTC y almacena `2026-07-11` — el DÍA SIGUIENTE
 * al real en Lima. Esto se veía en el PDF de OC con la Fecha Emisión errónea.
 *
 * La solución: obtener el YYYY-MM-DD de Lima con Intl y construir un Date
 * apuntando al mediodía UTC de ese día (12:00 UTC = 07:00 Lima), de modo que
 * NO importa la timezone del proceso, siempre cae dentro del día correcto al
 * guardarse como `@db.Date`.
 */
export function hoyEnLima(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = partes.find((p) => p.type === "year")?.value ?? "1970";
  const m = partes.find((p) => p.type === "month")?.value ?? "01";
  const d = partes.find((p) => p.type === "day")?.value ?? "01";
  // Mediodía UTC de ese día → cae dentro del día correcto en cualquier TZ
  // razonable (America/Lima UTC-5, Europa UTC+1..+3, etc.).
  return new Date(`${y}-${m}-${d}T12:00:00.000Z`);
}

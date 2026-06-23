// Formato de visualización del número de OT según su tipo.
//
// El número en BD es un entero (Int) en formato NNNNYY (correlativo + año).
// El "código mostrado" depende del tipo:
//   - REP (Reparación):    raw number              ej: 390126
//   - BIE (Bien):          "V" + corr(4) + yy(2)   ej: ot=124   → "V000124"
//                                                  ej: ot=2126  → "V002126"
//   - SER (Servicio):      "S" + corr(4) + yy(2)   ej: ot=126   → "S000126"
//   - INT (Interna):       "OI" + corr(4) + yy(2)  ej: ot=126   → "OI000126"
//                          (la OT interna no tiene tipo_codigo en BD —
//                          se invoca con tipo `"INT"` explícito).
//
// El padding fijo a 4 dígitos en BIE/SER/INT deja códigos uniformes
// (V000124, V000999, V001000). El correlativo puede ir > 9999: en ese caso
// simplemente no se pad-ea (V1000026 si el correlativo es 10000 en el año
// 26 — improbable pero soportado sin error).

const PREFIJO_POR_TIPO: Record<string, string> = {
  BIE: "V",
  SER: "S",
  INT: "OI",
};

export function formatOtCodigo(
  ot: number | string | null | undefined,
  tipoCodigo: string | null | undefined,
  fallback: string = "—",
): string {
  if (ot == null || ot === "") return fallback;
  const prefijo = tipoCodigo ? (PREFIJO_POR_TIPO[tipoCodigo] ?? "") : "";

  // REP (y cualquier otro tipo sin prefijo): mostrar el número raw.
  if (!prefijo) return String(ot);

  // BIE / SER / INT: descomponer en correlativo + año y pad-ear a 4+2.
  const otNum = Number(ot);
  if (!Number.isFinite(otNum)) return `${prefijo}${ot}`;
  const yy = otNum % 100;
  const corr = Math.floor(otNum / 100);
  return `${prefijo}${corr.toString().padStart(4, "0")}${yy.toString().padStart(2, "0")}`;
}

// Helper específico para OT interna — no tiene tipo_codigo en BD.
export function formatOtInternaCodigo(
  ot: number | string | null | undefined,
  fallback: string = "—",
): string {
  return formatOtCodigo(ot, "INT", fallback);
}

// Formato visual del reporte correctivo: RC-NNNN-YY.
// numero = correlativo raw (1..9999), anio = 2 dígitos.
export function formatReporteCorrectivoCodigo(
  numero: number | null | undefined,
  anio: number | null | undefined,
  fallback: string = "—",
): string {
  if (numero == null || anio == null) return fallback;
  return `RC-${String(numero).padStart(4, "0")}-${String(anio).padStart(2, "0")}`;
}

// Para callers que reciben tipo como nombre ("Bien", "Servicio") en vez de
// código. Útil cuando la fuente está desnormalizada. Mapea al código y
// delega en formatOtCodigo para mantener una sola fuente de verdad del
// formato visual.
const NOMBRE_A_CODIGO: Record<string, string> = {
  "Bien": "BIE",
  "Servicio": "SER",
  "Reparación": "REP",
  "Interna": "INT",
};

export function formatOtCodigoPorNombre(
  ot: number | string | null | undefined,
  tipoNombre: string | null | undefined,
  fallback: string = "—",
): string {
  const codigo = tipoNombre ? (NOMBRE_A_CODIGO[tipoNombre] ?? null) : null;
  return formatOtCodigo(ot, codigo, fallback);
}

// Postgres INT4 (signed): rango [-2^31, 2^31-1]. Cualquier número fuera de
// este rango rompe Prisma con `ConversionError("Unable to fit integer value
// '...' into an INT4")` y tumba la query entera (incluido el .count()).
//
// Las columnas `ot` (correlativo NNNNYY) y los `id` autogenerados de OTs,
// reqs, compras, etc. son INT4. Validar el input ANTES de pasarlo a Prisma
// es la única defensa — `Number.isFinite` no detecta overflow porque
// 316725316725 ES finito.
export const INT4_MAX = 2_147_483_647;
export const INT4_MIN = -2_147_483_648;

// Parsea un string a número entero seguro para columnas INT4. Devuelve null
// si el string es vacío, no es un entero (decimales, letras, signos extra),
// o queda fuera del rango INT4. Defensa central contra inputs maliciosos o
// pegados accidentalmente que tumban queries de Prisma.
export function parseInt4Safe(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || !/^-?\d+$/.test(t)) return null;
  // Number() de un string de solo dígitos no produce NaN — el regex ya
  // garantiza que es parseable. Solo nos falta validar rango y entero.
  const n = Number(t);
  if (!Number.isInteger(n) || n < INT4_MIN || n > INT4_MAX) return null;
  return n;
}

// Inverso de formatOtCodigo: parsea un código que el usuario tipea/copia y
// devuelve el número raw (NNNNYY) que matchea contra la columna `ot` en BD.
//
// Acepta:
//   "390126"   → 390126 (raw — REP)
//   "V000126"  → 126    (correlativo 1, año 26)
//   "S012626"  → 12626  (correlativo 126, año 26)
//   "OI000126" → 126    (interna — OI usa el mismo schema)
//   "v126"     → 126    (case-insensitive, padding opcional)
//
// Devuelve null si no matchea ningún patrón conocido (el caller debería caer
// a buscar por otros campos en ese caso) O si el número resultante excede
// INT4 — esto evita el bug que tumba el listado de OTs cuando alguien pega
// un código gigante como "316725316725" en la barra de búsqueda.
export function parseOtCodigoSearch(search: string): number | null {
  const s = search.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt4Safe(s);
  const m = s.match(/^(V|S|OI)0*(\d+)$/i);
  if (!m) return null;
  const resto = m[2];
  // Necesitamos al menos 2 dígitos para inferir el año. Si tiene 1 sólo,
  // asumimos correlativo 0 + ese dígito como año (improbable pero defensivo).
  if (resto.length < 2) return parseInt4Safe(resto);
  const yy = Number(resto.slice(-2));
  const corr = Number(resto.slice(0, -2) || "0");
  const result = corr * 100 + yy;
  return result > INT4_MAX || result < INT4_MIN ? null : result;
}

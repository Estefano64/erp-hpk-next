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
// a buscar por otros campos en ese caso).
//
// La columna `ot` es INTEGER (INT4) en BD. Cualquier valor fuera de rango no
// puede matchear y, peor, hace fallar la query de Prisma con un overflow
// ("Unable to fit integer value ... into an INT4"). Por eso devolvemos null
// para valores fuera de rango: el caller cae a buscar por otros campos.
const INT4_MAX = 2147483647;
const inInt4 = (n: number): number | null =>
  Number.isFinite(n) && n >= 0 && n <= INT4_MAX ? n : null;

export function parseOtCodigoSearch(search: string): number | null {
  const s = search.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return inInt4(Number(s));
  const m = s.match(/^(V|S|OI)0*(\d+)$/i);
  if (!m) return null;
  const resto = m[2];
  // Necesitamos al menos 2 dígitos para inferir el año. Si tiene 1 sólo,
  // asumimos correlativo 0 + ese dígito como año (improbable pero defensivo).
  if (resto.length < 2) return inInt4(Number(resto));
  const yy = Number(resto.slice(-2));
  const corr = Number(resto.slice(0, -2) || "0");
  return inInt4(corr * 100 + yy);
}

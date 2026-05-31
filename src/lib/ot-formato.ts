// Formato de visualización del número de OT externa según su tipo.
//
// El número en BD es un entero (Int) en formato NNNNYY (correlativo + año).
// El "código mostrado" depende del tipo:
//   - REP (Reparación):    raw number              ej: 390126
//   - BIE (Bien):          "V" + corr(4) + yy(2)   ej: ot=124   → "V000124"
//                                                  ej: ot=2126  → "V002126"
//   - SER (Servicio):      "S" + corr(4) + yy(2)   ej: ot=126   → "S000126"
//
// El padding fijo a 4 dígitos en BIE/SER deja códigos uniformes (V000124,
// V000999, V001000) y matchea el formato histórico del Excel de Ventas.
// El correlativo puede ir > 9999: en ese caso simplemente no se pad-ea
// (V1000026 si el correlativo es 10000 en el año 26 — improbable pero
// soportado sin error).

const PREFIJO_POR_TIPO: Record<string, string> = {
  BIE: "V",
  SER: "S",
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

  // BIE / SER: descomponer en correlativo + año y pad-ear a 4+2.
  const otNum = Number(ot);
  if (!Number.isFinite(otNum)) return `${prefijo}${ot}`;
  const yy = otNum % 100;
  const corr = Math.floor(otNum / 100);
  return `${prefijo}${corr.toString().padStart(4, "0")}${yy.toString().padStart(2, "0")}`;
}

// Para callers que reciben tipo como nombre ("Bien", "Servicio") en vez de
// código. Útil cuando la fuente está desnormalizada. Mapea al código y
// delega en formatOtCodigo para mantener una sola fuente de verdad del
// formato visual.
const NOMBRE_A_CODIGO: Record<string, string> = {
  "Bien": "BIE",
  "Servicio": "SER",
  "Reparación": "REP",
};

export function formatOtCodigoPorNombre(
  ot: number | string | null | undefined,
  tipoNombre: string | null | undefined,
  fallback: string = "—",
): string {
  const codigo = tipoNombre ? (NOMBRE_A_CODIGO[tipoNombre] ?? null) : null;
  return formatOtCodigo(ot, codigo, fallback);
}

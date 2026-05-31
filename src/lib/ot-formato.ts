// Formato de visualización del número de OT externa según su tipo.
//
// El número en BD es un entero (Int). El "código mostrado" antepone:
//   - "V" para tipo Bien     (tipo_codigo === "BIE")
//   - "S" para tipo Servicio (tipo_codigo === "SER")
//   - sin prefijo para tipo Reparación / cualquier otro
//
// El prefijo es SOLO visual: la BD no cambia, los URLs siguen usando el id
// interno y los filtros server-side siguen comparando contra el número raw.

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
  return `${prefijo}${ot}`;
}

// Para callers que reciben tipo como nombre ("Bien", "Servicio") en vez de
// código. Útil cuando la fuente está desnormalizada.
const PREFIJO_POR_NOMBRE: Record<string, string> = {
  "Bien": "V",
  "Servicio": "S",
};

export function formatOtCodigoPorNombre(
  ot: number | string | null | undefined,
  tipoNombre: string | null | undefined,
  fallback: string = "—",
): string {
  if (ot == null || ot === "") return fallback;
  const prefijo = tipoNombre ? (PREFIJO_POR_NOMBRE[tipoNombre] ?? "") : "";
  return `${prefijo}${ot}`;
}

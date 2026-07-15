// Topes de aprobación por monto — esquema de gerencia (C. Viña, 2026-07-08):
//
//   Órdenes de compra ($):
//     0 – 1,000      el mismo que elabora la OC (y cualquier nivel superior)
//     1,000 – 2,500  rol `aprobador_oc_2500` (Miriam)
//     2,500 – 5,000  rol `aprobador_oc_5000` (Juan Diego)
//     > 5,000        rol `gerencia` (Carlos, Pio)
//
//   Requerimientos:
//     hasta 5,000 (o sin precios cargados)  rol `aprobador_requerimiento` (Diego)
//     > 5,000                                rol `gerencia`
//
// Notas de diseño:
//   - `gerencia` es un rol propio y NO se deriva de `admin` a propósito:
//     Diego Muñoz es admin pero su tope es 5,000 — un bypass por admin lo
//     dejaría sin tope. Gerencia aprueba cualquier monto.
//   - Montos en USD. Soles se convierten con factor fijo 3.5 (S/ 17,500 =
//     US$ 5,000, tope confirmado por el usuario; los demás escalan igual:
//     S/ 3,500 y S/ 8,750).
//   - Requerimientos sin precio (aún no cotizados) cuentan como monto 0:
//     los aprueba Diego, como indica el esquema ("Requerimiento, todo Diego").

const FACTOR_PEN = 3.5;

export function montoEnUSD(monto: number, moneda?: string | null): number {
  const m = (moneda ?? "USD").toUpperCase().trim();
  if (m === "PEN" || m === "SOL" || m === "SOLES" || m === "S/" || m === "S/.") {
    return monto / FACTOR_PEN;
  }
  return monto;
}

export type ResultadoAprobacion = { ok: true } | { ok: false; error: string };

const fmt = (n: number) =>
  `US$ ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// ¿Puede este usuario aceptar una OC de este monto?
// `esElaborador` = la OC la creó él (compra.usuario_solicita).
export function puedeAprobarOC(
  roles: string[] | null | undefined,
  montoUSD: number,
  esElaborador: boolean,
): ResultadoAprobacion {
  const r = roles ?? [];
  if (r.includes("gerencia")) return { ok: true };
  if (montoUSD <= 5000 && r.includes("aprobador_oc_5000")) return { ok: true };
  if (montoUSD <= 2500 && r.includes("aprobador_oc_2500")) return { ok: true };
  if (montoUSD <= 1000 && esElaborador) return { ok: true };

  if (montoUSD > 5000) {
    return { ok: false, error: `Esta OC (${fmt(montoUSD)}) supera los ${fmt(5000)}: solo la puede aprobar gerencia.` };
  }
  if (montoUSD > 2500) {
    return { ok: false, error: `Esta OC (${fmt(montoUSD)}) requiere aprobador de hasta ${fmt(5000)} o gerencia.` };
  }
  if (montoUSD > 1000) {
    return { ok: false, error: `Esta OC (${fmt(montoUSD)}) requiere aprobador de hasta ${fmt(2500)}, ${fmt(5000)} o gerencia.` };
  }
  return { ok: false, error: `Una OC de hasta ${fmt(1000)} la aprueba quien la elaboró, un aprobador designado o gerencia.` };
}

// ¿Puede este usuario aprobar un requerimiento de este monto total?
export function puedeAprobarReq(
  roles: string[] | null | undefined,
  montoUSD: number,
): ResultadoAprobacion {
  const r = roles ?? [];
  if (r.includes("gerencia")) return { ok: true };
  if (montoUSD <= 5000 && r.includes("aprobador_requerimiento")) return { ok: true };
  if (montoUSD > 5000) {
    return { ok: false, error: `Este requerimiento (${fmt(montoUSD)}) supera los ${fmt(5000)}: solo lo puede aprobar gerencia.` };
  }
  return { ok: false, error: "Los requerimientos los aprueba el aprobador designado o gerencia." };
}

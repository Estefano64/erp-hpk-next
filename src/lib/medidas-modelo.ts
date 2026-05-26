// Helper para resolver medidas modelo (referencia visual) en la hoja de
// evaluación. Busca el cilindro por NP, descripción+marca+modelo, o fallback.

import { MEDIDAS_MODELO, type MedidaModelo } from "./medidas-modelo-data";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/**
 * Busca la fila de medidas modelo aplicable a una OT.
 * Estrategia:
 *  1) Match exacto por NP1 o NP2 (más confiable).
 *  2) Match por descripcion + marca + modelo (cuando hay datos).
 *  3) null si no hay match.
 */
export function findMedidasModelo(args: {
  np?: string | null;
  descripcion?: string | null;
  marca?: string | null;
  modelo?: string | null;
}): MedidaModelo | null {
  const np = norm(args.np);
  if (np) {
    const exacto = MEDIDAS_MODELO.find(
      (m) => norm(m.np1) === np || norm(m.np2) === np,
    );
    if (exacto) return exacto;
  }
  const desc = norm(args.descripcion);
  const marca = norm(args.marca);
  const modelo = norm(args.modelo);
  if (desc && marca && modelo) {
    const byTrio = MEDIDAS_MODELO.find(
      (m) =>
        norm(m.descripcion) === desc &&
        norm(m.marca) === marca &&
        norm(m.modelo) === modelo,
    );
    if (byTrio) return byTrio;
  }
  if (desc && modelo) {
    const byDuo = MEDIDAS_MODELO.find(
      (m) => norm(m.descripcion) === desc && norm(m.modelo) === modelo,
    );
    if (byDuo) return byDuo;
  }
  return null;
}

/**
 * Formatea un valor modelo para mostrar al lado de un input.
 * Devuelve "—" si no hay valor.
 */
export function formatModelo(v: number | null | undefined, unidad: string = "mm"): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  // Si la unidad ya tiene decimales pequeños, no abusar
  const fixed = v >= 100 ? v.toFixed(2) : v.toFixed(3);
  return `${fixed} ${unidad}`;
}

/**
 * Dado el `name` de un campo del formulario y la medida modelo aplicable,
 * devuelve el valor modelo (en la unidad de la medida) o null si no aplica.
 *
 * Los `name` siguen el patrón `t{N}_{componente}_{campo}` o
 * `t{N}_etapa{M}_{campo}` (telescópico). Strip el prefijo `t{N}_` y matchea
 * por sufijo. Como las medidas modelo cubren un único cilindro, los 4 puntos
 * A1-A4 X/Y de Diámetro Interior comparten todos el mismo modelo
 * (el técnico ve la misma referencia para los 8 inputs).
 */
export function modeloForField(
  fieldName: string,
  medida: MedidaModelo | null,
): number | null {
  if (!medida || !fieldName) return null;
  // Strip prefijo tN_
  const rest = fieldName.replace(/^t\d+_/, "");

  // ── CILINDRO (botella / camisa fija) ──
  if (/^cil_a[1-4]_[xy]$/.test(rest)) return medida.cilindro.diamInterior;
  if (/^cil_dsal_[xy]$/.test(rest)) return medida.cilindro.diamSalida;
  if (/^cil_dext_[xy]$/.test(rest)) return medida.cilindro.diamExterior;
  if (rest === "cil_lbru") return medida.cilindro.longBrunido;
  if (rest === "cil_ltot") return medida.cilindro.longTotal;
  if (/^cil_dojo_f_[xy]$/.test(rest)) return medida.cilindro.diamOjo;
  if (/^cil_dint_g_[xy]$/.test(rest)) return medida.cilindro.diamIntCojinete;
  if (/^cil_ancho_ojo_[xy]$/.test(rest)) return medida.cilindro.anchoOjo;

  // ── VÁSTAGO ──
  if (/^vas_dvas_[bcd]_[xy]$/.test(rest)) return medida.vastago.diamVastago;
  if (/^vas_dext_[xy]$/.test(rest)) return medida.vastago.diamVastago;
  if (/^vas_dsell_[xy]$/.test(rest)) return medida.vastago.diamVastago;
  if (/^vas_dcoj_[xy]$/.test(rest)) return medida.vastago.diamIntCojinete;
  if (rest === "vas_lcro") return medida.vastago.longCromo;
  if (rest === "vas_ltot") return medida.vastago.longTotal;
  if (/^vas_desp_[xy]$/.test(rest)) return medida.vastago.diamEspiga;
  if (rest === "vas_long_espiga_g") return medida.vastago.longEspiga;
  if (/^vas_dext_ojo_h_[xy]$/.test(rest)) return medida.vastago.diamExtOjo;
  if (/^vas_dint_ojo_i_[xy]$/.test(rest)) return medida.vastago.diamIntOjo;
  if (/^vas_dint_j_[xy]$/.test(rest)) return medida.vastago.diamIntCojinete;
  if (/^vas_ancho_ojo_[xy]$/.test(rest)) return medida.vastago.anchoOjo;

  // ── TAPA ──
  if (rest === "tapa_dext") return medida.tapa.exterior;
  if (rest === "tapa_dint") return medida.tapa.interior;
  if (rest === "tapa_dsell") return medida.tapa.sellado;
  if (rest === "tapa_ltot") return medida.tapa.longTotal;
  if (rest === "tapa_sec_a") return medida.tapa.exterior;
  if (rest === "tapa_sec_b") return medida.tapa.interior;
  if (rest === "tapa_sec_c") return medida.tapa.sellado;
  if (rest === "tapa_sec_d") return medida.tapa.longTotal;

  // ── PISTÓN / ÉMBOLO ──
  if (rest === "pis_dext" || rest === "emb_dext") return medida.piston.exterior;
  if (rest === "pis_dint" || rest === "emb_dint") return medida.piston.interior;
  if (rest === "pis_ltot" || rest === "emb_ltot") return medida.piston.longitud;

  // ── CUERPO INTERMEDIO (telescópico, etapas) ──
  if (/^etapa\d+_cuerpo_dint_\d_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamIntC1;
  if (/^etapa\d+_cuerpo_dext_\d_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamExtC1;
  if (/^etapa\d+_cuerpo_dint_c1_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamIntC1;
  if (/^etapa\d+_cuerpo_dint_c2_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamIntC2;
  if (/^etapa\d+_cuerpo_dext_c1_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamExtC1;
  if (/^etapa\d+_cuerpo_dext_c2_[xy]$/.test(rest)) return medida.cuerpoIntermedio.diamExtC2;
  if (/^etapa\d+_lcro$/.test(rest)) return medida.cuerpoIntermedio.longCromo;
  if (/^etapa\d+_lbru$/.test(rest)) return medida.cuerpoIntermedio.longBrunido;

  return null;
}

export type { MedidaModelo } from "./medidas-modelo-data";

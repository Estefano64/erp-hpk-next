// Helper para detectar el tipo de cilindro (CHVS/CHP/CHT/CHPDV/AE/AV/RD/FS/SD)
// a partir del CodigoReparacion (descripción, NP, flota, posición).
// Se usa como fallback cuando `modelo_evaluacion_codigo` no está asignado en la BD.

import { CATALOGO_COD_REP, TIPOS_CILINDRO } from "./cod-rep-tipos-data";

// Equivalencia entre los códigos del catálogo Excel y los códigos que
// usa el formulario de evaluación (EvaluacionFormulario.MODELOS_EVALUACION).
export const COD_REP_TIPO_A_MODELO_EVAL: Record<string, string> = {
  CHVS: "cil_vastago_simple",
  CHP: "cil_pivotado",
  CHPDV: "cil_doble_vastago",
  CHT: "cil_telescopico",
  AE: "acum_embolo",
  AV: "acum_vejiga",
  RD: "rueda_delantera",
  SD: "suspension_delantera",
  // FS (Freno de servicio) no tiene modelo de evaluación equivalente todavía.
};

/** Nombre amigable del tipo (CHVS → "Cilindro hidráulico vástago simple"). */
export function nombreTipoCilindro(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return TIPOS_CILINDRO[codigo] ?? codigo;
}

/** ¿Ese tipo del código reparable tiene un modelo de evaluación equivalente? */
export function tipoTienePlantilla(codigo: string | null | undefined): boolean {
  return !!codigo && !!COD_REP_TIPO_A_MODELO_EVAL[codigo];
}

export interface DeteccionTipo {
  /** Código del tipo detectado (ej. "CHVS"). null si no se pudo deducir. */
  codigo: string | null;
  /** Nombre amigable (ej. "Cilindro hidráulico vástago simple"). */
  nombre: string | null;
  /** Cómo se detectó. "np": match por número de parte. "descripcion": coincide la descripción. "descripcion+flota": ambos. */
  via: "np" | "descripcion" | "descripcion+flota" | null;
  /** Cuántas entradas del catálogo coinciden (para detectar ambigüedad). */
  candidatos: number;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/**
 * Dado los datos de un CodigoReparacion (o un equipo/cilindro genérico),
 * intenta determinar el tipo de cilindro a partir del catálogo del Excel.
 *
 * Estrategia:
 *  1. Match por NP exacto (más confiable).
 *  2. Match por descripción + flota (alta precisión).
 *  3. Match por descripción sola.
 */
export function detectarTipoCilindro(
  input: { descripcion?: string | null; np?: string | null; flota?: string | null; posicion?: string | null },
): DeteccionTipo {
  const desc = norm(input.descripcion);
  const np = norm(input.np);
  const flota = norm(input.flota);
  const posicion = norm(input.posicion);

  // 1) Match por NP exacto
  if (np) {
    const porNp = CATALOGO_COD_REP.filter((c) => norm(c.np) === np);
    if (porNp.length >= 1) {
      // Si hay múltiples por NP, intentamos refinar por posición y flota
      let refinados = porNp;
      if (posicion) refinados = refinados.filter((c) => !c.posicion || norm(c.posicion) === posicion) || porNp;
      if (flota) refinados = refinados.filter((c) => !c.flota || norm(c.flota) === flota) || refinados;
      const elegido = refinados[0] ?? porNp[0];
      return {
        codigo: elegido.descripcion_tipo,
        nombre: TIPOS_CILINDRO[elegido.descripcion_tipo] ?? elegido.descripcion_tipo,
        via: "np",
        candidatos: porNp.length,
      };
    }
  }

  // 2) Match por descripción + flota
  if (desc && flota) {
    const matches = CATALOGO_COD_REP.filter((c) => norm(c.descripcion) === desc && norm(c.flota) === flota);
    if (matches.length >= 1) {
      return {
        codigo: matches[0].descripcion_tipo,
        nombre: TIPOS_CILINDRO[matches[0].descripcion_tipo] ?? matches[0].descripcion_tipo,
        via: "descripcion+flota",
        candidatos: matches.length,
      };
    }
  }

  // 3) Match por descripción sola — si todas las coincidencias mapean al mismo tipo, devolverlo
  if (desc) {
    const matches = CATALOGO_COD_REP.filter((c) => norm(c.descripcion) === desc);
    if (matches.length >= 1) {
      const tiposUnicos = [...new Set(matches.map((m) => m.descripcion_tipo))];
      if (tiposUnicos.length === 1) {
        return {
          codigo: tiposUnicos[0],
          nombre: TIPOS_CILINDRO[tiposUnicos[0]] ?? tiposUnicos[0],
          via: "descripcion",
          candidatos: matches.length,
        };
      }
      // Ambiguo: devolvemos el primero como sugerencia pero candidatos >1
      return {
        codigo: matches[0].descripcion_tipo,
        nombre: TIPOS_CILINDRO[matches[0].descripcion_tipo] ?? matches[0].descripcion_tipo,
        via: "descripcion",
        candidatos: matches.length,
      };
    }
  }

  return { codigo: null, nombre: null, via: null, candidatos: 0 };
}

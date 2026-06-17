// ─────────────────────────────────────────────────────────────────────────────
// Fuente de verdad de los CAMPOS DE MEDIDA de la hoja de evaluación.
//
// El formulario (`EvaluacionFormulario.tsx`) y el generador de Word
// (`generarWord.ts`) consumen estas MISMAS definiciones, de modo que la clave
// de datos y el tipo (xy / single / multipunto) de cada medida existan en UN
// SOLO lugar y no puedan desincronizarse — esa desincronización era la causa
// raíz de medidas que se cargaban en pantalla pero no salían en el Word (o
// filas fantasma con "—").
//
// Convenciones:
//   - `key`   es RELATIVA al prefijo del modelo (`${p}_`): el form y el Word
//             le anteponen ese prefijo (ej. `t1_`, `t4_`...).
//   - `label` es la etiqueta BASE, sin "[unidad]": el formulario le agrega la
//             unidad (`[mm]` / `[in]`); el Word la usa tal cual.
//
// Migración incremental por componente. Fase 1: Vástago.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoMedida = "xy" | "single" | "puntos";

export interface CampoMedida {
  key: string;
  label: string;
  tipo: TipoMedida;
  /** Solo `tipo: "puntos"` — cantidad de puntos, letra visible y sufijo de clave. */
  puntos?: number;
  letra?: string;
  sufijo?: string;
}

// ── Vástago ──────────────────────────────────────────────────────────────────
// Orden según el Excel de evaluación: A (Espiga) → B (Vástago, 3 puntos) →
// D (Cojinete) → E (Cromo) → F (Total) → G (Espiga) → ojos / articulación.
export const VASTAGO_MEDIDAS: CampoMedida[] = [
  { key: "vas_desp", label: "Diametro Espiga (A)", tipo: "xy" },
  { key: "vas_dext", label: "Diametro Vástago", tipo: "puntos", puntos: 3, letra: "B", sufijo: "b" },
  { key: "vas_dcoj", label: "Diametro Cojinete (D)", tipo: "xy" },
  { key: "vas_lcro", label: "Longitud Cromo (E)", tipo: "single" },
  { key: "vas_ltot", label: "Longitud Total (F)", tipo: "single" },
  { key: "vas_long_espiga_g", label: "Longitud de Espiga (G)", tipo: "single" },
  { key: "vas_dext_ojo_h", label: "Diám. Ext. Ojo H", tipo: "xy" },
  { key: "vas_dint_ojo_i", label: "Diám. Int. Ojo I", tipo: "xy" },
  { key: "vas_dint_j", label: "Diám. Int. J", tipo: "xy" },
  { key: "vas_ancho_ojo", label: "Ancho de Ojo", tipo: "single" },
];

/** Acceso puntual por key (para los layouts a medida del formulario). */
export const VAS: Record<string, CampoMedida> = Object.fromEntries(
  VASTAGO_MEDIDAS.map((c) => [c.key, c]),
);

/** Título de una tabla multipunto, ej. "Diametro Vástago (B1-B3)". */
export function tituloPuntos(c: CampoMedida): string {
  return `${c.label} (${c.letra}1-${c.letra}${c.puntos})`;
}

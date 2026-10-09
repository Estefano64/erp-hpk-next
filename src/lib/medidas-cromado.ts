// Medidas de vástago para los servicios de CROMADO (requerimientos SER).
//
// El proveedor de cromado necesita el diámetro del vástago y la longitud a
// cromar. Esas medidas ya las toma el técnico en la hoja de evaluación
// (sección Vástago: B1-B3 en X/Y y "Longitud Cromo (E)"), así que se copian
// a las OBSERVACIONES del SER como una línea etiquetada ("Medidas
// evaluación: ...") para que logística las vea en el requerimiento. La línea
// se reemplaza (no se duplica) cada vez que se re-sincroniza; el resto del
// texto de observaciones no se toca.
//
// Módulo PURO y client-safe. La lectura de la BD vive en
// ./medidas-cromado-server.

export interface MedidasCromado {
  /** Lecturas de diámetro del vástago (B1-B3, X/Y) que tengan valor. */
  diametro_min: number | null;
  diametro_max: number | null;
  /** Longitud de cromo (E). */
  longitud_cromo: number | null;
  /** "mm" | "in" según el sistema de medición de la evaluación. */
  unidad: string;
  evaluacion_id: number;
}

/** ¿El SER es un servicio de cromado? Se detecta por la descripción. */
export function esServicioCromado(tipoCodigo: string | null | undefined, descripcion: string | null | undefined): boolean {
  return tipoCodigo === "SER" && /crom/i.test(descripcion ?? "");
}

function fmt(n: number, unidad: string): string {
  return n.toFixed(unidad === "in" ? 3 : 2);
}

/**
 * Texto corto con las medidas, ej. "Ø vástago 69.92 mm · L. cromo 730.00 mm".
 * Si las lecturas de diámetro difieren se muestra el rango (69.90–69.92).
 * null si no hay ninguna medida.
 */
export function textoMedidasCromado(m: MedidasCromado | null | undefined): string | null {
  if (!m) return null;
  const partes: string[] = [];
  if (m.diametro_min != null && m.diametro_max != null) {
    const d = m.diametro_min === m.diametro_max
      ? fmt(m.diametro_min, m.unidad)
      : `${fmt(m.diametro_min, m.unidad)}–${fmt(m.diametro_max, m.unidad)}`;
    partes.push(`Ø vástago ${d} ${m.unidad}`);
  }
  if (m.longitud_cromo != null) partes.push(`L. cromo ${fmt(m.longitud_cromo, m.unidad)} ${m.unidad}`);
  return partes.length ? partes.join(" · ") : null;
}

/** Etiqueta de la línea que se escribe en observaciones. */
export const PREFIJO_LINEA_MEDIDAS = "Medidas evaluación:";

/**
 * Observaciones con la línea de medidas puesta (reemplaza la anterior si
 * existe, si no la agrega al final). Sin medidas → devuelve las mismas
 * observaciones (no borra una línea previa: puede haberla editado alguien).
 */
export function observacionesConMedidas(obs: string | null | undefined, m: MedidasCromado | null | undefined): string | null {
  const texto = textoMedidasCromado(m);
  const actual = obs ?? "";
  if (!texto) return obs ?? null;
  const linea = `${PREFIJO_LINEA_MEDIDAS} ${texto}`;
  const lineas = actual.split(/\r?\n/);
  const idx = lineas.findIndex((l) => l.trim().startsWith(PREFIJO_LINEA_MEDIDAS));
  if (idx >= 0) lineas[idx] = linea;
  else if (actual.trim()) lineas.push(linea);
  else return linea;
  return lineas.join("\n");
}

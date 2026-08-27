// Extrae el número de factura (serie-correlativo, ej. "F001-00003181") del
// nombre del PDF que se sube a la etapa "facturacion" de una OT.
//
// Por qué: hasta 2026-08-27 nadie usó el "Registrar factura" de
// /facturacion/ot — el circuito real fue subir el PDF y cargar la fecha en el
// detalle de la OT, así que `OrdenTrabajo.nro_factura` está vacío en TODAS las
// OTs de prod. El número, sin embargo, viene en el nombre del archivo.
//
// Los dos formatos que aparecen en prod:
//   "20532384088-01-F001-00003181 (1).pdf"   → nombre SUNAT: RUC-TIPO-SERIE-CORRELATIVO
//   "F001-00003202 HP&K INVERSIONES SRL.pdf" → serie-correlativo + razón social
// Ambos resuelven a "F001-00003181" / "F001-00003202".
//
// El correlativo se devuelve TAL CUAL viene: hay un archivo con
// "F001-3149" (sin ceros a la izquierda) y rellenarlo a 8 dígitos sería
// inventar el formato. Si el nombre no matchea, devuelve null y el campo
// queda en blanco — nunca se adivina.

// Serie = 1-4 letras + 1-4 dígitos (F001, B001, FF01...). Correlativo = dígitos.
// El \b inicial evita enganchar la cola del RUC ("...088-01-").
const RE_SERIE_CORRELATIVO = /\b([A-Z]{1,4}\d{1,4})-(\d{1,8})\b/i;

/**
 * Devuelve el número de factura detectado en el nombre del archivo, en
 * mayúsculas ("F001-00003181"), o null si el nombre no lo contiene.
 */
export function numeroFacturaDesdeArchivo(nombreArchivo: string | null | undefined): string | null {
  if (!nombreArchivo) return null;
  // Sacamos la extensión y el sufijo " (1)" que agrega el navegador al bajar
  // dos veces el mismo archivo — ninguno de los dos aporta al número.
  const base = nombreArchivo.replace(/\.[a-z0-9]+$/i, "").replace(/\s*\(\d+\)\s*$/, "");
  const m = base.match(RE_SERIE_CORRELATIVO);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

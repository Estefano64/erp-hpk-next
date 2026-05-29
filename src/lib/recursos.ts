/**
 * Multi-recurso (operarios / equipos) guardados en un único campo de texto
 * (`planificacion_ot.tecnico` / `.maquina`).
 *
 * IMPORTANTE: el separador NO puede ser coma. Los operarios se guardan como
 * "APELLIDO APELLIDO, NOMBRE NOMBRE" (con coma), así que partir por coma
 * rompía el nombre en dos. Síntomas que provocaba:
 *   - la tarea desaparecía de la franja del operario en programación semanal,
 *   - el operario no podía "iniciar" su propia tarea (no matcheaba su nombre),
 *   - el ranking contaba medio nombre como un técnico distinto.
 *
 * Usamos "|" como separador, que los nombres y los códigos de equipo nunca
 * contienen. Un valor sin "|" se trata como un único recurso (el nombre
 * completo, coma incluida), que es el caso de todos los datos actuales.
 */
export const SEP_RECURSO = " | ";

export function splitRecursos(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}

export function joinRecursos(arr: string[]): string | null {
  const clean = arr.map((x) => x.trim()).filter(Boolean);
  return clean.length === 0 ? null : clean.join(SEP_RECURSO);
}

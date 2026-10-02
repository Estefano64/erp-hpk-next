/**
 * Banderas de comportamiento de Planificación.
 *
 * TAREAS_DESDE_PLANTILLA_CODREP — Decisión del equipo HP&K (2026-10-02): las
 * tareas de una OT nacen de la hoja de evaluación (recomendaciones estándar /
 * no estándar por componente), ya NO de la plantilla por CodRep
 * (`operacion_cod_rep`). Con `false`:
 *   - al crear una OT no se copian las operaciones de la plantilla a
 *     `planificacion_ot` (los requerimientos de materiales desde `tarea` siguen
 *     igual, son otra cosa);
 *   - el endpoint POST /api/ordenes-trabajo/[id]/planificacion (regenerar desde
 *     plantilla) responde 400.
 * La tabla `operacion_cod_rep` y su mantenimiento en /codigos-reparacion quedan
 * intactos por historial y por si hay que volver atrás: basta poner `true`.
 */
export const TAREAS_DESDE_PLANTILLA_CODREP = false;

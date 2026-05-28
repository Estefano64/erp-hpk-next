-- Comentario del planner en la tarea (PlanificacionOT). Se setea al crear/editar
-- la tarea y le llega al técnico cuando ve su tarea. Distinto de `observaciones`
-- (que carga el técnico al ejecutar/pausar/cerrar).
ALTER TABLE "planificacion_ot" ADD COLUMN IF NOT EXISTS "comentario" TEXT;

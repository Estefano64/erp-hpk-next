-- Agrega el campo `tareas_checklist` (JSONB nullable) a `orden_trabajo_interna`.
-- Guarda un mapa { [task_list_id]: { done, fecha, usuario, obs } } para
-- marcar qué tareas del task list ya se completaron desde el tab Tareas.
ALTER TABLE "orden_trabajo_interna" ADD COLUMN "tareas_checklist" JSONB;

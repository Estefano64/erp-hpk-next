-- Permitir tareas de planificación SIN OT (apoyo/generales).
ALTER TABLE "planificacion_ot" ALTER COLUMN "ot_id" DROP NOT NULL;

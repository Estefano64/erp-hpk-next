-- Comentario / recomendación que deja el aprobador al aprobar un requerimiento.
-- Opcional (VARCHAR(500) NULLABLE) y separado de `observaciones` (que pertenece
-- al solicitante y/o al flujo de OC/recepción) para no mezclar autorías.

ALTER TABLE "ot_repuestos" ADD COLUMN IF NOT EXISTS "comentario_aprobacion" VARCHAR(500);

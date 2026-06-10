-- Línea base del plan: snapshot congelado al PUBLICAR la semana.
-- Permite comparar Plan vs Real (rendimiento, movimientos, correctivos).
ALTER TABLE "planificacion_ot"
  ADD COLUMN "fecha_inicio_base"    TIMESTAMP(6),
  ADD COLUMN "fecha_fin_base"       TIMESTAMP(6),
  ADD COLUMN "horas_estimadas_base" DECIMAL(6,2),
  ADD COLUMN "tecnico_base"         VARCHAR(100),
  ADD COLUMN "semana_base"          VARCHAR(10),
  ADD COLUMN "publicado_at"         TIMESTAMP(6);

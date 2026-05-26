-- Campo Supervisor en la hoja de evaluación técnica. Distinto de
-- `revisado_por` (flujo de aprobación) — este es quien valida la medición.
ALTER TABLE "evaluaciones_tecnicas"
  ADD COLUMN IF NOT EXISTS "supervisor" VARCHAR(150);

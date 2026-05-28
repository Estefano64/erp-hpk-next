-- Sesiones de trabajo del técnico sobre una tarea.
CREATE TABLE "planificacion_ot_sesion" (
  "id" SERIAL PRIMARY KEY,
  "planificacion_ot_id" INTEGER NOT NULL,
  "tecnico" VARCHAR(100) NOT NULL,
  "inicio" TIMESTAMP(6) NOT NULL,
  "fin" TIMESTAMP(6),
  "cierre" VARCHAR(20),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planificacion_ot_sesion_planificacion_ot_id_fkey"
    FOREIGN KEY ("planificacion_ot_id") REFERENCES "planificacion_ot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "planificacion_ot_sesion_planificacion_ot_id_idx" ON "planificacion_ot_sesion"("planificacion_ot_id");
CREATE INDEX "planificacion_ot_sesion_tecnico_idx" ON "planificacion_ot_sesion"("tecnico");
CREATE INDEX "planificacion_ot_sesion_fin_idx" ON "planificacion_ot_sesion"("fin");

-- Estados nuevos para el ciclo iniciar/pausar/finalizar.
INSERT INTO "status_tarea" ("codigo", "nombre", "color", "orden", "activo", "created_at", "updated_at")
VALUES
  ('en_proceso', 'En proceso', 'processing', 6, true, NOW(), NOW()),
  ('pausado',    'Pausado',    'warning',    7, true, NOW(), NOW())
ON CONFLICT ("codigo") DO NOTHING;

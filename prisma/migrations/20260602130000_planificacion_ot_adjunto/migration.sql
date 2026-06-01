-- Adjuntos (fotos / documentos) que sube el técnico al pausar/finalizar una tarea.
CREATE TABLE "planificacion_ot_adjunto" (
  "id"                  SERIAL PRIMARY KEY,
  "planificacion_ot_id" INTEGER NOT NULL,
  "nombre_archivo"      VARCHAR(255) NOT NULL,
  "r2_key"              VARCHAR(500) NOT NULL,
  "tipo_mime"           VARCHAR(100) NOT NULL,
  "tamano"              INTEGER NOT NULL,
  "usuario_sube"        VARCHAR(100),
  "fecha_subida"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planificacion_ot_adjunto_planificacion_ot_id_fkey"
    FOREIGN KEY ("planificacion_ot_id") REFERENCES "planificacion_ot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "planificacion_ot_adjunto_planificacion_ot_id_idx" ON "planificacion_ot_adjunto"("planificacion_ot_id");

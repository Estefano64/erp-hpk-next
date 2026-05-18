CREATE TABLE "ot_repuesto_adjunto" (
  "id"             SERIAL PRIMARY KEY,
  "ot_repuesto_id" INTEGER NOT NULL,
  "nombre_archivo" VARCHAR(255) NOT NULL,
  "ruta"           VARCHAR(500) NOT NULL,
  "tipo_mime"      VARCHAR(100) NOT NULL,
  "tamano"         INTEGER NOT NULL,
  "usuario_sube"   VARCHAR(100),
  "fecha_subida"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ot_repuesto_adjunto_ot_repuesto_id_fkey"
    FOREIGN KEY ("ot_repuesto_id") REFERENCES "ot_repuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ot_repuesto_adjunto_ot_repuesto_id_idx" ON "ot_repuesto_adjunto"("ot_repuesto_id");

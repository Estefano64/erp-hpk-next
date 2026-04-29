-- CreateIndex
CREATE INDEX "planificacion_ot_estado_idx" ON "planificacion_ot"("estado");

-- AddForeignKey
ALTER TABLE "planificacion_ot" ADD CONSTRAINT "planificacion_ot_estado_fkey" FOREIGN KEY ("estado") REFERENCES "status_tarea"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

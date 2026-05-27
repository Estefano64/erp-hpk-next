-- AlterTable
ALTER TABLE "ot_adjunto" ADD COLUMN     "orden_trabajo_interna_id" INTEGER,
ALTER COLUMN "orden_trabajo_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ot_historial" ADD COLUMN     "orden_trabajo_interna_id" INTEGER,
ALTER COLUMN "ot_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ot_adjunto_orden_trabajo_id_idx" ON "ot_adjunto"("orden_trabajo_id");

-- CreateIndex
CREATE INDEX "ot_adjunto_orden_trabajo_interna_id_idx" ON "ot_adjunto"("orden_trabajo_interna_id");

-- CreateIndex
CREATE INDEX "ot_historial_orden_trabajo_interna_id_idx" ON "ot_historial"("orden_trabajo_interna_id");

-- AddForeignKey
ALTER TABLE "ot_adjunto" ADD CONSTRAINT "ot_adjunto_orden_trabajo_interna_id_fkey" FOREIGN KEY ("orden_trabajo_interna_id") REFERENCES "orden_trabajo_interna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_historial" ADD CONSTRAINT "ot_historial_orden_trabajo_interna_id_fkey" FOREIGN KEY ("orden_trabajo_interna_id") REFERENCES "orden_trabajo_interna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

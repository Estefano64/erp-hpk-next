-- AlterTable
ALTER TABLE "ot_repuestos" ADD COLUMN     "orden_trabajo_interna_id" INTEGER,
ALTER COLUMN "ot_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ot_repuestos_orden_trabajo_interna_id_idx" ON "ot_repuestos"("orden_trabajo_interna_id");

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_orden_trabajo_interna_id_fkey" FOREIGN KEY ("orden_trabajo_interna_id") REFERENCES "orden_trabajo_interna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

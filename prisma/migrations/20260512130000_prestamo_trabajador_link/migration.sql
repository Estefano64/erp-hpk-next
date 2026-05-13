-- AlterTable
ALTER TABLE "prestamos_herramientas" ADD COLUMN "trabajador_id" INTEGER;

-- CreateIndex
CREATE INDEX "prestamos_herramientas_trabajador_id_idx" ON "prestamos_herramientas"("trabajador_id");

-- AddForeignKey
ALTER TABLE "prestamos_herramientas" ADD CONSTRAINT "prestamos_herramientas_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "trabajador"("trabajador_id") ON DELETE SET NULL ON UPDATE CASCADE;

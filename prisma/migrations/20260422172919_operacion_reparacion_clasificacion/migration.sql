-- AlterTable
ALTER TABLE "operacion_reparacion" ADD COLUMN     "clasificacion" VARCHAR(10) NOT NULL DEFAULT 'STD';

-- CreateIndex
CREATE INDEX "operacion_reparacion_componente_codigo_clasificacion_idx" ON "operacion_reparacion"("componente_codigo", "clasificacion");

/*
  Warnings:

  - You are about to drop the column `estado` on the `ot_repuestos` table. All the data in the column will be lost.
  - You are about to drop the column `estado_cot` on the `ot_repuestos` table. All the data in the column will be lost.
  - Changed the type of `tipo_movimiento` on the `movimientos_inventario` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropIndex
DROP INDEX "ot_repuestos_estado_idx";

-- AlterTable
ALTER TABLE "codigo_reparacion" ADD COLUMN     "np_reemplaza" VARCHAR(100),
ADD COLUMN     "reemplaza" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "movimientos_inventario" DROP COLUMN "tipo_movimiento",
ADD COLUMN     "tipo_movimiento" "TipoMovimientoInventario" NOT NULL;

-- AlterTable
ALTER TABLE "ot_repuestos" DROP COLUMN "estado",
DROP COLUMN "estado_cot",
ADD COLUMN     "status_cotizacion_codigo" VARCHAR(20),
ADD COLUMN     "status_oc_codigo" VARCHAR(20),
ADD COLUMN     "status_requerimiento_codigo" VARCHAR(20);

-- AlterTable
ALTER TABLE "tarea" ADD COLUMN     "estrategia_id" INTEGER;

-- CreateIndex
CREATE INDEX "movimientos_inventario_material_id_idx" ON "movimientos_inventario"("material_id");

-- CreateIndex
CREATE INDEX "movimientos_inventario_fecha_movimiento_idx" ON "movimientos_inventario"("fecha_movimiento");

-- CreateIndex
CREATE INDEX "ot_repuestos_status_requerimiento_codigo_idx" ON "ot_repuestos"("status_requerimiento_codigo");

-- CreateIndex
CREATE INDEX "ot_repuestos_status_oc_codigo_idx" ON "ot_repuestos"("status_oc_codigo");

-- CreateIndex
CREATE INDEX "tarea_cod_rep_codigo_idx" ON "tarea"("cod_rep_codigo");

-- CreateIndex
CREATE INDEX "tarea_estrategia_id_idx" ON "tarea"("estrategia_id");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_estrategia_id_fkey" FOREIGN KEY ("estrategia_id") REFERENCES "estrategia"("estrategia_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_status_requerimiento_codigo_fkey" FOREIGN KEY ("status_requerimiento_codigo") REFERENCES "status_requerimiento"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_status_cotizacion_codigo_fkey" FOREIGN KEY ("status_cotizacion_codigo") REFERENCES "status_cotizacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_status_oc_codigo_fkey" FOREIGN KEY ("status_oc_codigo") REFERENCES "status_oc"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

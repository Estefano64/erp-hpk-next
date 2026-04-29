/*
  Warnings:

  - You are about to drop the column `estado` on the `compras` table. All the data in the column will be lost.
  - You are about to drop the column `moneda` on the `compras` table. All the data in the column will be lost.
  - You are about to alter the column `cantidad` on the `compras_detalle` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,4)`.
  - You are about to drop the `ordenes_compra` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "compras" DROP CONSTRAINT "compras_almacen_id_fkey";

-- DropIndex
DROP INDEX "compras_estado_idx";

-- AlterTable
ALTER TABLE "compras" DROP COLUMN "estado",
DROP COLUMN "moneda",
ADD COLUMN     "moneda_codigo" VARCHAR(10),
ADD COLUMN     "status_oc_codigo" VARCHAR(20),
ALTER COLUMN "almacen_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "compras_detalle" ADD COLUMN     "cantidad_en_transito" DECIMAL(12,4) DEFAULT 0,
ADD COLUMN     "cantidad_recibida" DECIMAL(12,4) DEFAULT 0,
ADD COLUMN     "status_oc_codigo" VARCHAR(20),
ALTER COLUMN "cantidad" SET DATA TYPE DECIMAL(12,4);

-- AlterTable
ALTER TABLE "ot_repuestos" ADD COLUMN     "cantidad_en_transito" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN     "cantidad_recibida" DECIMAL(10,2) DEFAULT 0;

-- DropTable
DROP TABLE "ordenes_compra";

-- CreateIndex
CREATE INDEX "compras_status_oc_codigo_idx" ON "compras"("status_oc_codigo");

-- CreateIndex
CREATE INDEX "compras_detalle_status_oc_codigo_idx" ON "compras_detalle"("status_oc_codigo");

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_almacen_id_fkey" FOREIGN KEY ("almacen_id") REFERENCES "almacenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_status_oc_codigo_fkey" FOREIGN KEY ("status_oc_codigo") REFERENCES "status_oc"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_moneda_codigo_fkey" FOREIGN KEY ("moneda_codigo") REFERENCES "moneda"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_detalle" ADD CONSTRAINT "compras_detalle_status_oc_codigo_fkey" FOREIGN KEY ("status_oc_codigo") REFERENCES "status_oc"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

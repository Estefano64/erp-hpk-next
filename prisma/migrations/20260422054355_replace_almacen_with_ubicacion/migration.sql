/*
  Warnings:

  - You are about to drop the column `almacen_id` on the `compras` table. All the data in the column will be lost.
  - You are about to drop the `almacenes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "compras" DROP CONSTRAINT "compras_almacen_id_fkey";

-- AlterTable
ALTER TABLE "compras" DROP COLUMN "almacen_id",
ADD COLUMN     "ubicacion_codigo" VARCHAR(10);

-- DropTable
DROP TABLE "almacenes";

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_ubicacion_codigo_fkey" FOREIGN KEY ("ubicacion_codigo") REFERENCES "ubicacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

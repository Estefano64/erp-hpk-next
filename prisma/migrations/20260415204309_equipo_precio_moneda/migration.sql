/*
  Warnings:

  - You are about to drop the column `costo` on the `equipo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "equipo" DROP COLUMN "costo",
ADD COLUMN     "moneda_codigo" VARCHAR(10),
ADD COLUMN     "precio" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_moneda_codigo_fkey" FOREIGN KEY ("moneda_codigo") REFERENCES "moneda"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

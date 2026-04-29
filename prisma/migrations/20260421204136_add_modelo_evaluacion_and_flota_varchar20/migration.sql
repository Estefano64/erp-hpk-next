-- DropForeignKey
ALTER TABLE "codigo_reparacion" DROP CONSTRAINT "codigo_reparacion_flota_codigo_fkey";

-- AlterTable
ALTER TABLE "codigo_reparacion" ADD COLUMN     "modelo_evaluacion_codigo" VARCHAR(10),
ALTER COLUMN "flota_codigo" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "flota_equipo" ALTER COLUMN "codigo" SET DATA TYPE VARCHAR(20);

-- CreateTable
CREATE TABLE "modelo_evaluacion" (
    "modelo_evaluacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modelo_evaluacion_pkey" PRIMARY KEY ("modelo_evaluacion_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modelo_evaluacion_codigo_key" ON "modelo_evaluacion"("codigo");

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_flota_codigo_fkey" FOREIGN KEY ("flota_codigo") REFERENCES "flota_equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_reparacion" ADD CONSTRAINT "codigo_reparacion_modelo_evaluacion_codigo_fkey" FOREIGN KEY ("modelo_evaluacion_codigo") REFERENCES "modelo_evaluacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "configuracion_cotizacion" ADD COLUMN     "multiplicador_he" DECIMAL(5,2) NOT NULL DEFAULT 1.5;

-- AlterTable
ALTER TABLE "planificacion_ot" ADD COLUMN     "fecha_fin_real" TIMESTAMP(6),
ADD COLUMN     "fecha_inicio_real" TIMESTAMP(6),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

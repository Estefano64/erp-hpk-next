-- AlterTable
ALTER TABLE "equipo" ADD COLUMN     "cantidad" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "costo" DECIMAL(12,2),
ADD COLUMN     "ubicacion" VARCHAR(50),
ADD COLUMN     "usuario_responsable" VARCHAR(100),
ALTER COLUMN "capacidad" SET DATA TYPE VARCHAR(50);

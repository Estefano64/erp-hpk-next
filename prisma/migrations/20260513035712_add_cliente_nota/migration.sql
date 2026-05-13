-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "nota" VARCHAR(300);

-- AlterTable
ALTER TABLE "servicio" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

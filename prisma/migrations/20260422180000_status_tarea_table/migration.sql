-- AlterTable
ALTER TABLE "planificacion_ot" ALTER COLUMN "estado" SET DEFAULT 'abierto',
ALTER COLUMN "estado" SET DATA TYPE VARCHAR(20);

-- CreateTable
CREATE TABLE "status_tarea" (
    "status_tarea_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "orden" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_tarea_pkey" PRIMARY KEY ("status_tarea_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_tarea_codigo_key" ON "status_tarea"("codigo");

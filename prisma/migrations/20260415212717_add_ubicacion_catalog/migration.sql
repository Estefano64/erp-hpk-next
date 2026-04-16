-- AlterTable
ALTER TABLE "equipo" ADD COLUMN     "ubicacion_codigo" VARCHAR(10);

-- CreateTable
CREATE TABLE "ubicacion" (
    "ubicacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(200),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ubicacion_pkey" PRIMARY KEY ("ubicacion_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ubicacion_codigo_key" ON "ubicacion"("codigo");

-- AddForeignKey
ALTER TABLE "equipo" ADD CONSTRAINT "equipo_ubicacion_codigo_fkey" FOREIGN KEY ("ubicacion_codigo") REFERENCES "ubicacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

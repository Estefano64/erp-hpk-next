-- CreateTable
CREATE TABLE "ot_adjunto" (
    "id" SERIAL NOT NULL,
    "orden_trabajo_id" INTEGER NOT NULL,
    "etapa" VARCHAR(30) NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "ruta" VARCHAR(500) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ot_adjunto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ot_adjunto" ADD CONSTRAINT "ot_adjunto_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

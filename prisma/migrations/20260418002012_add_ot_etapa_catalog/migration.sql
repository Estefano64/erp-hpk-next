-- CreateTable
CREATE TABLE "ot_etapa" (
    "ot_etapa_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(300),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ot_etapa_pkey" PRIMARY KEY ("ot_etapa_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ot_etapa_codigo_key" ON "ot_etapa"("codigo");

-- Seed initial stages (match keys used by UI OTAdjuntosTab)
INSERT INTO "ot_etapa" ("codigo", "nombre", "descripcion", "orden") VALUES
  ('recepcion',  'Recepción',            'Fotos y documentos de la llegada del cilindro al taller',             1),
  ('evaluacion', 'Evaluación',           'Fotos de evaluación, informes técnicos y hoja de evaluación',          2),
  ('termino',    'Término de Reparación','Fotos y documentos del término de reparación del componente',          3),
  ('despacho',   'Despacho',             'Fotos y documentos del despacho del componente reparado',              4);

-- AlterTable: ot_adjunto is empty, safe to drop and add NOT NULL column
ALTER TABLE "ot_adjunto" DROP COLUMN "etapa",
ADD COLUMN     "etapa_codigo" VARCHAR(20) NOT NULL;

-- AddForeignKey
ALTER TABLE "ot_adjunto" ADD CONSTRAINT "ot_adjunto_etapa_codigo_fkey" FOREIGN KEY ("etapa_codigo") REFERENCES "ot_etapa"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

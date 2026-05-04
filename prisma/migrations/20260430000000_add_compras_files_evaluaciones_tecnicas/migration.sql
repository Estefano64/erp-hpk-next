-- Cambios de schema introducidos por Cesar (módulo de evaluaciones técnicas + adjuntos en compras)
-- Esta migración formaliza lo que estaba aplicado vía db push.

-- AlterTable: campos para subir factura/guía a las compras
ALTER TABLE "compras" ADD COLUMN     "factura_archivo" VARCHAR(500),
ADD COLUMN     "factura_fecha_subida" TIMESTAMP(3),
ADD COLUMN     "factura_nombre" VARCHAR(300),
ADD COLUMN     "guia_archivo" VARCHAR(500),
ADD COLUMN     "guia_fecha_subida" TIMESTAMP(3),
ADD COLUMN     "guia_nombre" VARCHAR(300);

-- CreateTable: evaluaciones técnicas digitales
CREATE TABLE "evaluaciones_tecnicas" (
    "id" SERIAL NOT NULL,
    "ot_id" INTEGER NOT NULL,
    "modelo_evaluacion" VARCHAR(50) NOT NULL,
    "sistema_medicion" VARCHAR(10) NOT NULL DEFAULT 'Metrico',
    "fecha_evaluacion" DATE,
    "evaluado_por" VARCHAR(150),
    "datos_formulario" JSONB NOT NULL DEFAULT '{}',
    "resultado_general" TEXT,
    "recomendaciones_general" TEXT,
    "informe_archivo" VARCHAR(500),
    "informe_nombre" VARCHAR(300),
    "informe_fecha_subida" TIMESTAMP(3),
    "estado" VARCHAR(25) NOT NULL DEFAULT 'BORRADOR',
    "revisado_por" VARCHAR(150),
    "fecha_revision" TIMESTAMP(3),
    "comentarios_revision" TEXT,
    "solicitado_revision_por" VARCHAR(150),
    "fecha_solicitud_revision" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluaciones_tecnicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluaciones_tecnicas_ot_id_idx" ON "evaluaciones_tecnicas"("ot_id");

-- CreateIndex
CREATE INDEX "evaluaciones_tecnicas_estado_idx" ON "evaluaciones_tecnicas"("estado");

-- AddForeignKey
ALTER TABLE "evaluaciones_tecnicas" ADD CONSTRAINT "evaluaciones_tecnicas_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

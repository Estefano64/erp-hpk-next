-- CreateEnum
CREATE TYPE "TipoCaptura" AS ENUM ('MEDIDA_NUMERICA', 'CHECKLIST_BMN', 'FOTO', 'TEXTO', 'TOLERANCIA', 'BOOLEAN');

-- AlterTable
ALTER TABLE "planificacion_ot" ADD COLUMN     "horas_reales" DECIMAL(6,2),
ADD COLUMN     "operacion_cod_rep_id" INTEGER,
ALTER COLUMN "componente" SET DATA TYPE VARCHAR(30),
ALTER COLUMN "horas_estimadas" SET DATA TYPE DECIMAL(6,2);

-- CreateTable
CREATE TABLE "planificacion_ot_captura" (
    "id" SERIAL NOT NULL,
    "planificacion_ot_id" INTEGER NOT NULL,
    "campo_key" VARCHAR(100) NOT NULL,
    "tipo_captura" "TipoCaptura" NOT NULL,
    "valor_numero" DECIMAL(15,4),
    "valor_texto" TEXT,
    "valor_booleano" BOOLEAN,
    "valor_url" VARCHAR(500),
    "unidad" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planificacion_ot_captura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planificacion_ot_captura_planificacion_ot_id_idx" ON "planificacion_ot_captura"("planificacion_ot_id");

-- CreateIndex
CREATE INDEX "planificacion_ot_captura_campo_key_idx" ON "planificacion_ot_captura"("campo_key");

-- CreateIndex
CREATE INDEX "planificacion_ot_ot_id_idx" ON "planificacion_ot"("ot_id");

-- CreateIndex
CREATE INDEX "planificacion_ot_operacion_cod_rep_id_idx" ON "planificacion_ot"("operacion_cod_rep_id");

-- AddForeignKey
ALTER TABLE "planificacion_ot" ADD CONSTRAINT "planificacion_ot_operacion_cod_rep_id_fkey" FOREIGN KEY ("operacion_cod_rep_id") REFERENCES "operacion_cod_rep"("operacion_cod_rep_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planificacion_ot_captura" ADD CONSTRAINT "planificacion_ot_captura_planificacion_ot_id_fkey" FOREIGN KEY ("planificacion_ot_id") REFERENCES "planificacion_ot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

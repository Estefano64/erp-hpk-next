-- AlterTable
ALTER TABLE "orden_trabajo" ADD COLUMN     "moneda_cotizacion_codigo" VARCHAR(10);

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_moneda_cotizacion_codigo_fkey" FOREIGN KEY ("moneda_cotizacion_codigo") REFERENCES "moneda"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

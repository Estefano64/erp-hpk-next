-- Envío conjunto de servicios externos: varios SER que salen juntos al mismo
-- proveedor comparten lote_id. Aditivo; los envíos existentes quedan NULL.
ALTER TABLE "servicio_envio" ADD COLUMN "lote_id" VARCHAR(36);
CREATE INDEX "servicio_envio_lote_id_idx" ON "servicio_envio"("lote_id");

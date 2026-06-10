-- Adjunto de COMPROBANTE DE PAGO en la OC. Mismo patrón que guia/factura.
-- Solo aplica visualmente cuando tipo_pago = 'CONTADO' o 'TRANSFERENCIA'.
ALTER TABLE "compras"
ADD COLUMN "pago_key"          VARCHAR(500),
ADD COLUMN "pago_nombre"       VARCHAR(300),
ADD COLUMN "pago_mime"         VARCHAR(100),
ADD COLUMN "pago_tamano"       INTEGER,
ADD COLUMN "pago_fecha_subida" TIMESTAMP(3);

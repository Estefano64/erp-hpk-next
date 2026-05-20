-- Agrega campos descuento y otros a la cabecera de la OC.
-- total = subtotal - descuento + impuesto + otros
ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "otros" DECIMAL(12,2) NOT NULL DEFAULT 0;

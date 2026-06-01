-- Tipo de pago + plazo en días para cada Compra.
--   tipo_pago     VARCHAR(30) — códigos sugeridos: CONTADO / CREDITO / ADELANTO / CHEQUE_FECHADO / TRANSFERENCIA.
--   dias_credito  INTEGER     — solo aplica cuando tipo_pago = CREDITO (o equivalentes con vencimiento).
-- Ambos son NULLABLE para compatibilidad con OCs existentes.

ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "tipo_pago" VARCHAR(30);
ALTER TABLE "compras" ADD COLUMN IF NOT EXISTS "dias_credito" INTEGER;

-- Lugar de entrega — solo aplica a OT externas de BIEN (texto libre, opcional).
-- Nullable, no rompe OTs existentes.

ALTER TABLE "orden_trabajo"
  ADD COLUMN IF NOT EXISTS "lugar_entrega" VARCHAR(200);

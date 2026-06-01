-- Costo Promedio Ponderado (PPP) por material.
--   `costo_promedio`         → Decimal(15,4) — el costo unitario actual del stock.
--   `costo_promedio_moneda`  → moneda en la que se mantiene ese costo (USD / PEN).
--
-- Se recalcula en cada ENTRADA contra OC (ver ingreso-po):
--   nuevo_costo = (stock_actual × costo_actual + cantidad_recibida × precio_oc)
--                 / (stock_actual + cantidad_recibida)
-- La SALIDA de almacén toma `costo_promedio` como precio del movimiento.
--
-- Seed inicial: usar `precio` del catálogo si > 0; sino dejar NULL (la próxima
-- ENTRADA lo inicializa con su precio).

ALTER TABLE "material" ADD COLUMN IF NOT EXISTS "costo_promedio" DECIMAL(15, 4);
ALTER TABLE "material" ADD COLUMN IF NOT EXISTS "costo_promedio_moneda" VARCHAR(10);

UPDATE "material"
SET "costo_promedio" = "precio",
    "costo_promedio_moneda" = COALESCE("moneda_codigo", 'USD')
WHERE "costo_promedio" IS NULL
  AND "precio" IS NOT NULL
  AND "precio" > 0;

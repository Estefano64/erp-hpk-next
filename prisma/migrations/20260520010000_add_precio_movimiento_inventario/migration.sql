-- Snapshot del precio unitario al momento de la SALIDA del inventario.
-- Cascada de resolución: material.precio actual → última OC → null.
ALTER TABLE "movimientos_inventario"
  ADD COLUMN IF NOT EXISTS "precio_unitario" DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS "moneda" VARCHAR(10);

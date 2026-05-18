-- Cotización manual de un material a un proveedor (override del precio que sale
-- de las OCs reales). Una cotización vigente por par material+proveedor.
CREATE TABLE "cotizacion_proveedor" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(15,4) NOT NULL,
    "moneda_codigo" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "observaciones" VARCHAR(300),
    "usuario" VARCHAR(100),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cotizacion_proveedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cotizacion_proveedor_material_proveedor_key"
  ON "cotizacion_proveedor"("material_id", "proveedor_id");
CREATE INDEX "cotizacion_proveedor_material_id_idx" ON "cotizacion_proveedor"("material_id");
CREATE INDEX "cotizacion_proveedor_proveedor_id_idx" ON "cotizacion_proveedor"("proveedor_id");

ALTER TABLE "cotizacion_proveedor"
  ADD CONSTRAINT "cotizacion_proveedor_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "material"("material_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cotizacion_proveedor"
  ADD CONSTRAINT "cotizacion_proveedor_proveedor_id_fkey"
  FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

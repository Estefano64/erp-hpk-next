-- Inventario manual de materiales NO catalogados (no existen en `material`).
-- Permite registrar items a mano con control de stock (entradas / salidas / ajustes).

CREATE TABLE "material_no_catalogado" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "unidad_medida" VARCHAR(20) NOT NULL DEFAULT 'UNIDAD',
    "stock_actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ubicacion_codigo" VARCHAR(10),
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "material_no_catalogado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_no_catalogado_codigo_key" ON "material_no_catalogado"("codigo");

CREATE TABLE "movimiento_no_catalogado" (
    "id" SERIAL NOT NULL,
    "material_no_cat_id" INTEGER NOT NULL,
    "tipo_movimiento" "TipoMovimientoInventario" NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "motivo" VARCHAR(300),
    "documento_referencia" VARCHAR(100),
    "usuario" VARCHAR(100) NOT NULL,
    "fecha_movimiento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "movimiento_no_catalogado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movimiento_no_catalogado_material_no_cat_id_idx" ON "movimiento_no_catalogado"("material_no_cat_id");
CREATE INDEX "movimiento_no_catalogado_fecha_movimiento_idx" ON "movimiento_no_catalogado"("fecha_movimiento");

ALTER TABLE "movimiento_no_catalogado"
  ADD CONSTRAINT "movimiento_no_catalogado_material_no_cat_id_fkey"
  FOREIGN KEY ("material_no_cat_id") REFERENCES "material_no_catalogado"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_no_catalogado"
  ADD CONSTRAINT "material_no_catalogado_ubicacion_codigo_fkey"
  FOREIGN KEY ("ubicacion_codigo") REFERENCES "ubicacion"("codigo")
  ON DELETE SET NULL ON UPDATE CASCADE;

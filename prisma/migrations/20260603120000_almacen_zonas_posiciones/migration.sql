-- Almacén físico HP&K: zonas + posiciones + tracking en OTRepuesto + status nuevo
-- "CONSUMIDO_ALMACEN" para distinguir items salidos por consumo de los entregados
-- vía OC recibida (ENTREGADO).

-- ── Tabla AlmacenZona ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "almacen_zona" (
  "id"          SERIAL PRIMARY KEY,
  "codigo"      VARCHAR(20) NOT NULL UNIQUE,
  "nombre"      VARCHAR(100) NOT NULL,
  "descripcion" VARCHAR(300),
  "orden"       INTEGER NOT NULL DEFAULT 0,
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed inicial: las 3 zonas físicas del almacén HP&K Arequipa.
INSERT INTO "almacen_zona" ("codigo", "nombre", "descripcion", "orden") VALUES
  ('HERR_SUM', 'Herramientas y Suministros', 'Almacén general — herramientas, EPP y suministros del taller', 1),
  ('OTS',      'OTs',                        'Zona donde se acumulan los repuestos por OT en proceso',           2),
  ('STOCK',    'Stock',                      'Stock disponible para venta o uso general',                       3)
ON CONFLICT ("codigo") DO NOTHING;

-- ── Tabla AlmacenPosicion ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "almacen_posicion" (
  "id"         SERIAL PRIMARY KEY,
  "zona_id"    INTEGER NOT NULL REFERENCES "almacen_zona"("id") ON DELETE CASCADE,
  "codigo"     VARCHAR(20) NOT NULL,
  "nombre"     VARCHAR(100),
  "activo"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("zona_id", "codigo")
);

CREATE INDEX IF NOT EXISTS "almacen_posicion_zona_id_idx" ON "almacen_posicion"("zona_id");

-- Seed de posiciones básicas A1-A10 por cada zona, para que el flujo funcione
-- desde el inicio. El admin puede agregar más desde /catalogos después.
INSERT INTO "almacen_posicion" ("zona_id", "codigo")
SELECT z."id", p."codigo"
FROM "almacen_zona" z
CROSS JOIN (
  VALUES ('A1'), ('A2'), ('A3'), ('A4'), ('A5'),
         ('A6'), ('A7'), ('A8'), ('A9'), ('A10')
) AS p("codigo")
ON CONFLICT ("zona_id", "codigo") DO NOTHING;

-- ── Columnas en OTRepuesto ───────────────────────────────────────────
ALTER TABLE "ot_repuestos" ADD COLUMN IF NOT EXISTS "almacen_zona_id"     INTEGER;
ALTER TABLE "ot_repuestos" ADD COLUMN IF NOT EXISTS "almacen_posicion_id" INTEGER;

-- FKs (sin ON DELETE para no bloquear el catálogo si tiene refs).
ALTER TABLE "ot_repuestos"
  ADD CONSTRAINT "ot_repuestos_almacen_zona_id_fkey"
  FOREIGN KEY ("almacen_zona_id") REFERENCES "almacen_zona"("id")
  ON DELETE SET NULL;

ALTER TABLE "ot_repuestos"
  ADD CONSTRAINT "ot_repuestos_almacen_posicion_id_fkey"
  FOREIGN KEY ("almacen_posicion_id") REFERENCES "almacen_posicion"("id")
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ot_repuestos_almacen_zona_id_idx"     ON "ot_repuestos"("almacen_zona_id");
CREATE INDEX IF NOT EXISTS "ot_repuestos_almacen_posicion_id_idx" ON "ot_repuestos"("almacen_posicion_id");

-- ── Estado nuevo: CONSUMIDO_ALMACEN ──────────────────────────────────
-- Distinto de ENTREGADO (que se reserva para entregas vía OC recibida).
-- Se setea cuando el req se consume completamente desde almacén.
INSERT INTO "status_oc" ("codigo", "nombre", "orden", "activo")
VALUES ('CONSUMIDO_ALMACEN', 'Consumido de Almacén', 35, true)
ON CONFLICT ("codigo") DO NOTHING;

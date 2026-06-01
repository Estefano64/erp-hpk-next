-- OT Interna: cambio de formato del código.
--   Antes:  ot VARCHAR(50) UNIQUE  con valores "OT-INT-0001", "OT-INT-0002", ...
--   Ahora:  ot INTEGER (NULLable, NO único) en formato NNNNYY (correlativo*100 + año-2dig).
--           El código visible "OI000126" se construye en la app vía formatOtInternaCodigo().
--
-- Migración de datos: cualquier valor con formato "OT-INT-NNNN" se convierte a
-- NNNNYY usando el año de fecha_creacion. Los valores que NO matchean ese
-- formato quedan en NULL (caso de prueba — re-numerar manualmente si hay datos
-- reales con código legacy fuera del patrón).
--
-- También se agrega la columna `anio` (Int) denormalizada para filtrar por año
-- sin operación módulo en el WHERE, mismo patrón que orden_trabajo.

-- 1) Agregar columna nueva temporal `ot_new` (INTEGER nullable).
ALTER TABLE "orden_trabajo_interna" ADD COLUMN IF NOT EXISTS "ot_new" INTEGER;

-- 2) Migrar valores OT-INT-NNNN al formato NNNNYY usando el año de fecha_creacion.
--    EXTRACT(year FROM ...) devuelve 2026 → tomamos los últimos 2 dígitos (% 100).
UPDATE "orden_trabajo_interna"
SET "ot_new" = (
  CAST(SUBSTRING("ot" FROM 8) AS INTEGER) * 100
  + (EXTRACT(year FROM COALESCE(fecha_creacion, NOW()))::INTEGER % 100)
)
WHERE "ot" ~ '^OT-INT-[0-9]+$';

-- 3) Drop unique constraint + index sobre la columna vieja antes de eliminarla.
ALTER TABLE "orden_trabajo_interna" DROP CONSTRAINT IF EXISTS "orden_trabajo_interna_ot_key";
DROP INDEX IF EXISTS "orden_trabajo_interna_ot_key";

-- 4) Eliminar columna vieja y renombrar la nueva.
ALTER TABLE "orden_trabajo_interna" DROP COLUMN "ot";
ALTER TABLE "orden_trabajo_interna" RENAME COLUMN "ot_new" TO "ot";

-- 5) Agregar columna `anio` y derivar de `ot`.
ALTER TABLE "orden_trabajo_interna" ADD COLUMN IF NOT EXISTS "anio" INTEGER;
UPDATE "orden_trabajo_interna" SET "anio" = ("ot" % 100) WHERE "ot" IS NOT NULL;

-- 6) Índice para filtrar por año.
CREATE INDEX IF NOT EXISTS "orden_trabajo_interna_anio_idx" ON "orden_trabajo_interna"("anio");

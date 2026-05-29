-- Año (2 dígitos) de la OT, derivado de `ot % 100` (formato NNNNYY).
-- Denormalizado para filtrar el listado por año sin módulo en el where de Prisma.
ALTER TABLE "orden_trabajo" ADD COLUMN IF NOT EXISTS "anio" INTEGER;

-- Backfill de las OTs existentes.
UPDATE "orden_trabajo" SET "anio" = "ot" % 100 WHERE "ot" IS NOT NULL AND "anio" IS NULL;

CREATE INDEX IF NOT EXISTS "orden_trabajo_anio_idx" ON "orden_trabajo" ("anio");

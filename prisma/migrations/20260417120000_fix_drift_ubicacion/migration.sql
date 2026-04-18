-- Reconcile drift from manual SQL previously applied:
--  1) `equipo.ubicacion` (text) was dropped after migrating to the `ubicacion` catalog FK.
--  2) `ubicacion.activo` was altered to NULLABLE.
-- This migration makes the history match reality. Idempotent with IF EXISTS / DROP NOT NULL.

ALTER TABLE "equipo" DROP COLUMN IF EXISTS "ubicacion";

ALTER TABLE "ubicacion" ALTER COLUMN "activo" DROP NOT NULL;

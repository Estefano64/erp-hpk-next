-- Soft-delete para OrdenTrabajoInterna: `activo` (false = anulada/desactivada).
-- Las OT internas inactivas se ocultan de los listados; los datos se conservan.
ALTER TABLE "orden_trabajo_interna" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;

-- Soft-delete para OrdenTrabajo: `activo` (false = anulada/desactivada).
-- Las OTs inactivas se ocultan de los listados y su número queda libre
-- (el correlativo ignora las inactivas). Los datos se conservan.
ALTER TABLE "orden_trabajo" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;

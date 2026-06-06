-- Agrega flag boolean para marcar OTs internas que nacen de una solicitud
-- de mantenimiento (operativo que pide intervención). Default false.
ALTER TABLE "orden_trabajo_interna"
ADD COLUMN "solicitud_mantenimiento" BOOLEAN NOT NULL DEFAULT false;

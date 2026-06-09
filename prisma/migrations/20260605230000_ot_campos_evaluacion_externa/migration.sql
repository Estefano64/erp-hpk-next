-- Nuevos campos en OT externa para columnas pedidas por el user:
--   fecha_aprobacion_evaluacion + evaluacion_aprobado_por →
--     Tracking de la aprobacion INTERNA de la hoja de evaluacion (distinto
--     de `fecha_aprobacion` que es la aprobacion del CLIENTE sobre la
--     cotizacion).
--   reparacion_externa + vendor_externo →
--     Cuando el trabajo se hace en taller externo. `reparacion_externa`
--     default false (la mayoria son in-house); `vendor_externo` lleva el
--     nombre del proveedor cuando aplica.
ALTER TABLE "orden_trabajo"
ADD COLUMN "fecha_aprobacion_evaluacion" DATE,
ADD COLUMN "evaluacion_aprobado_por" VARCHAR(150),
ADD COLUMN "reparacion_externa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "vendor_externo" VARCHAR(150);

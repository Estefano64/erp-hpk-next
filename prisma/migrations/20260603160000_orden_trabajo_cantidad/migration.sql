-- Agrega `cantidad` a OrdenTrabajo. Aplica a los 3 tipos (REP/BIE/SER):
--   REP: cantidad de componentes a reparar (normalmente 1)
--   BIE: cantidad de unidades del bien a vender
--   SER: cantidad de unidades del servicio (ej. horas, intervenciones)
--
-- Default 1 para no romper OTs existentes y porque es el caso mayoritario.

ALTER TABLE "orden_trabajo"
  ADD COLUMN IF NOT EXISTS "cantidad" INTEGER NOT NULL DEFAULT 1;

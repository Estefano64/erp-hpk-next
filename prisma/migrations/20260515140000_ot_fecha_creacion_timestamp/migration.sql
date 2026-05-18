-- Pasar fecha_creacion de DATE a TIMESTAMP(3) para guardar hora del registro de creación.
-- Los valores existentes quedan en 00:00:00 — solo las OTs nuevas guardan hora real.

ALTER TABLE "orden_trabajo"
  ALTER COLUMN "fecha_creacion" TYPE TIMESTAMP(3) USING ("fecha_creacion"::TIMESTAMP(3));

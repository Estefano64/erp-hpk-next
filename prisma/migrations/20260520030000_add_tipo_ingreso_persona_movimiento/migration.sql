-- tipo_ingreso: clasificación del ingreso al almacén (BIEN / SERVICIO / CARGO_DIRECTO)
-- persona_recibe: a quién se le entregó el material en una SALIDA
ALTER TABLE "movimientos_inventario"
  ADD COLUMN IF NOT EXISTS "tipo_ingreso" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "persona_recibe" VARCHAR(150);

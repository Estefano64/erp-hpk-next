-- Agrega vínculo opcional Usuario ↔ Trabajador.
-- Las cuentas de sistema (admin, facturación, ventas) pueden quedar sin link.
-- El backfill por DNI se hace en un script aparte (no en la migration) para no
-- forzar matches incorrectos en datos inconsistentes.

ALTER TABLE "usuarios"
  ADD COLUMN "trabajador_id" INTEGER;

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_trabajador_id_fkey"
  FOREIGN KEY ("trabajador_id")
  REFERENCES "trabajador"("trabajador_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "usuarios_trabajador_id_key" ON "usuarios"("trabajador_id");

-- 1) Nuevos estados de Recursos para OTs con material parcial / en recepción.
--    El `codigo` es el FK estable usado por orden_trabajo.recursos_status_codigo.
INSERT INTO "recursos_status" ("codigo", "nombre", "activo")
VALUES
  ('Recursos en recepción', 'Recursos en recepción', true),
  ('Recursos incompletos', 'Recursos incompletos', true)
ON CONFLICT ("codigo") DO NOTHING;

-- 2) Ubicación física de la OT: se setea al recepcionar las POs (dónde quedó el
--    material). Nullable; FK a ubicacion.codigo (RESTRICT para no perder datos).
ALTER TABLE "orden_trabajo" ADD COLUMN "ubicacion_codigo" VARCHAR(10);

ALTER TABLE "orden_trabajo"
  ADD CONSTRAINT "orden_trabajo_ubicacion_codigo_fkey"
  FOREIGN KEY ("ubicacion_codigo") REFERENCES "ubicacion"("codigo")
  ON DELETE SET NULL ON UPDATE CASCADE;

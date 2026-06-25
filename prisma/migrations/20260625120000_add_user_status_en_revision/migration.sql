-- Agrega el código EN_REVISION a la tabla user_status.
--
-- El frontend del módulo OT Interna asigna este código al user_status_codigo
-- cuando se marca el checkbox "Solicitud de mantenimiento" al crear la OT.
-- Antes el código no existía → INSERT fallaba con FK violation:
--   orden_trabajo_interna_user_status_codigo_fkey.
--
-- Idempotente (ON CONFLICT DO NOTHING): se puede correr múltiples veces sin error.
INSERT INTO "user_status" ("codigo", "nombre", "activo") VALUES
  ('EN_REVISION', 'En revisión', true)
ON CONFLICT ("codigo") DO NOTHING;

-- Multi-rol: Usuario.rol (String) → Usuario.roles (String[]).
-- Copia el valor existente como primer (y único) elemento del array, luego
-- elimina la columna vieja. Idempotente: si ya existe `roles`, no rompe.

ALTER TABLE "usuarios" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill desde el campo viejo. Las filas con rol NULL se quedan como [].
UPDATE "usuarios" SET "roles" = ARRAY[rol] WHERE rol IS NOT NULL AND rol <> '';

ALTER TABLE "usuarios" DROP COLUMN "rol";

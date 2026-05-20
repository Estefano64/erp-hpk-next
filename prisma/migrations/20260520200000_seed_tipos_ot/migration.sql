-- Seed de los catálogos creados en Fase D0. Las migraciones D0/D1/D2 crearon
-- las tablas vacías; el seed.ts de Prisma solo se corre en local (`npm run db:seed`).
-- Esta migración inserta los valores en cualquier entorno (incluido Railway)
-- al hacer `prisma migrate deploy`. Idempotente vía ON CONFLICT DO NOTHING:
-- si los valores ya existen, no hace nada.

-- Tipo OT externa (Reparación / Bien / Servicio).
INSERT INTO "tipo_ot" ("codigo", "nombre", "activo") VALUES
  ('REP', 'Reparación', true),
  ('BIE', 'Bien', true),
  ('SER', 'Servicio', true)
ON CONFLICT ("codigo") DO NOTHING;

-- Tipo OT interna (Correctiva / Preventiva).
INSERT INTO "tipo_ot_interna" ("codigo", "nombre", "activo") VALUES
  ('CORRECTIVA', 'Correctiva', true),
  ('PREVENTIVA', 'Preventiva', true)
ON CONFLICT ("codigo") DO NOTHING;

-- User Status para OT interna.
INSERT INTO "user_status" ("codigo", "nombre", "activo") VALUES
  ('PLANIFICADO', 'Planificado', true),
  ('PROGRAMADO', 'Programado', true),
  ('CORRECTIVO', 'Correctivo', true),
  ('REPROGRAMADO', 'Reprogramado', true)
ON CONFLICT ("codigo") DO NOTHING;

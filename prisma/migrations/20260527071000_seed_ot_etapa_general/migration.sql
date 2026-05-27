-- Etapa "general" para adjuntos de OT Internas (mantenimiento preventivo/correctivo).
-- A diferencia de OT Externas, las internas no tienen flujo recepción→despacho;
-- todo cae bajo un único bucket "general".
INSERT INTO "ot_etapa" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
  ('general', 'General', 'Adjuntos de OT internas (mantenimiento preventivo/correctivo)', 10, true)
ON CONFLICT ("codigo") DO NOTHING;

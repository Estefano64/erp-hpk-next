-- Seed de etapas que faltaban en ot_etapa.
-- En BD había sólo: recepcion(1), evaluacion(2), termino(3), despacho(4).
-- El UI (OTAdjuntosTab) referenciaba "cotizacion" pero NUNCA existía en BD
-- — subir un adjunto en esa pestaña iba a fallar con FK constraint.
-- Esta migración inserta cotizacion y la nueva facturacion (orden ajustado
-- para que cotizacion vaya entre evaluacion y termino).
-- Idempotente: ON CONFLICT DO NOTHING.

INSERT INTO "ot_etapa" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
  ('cotizacion',  'Cotización',  'Cotización al cliente, propuestas comerciales y documentos relacionados', 3, true),
  ('facturacion', 'Facturación', 'Facturas emitidas al cliente y comprobantes de pago',                     6, true)
ON CONFLICT ("codigo") DO NOTHING;

-- Reordenar las existentes para mantener la secuencia lógica:
--   recepcion(1) → evaluacion(2) → cotizacion(3) → termino(4) → despacho(5) → facturacion(6).
UPDATE "ot_etapa" SET "orden" = 1 WHERE "codigo" = 'recepcion';
UPDATE "ot_etapa" SET "orden" = 2 WHERE "codigo" = 'evaluacion';
UPDATE "ot_etapa" SET "orden" = 4 WHERE "codigo" = 'termino';
UPDATE "ot_etapa" SET "orden" = 5 WHERE "codigo" = 'despacho';

-- Agrega la etapa "po_cliente" al catálogo ot_etapa. Va INMEDIATAMENTE
-- después de "cotizacion" en el orden visual de las pestañas de adjuntos.
--
-- Estado derivado en la tabla de OTs: una OT con al menos un adjunto en esta
-- etapa pasa de "Pdt de PO" a "Con PO" (no hay columna nueva en orden_trabajo;
-- el estado se calcula a partir de la existencia del adjunto).
--
-- Ordenamiento final:
--   recepcion(1) → evaluacion(2) → cotizacion(3) → po_cliente(4) →
--   termino(5) → despacho(6) → facturacion(7)

INSERT INTO "ot_etapa" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
  ('po_cliente', 'PO Cliente', 'Orden de compra (PO) emitida por el cliente — su carga marca la OT como "Con PO"', 4, true)
ON CONFLICT ("codigo") DO NOTHING;

-- Reordenar las etapas posteriores para dejar el 4 libre y mantener la secuencia.
UPDATE "ot_etapa" SET "orden" = 5 WHERE "codigo" = 'termino';
UPDATE "ot_etapa" SET "orden" = 6 WHERE "codigo" = 'despacho';
UPDATE "ot_etapa" SET "orden" = 7 WHERE "codigo" = 'facturacion';

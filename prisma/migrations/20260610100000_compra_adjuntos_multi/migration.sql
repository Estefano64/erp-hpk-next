-- Adjuntos múltiples por OC: una sola tabla `compra_adjunto` con tipo
-- ('guia' | 'factura' | 'pago'). Reemplaza el patrón legacy "una sola
-- guía/factura/pago" en compras.{guia,factura,pago}_*. Los campos legacy se
-- mantienen por compat con callers antiguos (se irán retirando).

CREATE TABLE "compra_adjunto" (
  "id"             SERIAL PRIMARY KEY,
  "compra_id"      INTEGER NOT NULL REFERENCES "compras"("id") ON DELETE CASCADE,
  "tipo"           VARCHAR(20) NOT NULL,
  "r2_key"         VARCHAR(500) NOT NULL,
  "nombre_archivo" VARCHAR(300) NOT NULL,
  "tipo_mime"      VARCHAR(100),
  "tamano"         INTEGER,
  "usuario_carga"  VARCHAR(150),
  "fecha_subida"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "compra_adjunto_compra_id_idx" ON "compra_adjunto"("compra_id");
CREATE INDEX "compra_adjunto_tipo_idx"      ON "compra_adjunto"("tipo");

-- Backfill: cada OC con guia_key/factura_key/pago_key existente se replica
-- como una fila de compra_adjunto del tipo correspondiente. Así el listado
-- nuevo arranca consistente con lo que ya estaba subido.
INSERT INTO "compra_adjunto" (compra_id, tipo, r2_key, nombre_archivo, tipo_mime, tamano, fecha_subida)
SELECT id, 'guia', guia_key, COALESCE(guia_nombre, 'guia'), guia_mime, guia_tamano, COALESCE(guia_fecha_subida, CURRENT_TIMESTAMP)
FROM "compras" WHERE guia_key IS NOT NULL;

INSERT INTO "compra_adjunto" (compra_id, tipo, r2_key, nombre_archivo, tipo_mime, tamano, fecha_subida)
SELECT id, 'factura', factura_key, COALESCE(factura_nombre, 'factura'), factura_mime, factura_tamano, COALESCE(factura_fecha_subida, CURRENT_TIMESTAMP)
FROM "compras" WHERE factura_key IS NOT NULL;

INSERT INTO "compra_adjunto" (compra_id, tipo, r2_key, nombre_archivo, tipo_mime, tamano, fecha_subida)
SELECT id, 'pago', pago_key, COALESCE(pago_nombre, 'pago'), pago_mime, pago_tamano, COALESCE(pago_fecha_subida, CURRENT_TIMESTAMP)
FROM "compras" WHERE pago_key IS NOT NULL;

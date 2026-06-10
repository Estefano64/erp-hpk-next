-- Compra "almacen abierto": OC del cliente que provee material a HP&K. Los
-- items no se reciben de una vez sino que se van consumiendo durante un
-- periodo. Los precios quedan congelados.
--
-- es_almacen_abierto: flag para identificar estas OCs especiales.
-- fecha_expiracion: cuando vence la OC (cliente debe enviar una nueva al
--                   siguiente periodo). Null en OCs normales.
ALTER TABLE "compras"
ADD COLUMN "es_almacen_abierto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fecha_expiracion" DATE;

CREATE INDEX "compras_es_almacen_abierto_idx" ON "compras"("es_almacen_abierto");

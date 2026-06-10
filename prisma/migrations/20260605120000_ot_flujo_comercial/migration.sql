-- Flujo comercial/logístico editable desde los sub-tabs de Adjuntos de la OT.
--   fecha_generacion_po : fecha en que se generó la PO del cliente (tab PO Cliente)
--   po_cliente_ok       : check de conformidad de la cotización aprobada (tab PO Cliente)
--   fecha_despacho      : fecha de despacho / salida del taller (tab Despacho)
--   empresa_recibe      : empresa que recibe el componente en el despacho (texto libre)
--
-- Todas nullable (po_cliente_ok con default false) para no romper OTs existentes.

ALTER TABLE "orden_trabajo"
  ADD COLUMN IF NOT EXISTS "fecha_generacion_po" DATE,
  ADD COLUMN IF NOT EXISTS "po_cliente_ok" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fecha_despacho" DATE,
  ADD COLUMN IF NOT EXISTS "empresa_recibe" VARCHAR(200);

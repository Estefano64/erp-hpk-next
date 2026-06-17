-- Override por OC: cuando se edita un item de OC en el editor (/compras/[id]/editar)
-- las modificaciones de descripción/cantidad/precio NO deben pisar el req original.
-- En su lugar persisten en columnas paralelas `oc_*` y el PDF/vista de la OC
-- las usan con fallback al valor original del req.
--
-- Las 4 columnas son nullable. Si están en NULL, el sistema usa el valor original
-- de la columna correspondiente (descripcion/cantidad/precio_unitario/unidad_medida).
-- Para items "libres" agregados desde la OC (es_adicional=true), las oc_* y las
-- originales son iguales (los originales se setean al crear).

ALTER TABLE "ot_repuestos"
  ADD COLUMN "oc_descripcion"     VARCHAR(500),
  ADD COLUMN "oc_cantidad"        DECIMAL(12, 4),
  ADD COLUMN "oc_precio_unitario" DECIMAL(15, 4),
  ADD COLUMN "oc_unidad_medida"   VARCHAR(20);

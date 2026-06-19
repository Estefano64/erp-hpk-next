-- Orden explícito por OC: la posición que el item ocupa en el editor de OC y
-- en el PDF. Es independiente de `item_req` (que pertenece al template del
-- req del técnico) — esta columna permite reordenar items en la OC sin
-- alterar la numeración del req original.
--
-- Al guardar desde /compras/[id]/editar se asigna oc_orden_item = índice+1
-- según la posición visual. Items sin esta columna (legacy o nunca editados)
-- ordenan por la cadena de fallback: nro_req → item_req → id.

ALTER TABLE "ot_repuestos"
  ADD COLUMN "oc_orden_item" INT;

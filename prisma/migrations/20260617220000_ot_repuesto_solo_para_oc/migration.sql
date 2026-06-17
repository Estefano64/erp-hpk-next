-- Items "libres" agregados desde el editor de OC (/compras/[id]/editar) NO
-- son requerimientos reales — solo existen para que figuren en el PDF de la OC.
-- Antes se creaban como OTRepuesto con es_adicional=true sin nro_req/item_req,
-- y aparecían como requerimientos huérfanos en /requerimientos, /detalle,
-- /despachos, etc. — ensuciando el flujo del técnico.
--
-- Nueva columna: solo_para_oc=true marca el item como "PDF-only". El editor
-- de OC y el PDF de OC los incluyen; el resto de vistas (req list, detalle,
-- despachos, aprobaciones, tabs de OT) los excluyen vía
-- `solo_para_oc != true OR solo_para_oc IS NULL`.

ALTER TABLE "ot_repuestos"
  ADD COLUMN "solo_para_oc" BOOLEAN DEFAULT false;

-- Backfill: items existentes que claramente vienen del editor de OC
--   - es_adicional=true (los creó el editor de OC, no el flujo de req normal)
--   - nro_req IS NULL (los reqs reales SIEMPRE tienen nro_req)
--   - po_id IS NOT NULL (están atados a una OC)
UPDATE "ot_repuestos"
   SET "solo_para_oc" = true
 WHERE "es_adicional" = true
   AND "nro_req" IS NULL
   AND "po_id" IS NOT NULL;

-- Comentario / recomendación que dejó el aprobador de la OC al aceptarla.
-- Antes solo quedaba en OTHistorial.datos_adicionales (json), por lo que no
-- se podía mostrar en columnas/popovers de la UI sin queries pesadas.
-- Ahora se persiste también en `compras.comentario_aprobacion` (espejo).
--
-- Es opcional — si el usuario no escribe nada al aceptar, queda en NULL.

ALTER TABLE "compras"
  ADD COLUMN IF NOT EXISTS "comentario_aprobacion" VARCHAR(500);

-- Backfill: extraer el comentario más reciente desde OTHistorial para las OCs
-- ya aceptadas antes de esta migración. La acción se identifica por el JSON
-- accion=ACEPTAR_OC en datos_adicionales. Se toma el evento más reciente por OC.
UPDATE "compras" c
   SET "comentario_aprobacion" = sub.comentario
  FROM (
    SELECT DISTINCT ON ((datos_adicionales::jsonb->>'po_id')::int)
           (datos_adicionales::jsonb->>'po_id')::int        AS po_id,
            datos_adicionales::jsonb->>'comentario'         AS comentario
      FROM "ot_historial"
     WHERE datos_adicionales::jsonb->>'accion' = 'ACEPTAR_OC'
       AND COALESCE(datos_adicionales::jsonb->>'comentario','') <> ''
     ORDER BY (datos_adicionales::jsonb->>'po_id')::int, id DESC
  ) AS sub
 WHERE c."id" = sub.po_id
   AND COALESCE(c."comentario_aprobacion", '') = '';

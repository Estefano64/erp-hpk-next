-- Fix data: para items MAC con material vinculado, replicar la descripción del
-- material en ot_repuestos.descripcion. Las plantillas viejas guardaban la
-- descripción genérica del cod_rep (ej. "Rep, acum direccion, NA, 930E-4SE")
-- en vez del nombre real del material.

UPDATE "ot_repuestos" AS r
SET    "descripcion" = m."descripcion"
FROM   "material" AS m
WHERE  r."material_id" = m."material_id"
  AND  r."tipo_codigo" = 'MAC'
  AND  m."descripcion" IS NOT NULL
  AND  m."descripcion" <> r."descripcion";

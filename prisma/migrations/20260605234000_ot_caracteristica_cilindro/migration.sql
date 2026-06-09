-- Campo nuevo `caracteristica_cilindro` en OT externa para guardar el
-- ESTANDAR / NO_ESTANDAR que viene del Excel "Data_data". Se mantiene
-- separado de `tipo_reparacion_codigo` (catalogo) porque son dimensiones
-- distintas: la pieza vs el tipo de trabajo. Acepta null.
ALTER TABLE "orden_trabajo"
ADD COLUMN "caracteristica_cilindro" VARCHAR(30);

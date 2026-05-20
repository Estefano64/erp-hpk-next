-- Mover el nombre del servicio a `descripcion` para que el catálogo solo muestre esa.
-- `nombre` queda mirroreado (no se puede dejar NULL por la constraint NOT NULL).
UPDATE servicio_reparacion
SET descripcion = nombre
WHERE descripcion IS NULL OR TRIM(descripcion) = '';

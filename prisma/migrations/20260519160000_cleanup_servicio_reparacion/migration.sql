-- Limpieza de servicio_reparacion: deduplicar.
-- En el dump viejo, el "nombre real" del servicio (Cromado, NDT, etc.) estaba en
-- la columna `descripcion`, mientras que `nombre` contenía la descripción del cod_rep.
-- Mantenemos UNA fila por nombre real, con código secuencial SRV-NNNN.

-- 1) Guardar nombres únicos en tabla temporal
CREATE TEMP TABLE _svc_unicos AS
SELECT DISTINCT TRIM(descripcion) AS nombre
FROM servicio_reparacion
WHERE descripcion IS NOT NULL AND TRIM(descripcion) <> '';

-- 2) Vaciar tabla y resetear secuencia
TRUNCATE TABLE servicio_reparacion RESTART IDENTITY;

-- 3) Insertar las únicas con código SRV-NNNN
INSERT INTO servicio_reparacion (codigo, nombre, descripcion, activo, created_at, updated_at)
SELECT
  'SRV-' || LPAD((ROW_NUMBER() OVER (ORDER BY nombre))::text, 4, '0'),
  nombre,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _svc_unicos;

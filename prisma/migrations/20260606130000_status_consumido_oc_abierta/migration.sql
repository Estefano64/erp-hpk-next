-- Nuevo status para el flujo "consumir desde OC almacén abierto" (ej.
-- material proveido por Quellaveco). Se distingue de CONSUMIDO_ALMACEN
-- (stock interno HP&K) y de ENTREGADO (llegó vía OC normal) para
-- trazabilidad en reportes.
INSERT INTO "status_oc" ("codigo", "nombre", "orden", "activo")
VALUES ('CONSUMIDO_OC_ABIERTA', 'Consumido de OC Abierta', 40, true)
ON CONFLICT ("codigo") DO NOTHING;

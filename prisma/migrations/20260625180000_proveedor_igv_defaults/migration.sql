-- Defaults adicionales por-proveedor para auto-rellenar el modal Crear OC.
--
-- Completan la migración previa 20260625150000_proveedor_defaults_oc.
-- Cuando un proveedor tiene NULL, /api/compras/crear-oc los persiste
-- automáticamente con los valores que el user usó en su primera OC
-- (autolearn por proveedor). Después se pueden editar manualmente desde
-- el formulario de Proveedor.
ALTER TABLE "proveedores"
  ADD COLUMN IF NOT EXISTS "precios_incluyen_igv_default" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "aplica_igv_default"           BOOLEAN;

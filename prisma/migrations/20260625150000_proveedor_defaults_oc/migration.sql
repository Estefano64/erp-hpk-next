-- Agrega defaults por-proveedor para auto-rellenar el formulario de crear OC.
--
-- Cuando el usuario elige un proveedor en el modal Crear OC (o en el editor
-- de OC), el frontend hace fetch a /api/proveedores/[id]/defaults-oc y
-- precarga los campos del form. Si los defaults están NULL, el endpoint
-- infiere del historial (última OC con ese proveedor).
--
-- Estos campos NO son obligatorios — el usuario los puede editar caso por
-- caso en el formulario de Proveedor (/clientes/proveedores).
ALTER TABLE "proveedores"
  ADD COLUMN IF NOT EXISTS "moneda_default"      VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "tipo_pago_default"   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "dias_credito_default" INT,
  ADD COLUMN IF NOT EXISTS "tiempo_entrega_dias"  INT;

-- AlterTable: agregar columna nombre a compras (opcional)
-- Sirve para identificar la OC de un vistazo: "OT-123 · Proveedor X"
ALTER TABLE "compras" ADD COLUMN "nombre" VARCHAR(300);

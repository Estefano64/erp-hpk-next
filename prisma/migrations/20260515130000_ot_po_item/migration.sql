-- Agregar campo "PO Item" a la OT (al lado de PO Cliente en el form de creación).
ALTER TABLE "orden_trabajo" ADD COLUMN "po_item" VARCHAR(100);

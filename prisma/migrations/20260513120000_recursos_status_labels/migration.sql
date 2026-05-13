-- Renombra los labels visibles ("nombre") de Recursos Status para clarificar a qué
-- refiere cada estado (RQ = requerimiento, PO = orden de compra). El `codigo` es el
-- FK estable y NO se modifica: todas las OT existentes que ya referencian a estos
-- estados siguen funcionando sin cambios.

UPDATE "recursos_status" SET "nombre" = 'En cotización de RQ' WHERE "codigo" = 'En cotización';
UPDATE "recursos_status" SET "nombre" = 'En aprobación de PO' WHERE "codigo" = 'En aprobación';
UPDATE "recursos_status" SET "nombre" = 'En revisión procesos' WHERE "codigo" = 'En revision procesos';

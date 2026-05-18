-- Ajustar colores del catálogo status_tarea según pedido del equipo.
-- Programado=verde, Realizado=azul, Correctivo=rojo, Cancelado=plomo, Abierto=amarillo.

UPDATE "status_tarea" SET "color" = 'warning' WHERE "codigo" = 'abierto';
UPDATE "status_tarea" SET "color" = 'success' WHERE "codigo" = 'programado';
UPDATE "status_tarea" SET "color" = 'blue'    WHERE "codigo" = 'realizado';
UPDATE "status_tarea" SET "color" = 'error'   WHERE "codigo" = 'correctivo';
UPDATE "status_tarea" SET "color" = 'default' WHERE "codigo" = 'cancelado';

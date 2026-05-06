-- Optimistic concurrency control for OrdenTrabajo
ALTER TABLE "orden_trabajo" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

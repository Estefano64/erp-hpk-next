-- Agregar columna activo a estrategia para soportar CRUD vía /api/catalogos.
ALTER TABLE "estrategia" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

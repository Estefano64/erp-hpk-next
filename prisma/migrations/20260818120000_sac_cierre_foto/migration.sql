-- Foto de evidencia opcional al cerrar una SAC (SIG-G-F-10).

-- AlterTable
ALTER TABLE "solicitud_accion_correctiva" ADD COLUMN "cierre_foto_key" VARCHAR(500);
ALTER TABLE "solicitud_accion_correctiva" ADD COLUMN "cierre_foto_nombre" VARCHAR(300);
ALTER TABLE "solicitud_accion_correctiva" ADD COLUMN "cierre_foto_mime" VARCHAR(100);
ALTER TABLE "solicitud_accion_correctiva" ADD COLUMN "cierre_foto_tamano" INTEGER;

-- Cierre "conforme" del reporte de mantenimiento correctivo (HPK-M-F-07):
-- comentario y foto de evidencia opcionales, en reemplazo de las firmas.

-- AlterTable
ALTER TABLE "reporte_correctivo" ADD COLUMN "comentario_cierre" TEXT;
ALTER TABLE "reporte_correctivo" ADD COLUMN "cierre_foto_key" VARCHAR(500);
ALTER TABLE "reporte_correctivo" ADD COLUMN "cierre_foto_nombre" VARCHAR(300);
ALTER TABLE "reporte_correctivo" ADD COLUMN "cierre_foto_mime" VARCHAR(100);
ALTER TABLE "reporte_correctivo" ADD COLUMN "cierre_foto_tamano" INTEGER;

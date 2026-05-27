-- Renombra las columnas que guardaban rutas locales (`/uploads/...`) a `*_key`,
-- que ahora contienen la object key de Cloudflare R2. Se usa RENAME COLUMN para
-- preservar cualquier dato existente y los constraints NOT NULL.
-- Los valores legacy (`/uploads/...`) quedan en las nuevas columnas y deberán
-- ser limpiados/migrados manualmente si el ambiente local tiene archivos viejos.

-- ot_adjunto: ruta -> r2_key (+ usuario_sube nuevo)
ALTER TABLE "ot_adjunto" RENAME COLUMN "ruta" TO "r2_key";
ALTER TABLE "ot_adjunto" ADD COLUMN "usuario_sube" VARCHAR(100);

-- ot_repuesto_adjunto: ruta -> r2_key
ALTER TABLE "ot_repuesto_adjunto" RENAME COLUMN "ruta" TO "r2_key";

-- compras: guia_archivo -> guia_key, factura_archivo -> factura_key (+ metadata)
ALTER TABLE "compras" RENAME COLUMN "guia_archivo" TO "guia_key";
ALTER TABLE "compras" RENAME COLUMN "factura_archivo" TO "factura_key";
ALTER TABLE "compras" ADD COLUMN "guia_mime" VARCHAR(100);
ALTER TABLE "compras" ADD COLUMN "guia_tamano" INTEGER;
ALTER TABLE "compras" ADD COLUMN "factura_mime" VARCHAR(100);
ALTER TABLE "compras" ADD COLUMN "factura_tamano" INTEGER;

-- evaluaciones_tecnicas: informe_archivo -> informe_key (+ metadata)
ALTER TABLE "evaluaciones_tecnicas" RENAME COLUMN "informe_archivo" TO "informe_key";
ALTER TABLE "evaluaciones_tecnicas" ADD COLUMN "informe_mime" VARCHAR(100);
ALTER TABLE "evaluaciones_tecnicas" ADD COLUMN "informe_tamano" INTEGER;

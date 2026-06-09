-- Agrega `material_codigo` a OT externa para vincular la OT a un material del
-- catalogo (opcional). Util para trazabilidad cuando el equipo reparado es a
-- la vez un material catalogado. ON UPDATE CASCADE refleja renames del codigo;
-- ON DELETE SET NULL evita borrar OTs si se elimina el material.
ALTER TABLE "orden_trabajo"
ADD COLUMN "material_codigo" VARCHAR(50);

ALTER TABLE "orden_trabajo"
ADD CONSTRAINT "orden_trabajo_material_codigo_fkey"
FOREIGN KEY ("material_codigo") REFERENCES "material"("codigo")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orden_trabajo_material_codigo_idx" ON "orden_trabajo"("material_codigo");

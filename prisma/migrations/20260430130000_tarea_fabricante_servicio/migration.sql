-- Agregar fabricante_codigo y servicio_codigo opcionales a Tarea (template)
ALTER TABLE "tarea" ADD COLUMN "fabricante_codigo" VARCHAR(20);
ALTER TABLE "tarea" ADD COLUMN "servicio_codigo" VARCHAR(20);

ALTER TABLE "tarea" ADD CONSTRAINT "tarea_fabricante_codigo_fkey"
  FOREIGN KEY ("fabricante_codigo") REFERENCES "fabricante"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

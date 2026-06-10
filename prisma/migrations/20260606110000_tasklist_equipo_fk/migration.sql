-- Agrega `equipo_codigo` (FK opcional) a `task_list` para amarrar cada
-- task list a un equipo del taller. ON DELETE SET NULL evita perder los
-- task lists si se borra un equipo; ON UPDATE CASCADE refleja renames.
ALTER TABLE "task_list"
ADD COLUMN "equipo_codigo" VARCHAR(50);

ALTER TABLE "task_list"
ADD CONSTRAINT "task_list_equipo_codigo_fkey"
FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "task_list_equipo_codigo_idx" ON "task_list"("equipo_codigo");

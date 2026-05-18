-- Agregar máquina/equipo asignado por default a Trabajador.
-- Sirve para autocompletar el campo "Máquina" al asignar tareas (editable después).

ALTER TABLE "trabajador" ADD COLUMN "equipo_codigo" VARCHAR(20);

CREATE INDEX "trabajador_equipo_codigo_idx" ON "trabajador"("equipo_codigo");

ALTER TABLE "trabajador"
  ADD CONSTRAINT "trabajador_equipo_codigo_fkey"
  FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo")
  ON UPDATE CASCADE ON DELETE SET NULL;

-- Seed inicial: asignaciones del Excel LISTA_DE_TRABAJADORES (9 trabajadores).
-- Se hace por DNI para evitar problemas con homónimos. Solo aplica si el trabajador existe.
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ002' WHERE "dni" = '71721540'; -- CARDENAS EGUILUZ → Banco de Pruebas 2
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ001' WHERE "dni" = '45278675'; -- YANA MENDOZA → Banco de Pruebas 1
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ019' WHERE "dni" = '29675751'; -- ANCO JIMENEZ → Torno JPMAQ
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ018' WHERE "dni" = '43767567'; -- LLAYQUE CCOATA → Torno TK1000
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ017' WHERE "dni" = '45451786'; -- RAMOS TICONA → Torno Niles
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ007' WHERE "dni" = '75157689'; -- HUAMANI CARCAUSTO → Fresadora Zayer
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ005' WHERE "dni" = '45500121'; -- GALLEGOS AQUINO → Bruñidora
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ013' WHERE "dni" = '4639857';  -- AROCUTIPA COPAJA → Lincoln XL
UPDATE "trabajador" SET "equipo_codigo" = 'MAQ014' WHERE "dni" = '76005163'; -- IBARRA ZAPANA → Lincoln XP

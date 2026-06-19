-- Normaliza actividad_codigo MP* → PM* en todas las tablas que usan códigos
-- de nivel de Mantenimiento Preventivo. Decisión del usuario: la convención
-- oficial es PM (Preventive Maintenance), el MP era inconsistencia legacy.
--
-- Cascada acumulativa: PM1 ⊂ PM2 ⊂ PM3 ⊂ PM4.

UPDATE "estrategia"
   SET "actividad_codigo" = 'PM' || SUBSTRING("actividad_codigo" FROM 3)
 WHERE "actividad_codigo" IN ('MP1', 'MP2', 'MP3', 'MP4');

UPDATE "tarea"
   SET "actividad_codigo" = 'PM' || SUBSTRING("actividad_codigo" FROM 3)
 WHERE "actividad_codigo" IN ('MP1', 'MP2', 'MP3', 'MP4');

UPDATE "task_list"
   SET "actividad_codigo" = 'PM' || SUBSTRING("actividad_codigo" FROM 3)
 WHERE "actividad_codigo" IN ('MP1', 'MP2', 'MP3', 'MP4');

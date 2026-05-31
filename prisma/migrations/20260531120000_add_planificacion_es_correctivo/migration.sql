-- Marca de emergencia/correctiva, separada del `estado` de ejecución.
ALTER TABLE "planificacion_ot" ADD COLUMN "es_correctivo" BOOLEAN NOT NULL DEFAULT false;

-- Migrar las tareas que hoy usan estado='correctivo' al nuevo esquema:
-- se marcan como correctivas y se les devuelve un estado de ejecución coherente.
-- (Los casos con sesiones se autocorrigen en el próximo pausar/finalizar vía rollup.)
UPDATE "planificacion_ot"
SET "es_correctivo" = true,
    "estado" = CASE WHEN "fecha_inicio" IS NOT NULL THEN 'programado' ELSE 'abierto' END
WHERE "estado" = 'correctivo';

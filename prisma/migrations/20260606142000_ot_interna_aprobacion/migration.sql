-- Aprobación manual de OT interna (flujo BORRADOR → SIN_APROBACION → APROBADA/RECHAZADA).
-- El creador envía a aprobación; otro usuario aprueba o rechaza.
ALTER TABLE "orden_trabajo_interna"
ADD COLUMN "aprobacion_status_codigo" VARCHAR(20) DEFAULT 'BORRADOR',
ADD COLUMN "fecha_envio_aprobacion"   TIMESTAMP(3),
ADD COLUMN "usuario_envia_aprobacion" VARCHAR(150),
ADD COLUMN "fecha_aprobacion"         TIMESTAMP(3),
ADD COLUMN "usuario_aprueba"          VARCHAR(150),
ADD COLUMN "comentario_aprobacion"    VARCHAR(500);

-- Backfill: las OTs creadas antes de este flujo no tienen marca; las
-- consideramos APROBADA (estado "pre-flujo") para no bloquear su ejecución.
UPDATE "orden_trabajo_interna"
SET "aprobacion_status_codigo" = 'APROBADA'
WHERE "aprobacion_status_codigo" IS NULL OR "aprobacion_status_codigo" = 'BORRADOR';

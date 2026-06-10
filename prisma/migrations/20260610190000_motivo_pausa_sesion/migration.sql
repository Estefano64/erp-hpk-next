-- Motivo categorizado de la pausa de una sesión de trabajo (catálogo fijo en
-- src/lib/motivos-pausa.ts). Convierte el texto libre de los técnicos en data
-- agregable (ej. horas perdidas por montacargas en la semana).
ALTER TABLE "planificacion_ot_sesion" ADD COLUMN "motivo_pausa" VARCHAR(30);

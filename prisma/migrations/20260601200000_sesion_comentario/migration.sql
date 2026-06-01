-- Comentario por sesión (lo que deja el técnico al pausar/terminar) para el historial.
ALTER TABLE "planificacion_ot_sesion" ADD COLUMN "comentario" VARCHAR(1000);

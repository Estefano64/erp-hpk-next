-- AlterTable: marca si la tarea/operación es derivada a un tercero (servicio externo).
ALTER TABLE "planificacion_ot" ADD COLUMN "trabajo_externo" BOOLEAN DEFAULT false;

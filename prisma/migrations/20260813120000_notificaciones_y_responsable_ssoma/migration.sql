-- Notificaciones in-app (campanita del header) + vínculo de la cuenta del
-- responsable en las acciones correctivas de SSOMA.

-- CreateTable
CREATE TABLE "notificacion" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "mensaje" VARCHAR(600),
    "url" VARCHAR(300),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha_lectura" TIMESTAMP(3),
    "creada_por" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_leida_idx" ON "notificacion"("usuario_id", "leida");

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_created_at_idx" ON "notificacion"("usuario_id", "created_at");

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "reporte_seguridad_accion" ADD COLUMN "responsable_usuario_id" INTEGER;

-- AlterTable
ALTER TABLE "sac_accion" ADD COLUMN "responsable_usuario_id" INTEGER;

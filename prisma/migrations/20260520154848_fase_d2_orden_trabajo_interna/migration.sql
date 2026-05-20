-- CreateTable
CREATE TABLE "orden_trabajo_interna" (
    "id" SERIAL NOT NULL,
    "ot" VARCHAR(50),
    "planta_codigo" VARCHAR(10),
    "equipo_codigo" VARCHAR(50),
    "tipo_ot_interna_codigo" VARCHAR(20),
    "descripcion" TEXT,
    "prioridad_atencion_codigo" VARCHAR(10),
    "usuario_crea" VARCHAR(100),
    "fecha_creacion" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "fecha_inicio_plan" TIMESTAMP(3),
    "fecha_fin_plan" TIMESTAMP(3),
    "semana_revision" VARCHAR(10),
    "fecha_inicio_real" TIMESTAMP(3),
    "fecha_fin_real" TIMESTAMP(3),
    "fecha_cierre" TIMESTAMP(3),
    "estrategia_id" INTEGER,
    "task_list" TEXT,
    "user_status_codigo" VARCHAR(20),
    "ot_status_codigo" VARCHAR(30),
    "recursos_status_codigo" VARCHAR(30),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "orden_trabajo_interna_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orden_trabajo_interna_ot_key" ON "orden_trabajo_interna"("ot");

-- CreateIndex
CREATE INDEX "orden_trabajo_interna_equipo_codigo_idx" ON "orden_trabajo_interna"("equipo_codigo");

-- CreateIndex
CREATE INDEX "orden_trabajo_interna_tipo_ot_interna_codigo_idx" ON "orden_trabajo_interna"("tipo_ot_interna_codigo");

-- CreateIndex
CREATE INDEX "orden_trabajo_interna_ot_status_codigo_idx" ON "orden_trabajo_interna"("ot_status_codigo");

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_estrategia_id_fkey" FOREIGN KEY ("estrategia_id") REFERENCES "estrategia"("estrategia_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_equipo_codigo_fkey" FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_ot_status_codigo_fkey" FOREIGN KEY ("ot_status_codigo") REFERENCES "ot_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_planta_codigo_fkey" FOREIGN KEY ("planta_codigo") REFERENCES "planta"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_prioridad_atencion_codigo_fkey" FOREIGN KEY ("prioridad_atencion_codigo") REFERENCES "prioridad_atencion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_recursos_status_codigo_fkey" FOREIGN KEY ("recursos_status_codigo") REFERENCES "recursos_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_tipo_ot_interna_codigo_fkey" FOREIGN KEY ("tipo_ot_interna_codigo") REFERENCES "tipo_ot_interna"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo_interna" ADD CONSTRAINT "orden_trabajo_interna_user_status_codigo_fkey" FOREIGN KEY ("user_status_codigo") REFERENCES "user_status"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

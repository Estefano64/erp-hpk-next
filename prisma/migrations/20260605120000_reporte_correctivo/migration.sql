-- CreateTable
CREATE TABLE "reporte_correctivo" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER,
    "anio" INTEGER,
    "equipo_codigo" VARCHAR(50) NOT NULL,
    "area_codigo" VARCHAR(10) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalle_falla" TEXT,
    "reportado_por" VARCHAR(150),
    "fecha_reporte" TIMESTAMP(3),
    "orden_trabajo_interna_id" INTEGER,
    "descripcion_correctivo" TEXT,
    "realizado_por" VARCHAR(150),
    "fecha_correctivo" TIMESTAMP(3),
    "responsable_area" VARCHAR(150),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'REPORTADO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporte_correctivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reporte_correctivo_equipo_codigo_idx" ON "reporte_correctivo"("equipo_codigo");

-- CreateIndex
CREATE INDEX "reporte_correctivo_anio_idx" ON "reporte_correctivo"("anio");

-- CreateIndex
CREATE INDEX "reporte_correctivo_estado_idx" ON "reporte_correctivo"("estado");

-- CreateIndex
CREATE INDEX "reporte_correctivo_orden_trabajo_interna_id_idx" ON "reporte_correctivo"("orden_trabajo_interna_id");

-- AddForeignKey
ALTER TABLE "reporte_correctivo" ADD CONSTRAINT "reporte_correctivo_equipo_codigo_fkey" FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_correctivo" ADD CONSTRAINT "reporte_correctivo_area_codigo_fkey" FOREIGN KEY ("area_codigo") REFERENCES "area"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_correctivo" ADD CONSTRAINT "reporte_correctivo_orden_trabajo_interna_id_fkey" FOREIGN KEY ("orden_trabajo_interna_id") REFERENCES "orden_trabajo_interna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

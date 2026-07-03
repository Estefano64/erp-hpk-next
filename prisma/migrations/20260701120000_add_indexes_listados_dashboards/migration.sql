-- Índices para los filtros/orden de listados y dashboards (perf).
-- Tablas grandes que hasta ahora hacían seq-scan: orden_trabajo (3000+ filas),
-- planificacion_ot (crece por tarea × OT), material, equipo, codigo_reparacion.

-- CreateIndex
CREATE INDEX "orden_trabajo_activo_fecha_recepcion_idx" ON "orden_trabajo"("activo", "fecha_recepcion");

-- CreateIndex
CREATE INDEX "orden_trabajo_ot_status_codigo_idx" ON "orden_trabajo"("ot_status_codigo");

-- CreateIndex
CREATE INDEX "orden_trabajo_id_cliente_idx" ON "orden_trabajo"("id_cliente");

-- CreateIndex
CREATE INDEX "orden_trabajo_ot_idx" ON "orden_trabajo"("ot");

-- CreateIndex
CREATE INDEX "planificacion_ot_semana_plan_idx" ON "planificacion_ot"("semana_plan");

-- CreateIndex
CREATE INDEX "planificacion_ot_tecnico_idx" ON "planificacion_ot"("tecnico");

-- CreateIndex
CREATE INDEX "planificacion_ot_fecha_inicio_idx" ON "planificacion_ot"("fecha_inicio");

-- CreateIndex
CREATE INDEX "material_activo_idx" ON "material"("activo");

-- CreateIndex
CREATE INDEX "material_categoria_codigo_idx" ON "material"("categoria_codigo");

-- CreateIndex
CREATE INDEX "material_clasificacion_codigo_idx" ON "material"("clasificacion_codigo");

-- CreateIndex
CREATE INDEX "material_planta_codigo_idx" ON "material"("planta_codigo");

-- CreateIndex
CREATE INDEX "equipo_activo_idx" ON "equipo"("activo");

-- CreateIndex
CREATE INDEX "equipo_status_codigo_idx" ON "equipo"("status_codigo");

-- CreateIndex
CREATE INDEX "equipo_area_codigo_idx" ON "equipo"("area_codigo");

-- CreateIndex
CREATE INDEX "equipo_tipo_codigo_idx" ON "equipo"("tipo_codigo");

-- CreateIndex
CREATE INDEX "equipo_planta_codigo_idx" ON "equipo"("planta_codigo");

-- CreateIndex
CREATE INDEX "codigo_reparacion_tipo_codigo_idx" ON "codigo_reparacion"("tipo_codigo");

-- CreateIndex
CREATE INDEX "codigo_reparacion_categoria_codigo_idx" ON "codigo_reparacion"("categoria_codigo");

-- CreateIndex
CREATE INDEX "codigo_reparacion_flota_codigo_idx" ON "codigo_reparacion"("flota_codigo");

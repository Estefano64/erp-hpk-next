-- Fase D1: clean slate de OTs antes de agregar tipo_codigo.
-- Decisión: el usuario confirmó que tanto local como producción son datos de
-- prueba; arrancar limpio simplifica el rollout (no requiere mapeo del campo
-- legacy `tipo` String → códigos REP/BIE/SER).
-- TRUNCATE CASCADE limpia orden_trabajo y todas las tablas que dependen vía FK:
--   ot_adjunto, ot_historial, ot_repuesto (+ ot_repuesto_adjunto),
--   planificacion_ot (+ planificacion_ot_captura), evaluacion_tecnica,
--   prestamo_herramienta, compras (+ compra_detalle).
-- Lo que NO se toca: catálogos maestros, materiales, equipos, clientes,
-- proveedores, movimientos_inventario (histórico contable), código_reparacion,
-- tareas, estrategias.
TRUNCATE TABLE "orden_trabajo" RESTART IDENTITY CASCADE;

-- AlterTable
ALTER TABLE "orden_trabajo" ADD COLUMN     "tipo_codigo" VARCHAR(10);

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_tipo_codigo_fkey" FOREIGN KEY ("tipo_codigo") REFERENCES "tipo_ot"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

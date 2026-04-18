-- DropForeignKey
ALTER TABLE "compras" DROP CONSTRAINT "compras_ot_id_fkey";

-- DropForeignKey
ALTER TABLE "orden_trabajo" DROP CONSTRAINT "orden_trabajo_id_cliente_fkey";

-- DropForeignKey
ALTER TABLE "ot_adjunto" DROP CONSTRAINT "ot_adjunto_orden_trabajo_id_fkey";

-- DropForeignKey
ALTER TABLE "ot_historial" DROP CONSTRAINT "ot_historial_ot_id_fkey";

-- DropForeignKey
ALTER TABLE "ot_repuestos" DROP CONSTRAINT "ot_repuestos_material_id_fkey";

-- DropForeignKey
ALTER TABLE "ot_repuestos" DROP CONSTRAINT "ot_repuestos_ot_id_fkey";

-- DropForeignKey
ALTER TABLE "planificacion_ot" DROP CONSTRAINT "planificacion_ot_ot_id_fkey";

-- DropForeignKey
ALTER TABLE "tarea" DROP CONSTRAINT "tarea_material_codigo_fkey";

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_material_codigo_fkey" FOREIGN KEY ("material_codigo") REFERENCES "material"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_trabajo" ADD CONSTRAINT "orden_trabajo_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "cliente"("cliente_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_adjunto" ADD CONSTRAINT "ot_adjunto_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "orden_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_historial" ADD CONSTRAINT "ot_historial_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "material"("material_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planificacion_ot" ADD CONSTRAINT "planificacion_ot_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

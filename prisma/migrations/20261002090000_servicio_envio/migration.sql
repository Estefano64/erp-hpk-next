-- Seguimiento de servicios externos (requerimientos tipo SER).
-- Envíos a proveedor (salida / cotización / devolución / llegada) + adjuntos,
-- y vínculo de items MAC/CAD agregados por el proveedor a su servicio padre.

-- AlterTable
ALTER TABLE "ot_repuestos" ADD COLUMN "servicio_padre_id" INTEGER;

-- CreateTable
CREATE TABLE "servicio_envio" (
    "id" SERIAL NOT NULL,
    "ot_repuesto_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "fecha_salida" DATE NOT NULL,
    "guia_salida" VARCHAR(100),
    "cotizacion_resultado" VARCHAR(20),
    "fecha_cotizacion" DATE,
    "nro_cotizacion" VARCHAR(100),
    "monto_cotizacion" DECIMAL(15,4),
    "moneda_cotizacion" VARCHAR(10),
    "fecha_devolucion" DATE,
    "guia_devolucion" VARCHAR(100),
    "fecha_llegada" DATE,
    "guia_llegada" VARCHAR(100),
    "recibido_por" VARCHAR(150),
    "nro_factura" VARCHAR(100),
    "observaciones" TEXT,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicio_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicio_envio_adjunto" (
    "id" SERIAL NOT NULL,
    "servicio_envio_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "r2_key" VARCHAR(500) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "usuario_sube" VARCHAR(100),
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicio_envio_adjunto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ot_repuestos_servicio_padre_id_idx" ON "ot_repuestos"("servicio_padre_id");
CREATE INDEX "servicio_envio_ot_repuesto_id_idx" ON "servicio_envio"("ot_repuesto_id");
CREATE INDEX "servicio_envio_proveedor_id_idx" ON "servicio_envio"("proveedor_id");
CREATE INDEX "servicio_envio_guia_salida_idx" ON "servicio_envio"("guia_salida");
CREATE INDEX "servicio_envio_adjunto_servicio_envio_id_idx" ON "servicio_envio_adjunto"("servicio_envio_id");
CREATE INDEX "servicio_envio_adjunto_tipo_idx" ON "servicio_envio_adjunto"("tipo");

-- AddForeignKey
ALTER TABLE "ot_repuestos" ADD CONSTRAINT "ot_repuestos_servicio_padre_id_fkey" FOREIGN KEY ("servicio_padre_id") REFERENCES "ot_repuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "servicio_envio" ADD CONSTRAINT "servicio_envio_ot_repuesto_id_fkey" FOREIGN KEY ("ot_repuesto_id") REFERENCES "ot_repuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "servicio_envio" ADD CONSTRAINT "servicio_envio_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "servicio_envio_adjunto" ADD CONSTRAINT "servicio_envio_adjunto_servicio_envio_id_fkey" FOREIGN KEY ("servicio_envio_id") REFERENCES "servicio_envio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

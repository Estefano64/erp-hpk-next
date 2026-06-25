-- CreateTable
CREATE TABLE "vehiculo" (
    "id" SERIAL NOT NULL,
    "item" INTEGER NOT NULL DEFAULT 0,
    "tipo" VARCHAR(30) NOT NULL,
    "marca" VARCHAR(50) NOT NULL,
    "modelo" VARCHAR(100) NOT NULL,
    "serie" VARCHAR(50) NOT NULL,
    "placa" VARCHAR(20) NOT NULL,
    "anio" INTEGER,
    "revision_tecnica_vencimiento" TIMESTAMP(3),
    "empresa_soat" VARCHAR(100),
    "soat_vencimiento" TIMESTAMP(3),
    "empresa_poliza" VARCHAR(100),
    "poliza_vencimiento" TIMESTAMP(3),
    "monto_poliza" DECIMAL(12,2),
    "almacen" VARCHAR(100),
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_serie_key" ON "vehiculo"("serie");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculo_placa_key" ON "vehiculo"("placa");

-- CreateIndex
CREATE INDEX "vehiculo_placa_idx" ON "vehiculo"("placa");

-- CreateIndex
CREATE INDEX "vehiculo_soat_vencimiento_idx" ON "vehiculo"("soat_vencimiento");

-- CreateIndex
CREATE INDEX "vehiculo_revision_tecnica_vencimiento_idx" ON "vehiculo"("revision_tecnica_vencimiento");

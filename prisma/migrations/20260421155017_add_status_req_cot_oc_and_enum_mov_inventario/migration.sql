-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateTable
CREATE TABLE "status_requerimiento" (
    "status_requerimiento_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "orden" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_requerimiento_pkey" PRIMARY KEY ("status_requerimiento_id")
);

-- CreateTable
CREATE TABLE "status_cotizacion" (
    "status_cotizacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "orden" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_cotizacion_pkey" PRIMARY KEY ("status_cotizacion_id")
);

-- CreateTable
CREATE TABLE "status_oc" (
    "status_oc_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "orden" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_oc_pkey" PRIMARY KEY ("status_oc_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_requerimiento_codigo_key" ON "status_requerimiento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "status_cotizacion_codigo_key" ON "status_cotizacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "status_oc_codigo_key" ON "status_oc"("codigo");

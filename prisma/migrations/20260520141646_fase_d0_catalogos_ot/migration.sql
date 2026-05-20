-- CreateTable
CREATE TABLE "tipo_ot" (
    "tipo_ot_id" SERIAL NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_ot_pkey" PRIMARY KEY ("tipo_ot_id")
);

-- CreateTable
CREATE TABLE "tipo_ot_interna" (
    "tipo_ot_interna_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_ot_interna_pkey" PRIMARY KEY ("tipo_ot_interna_id")
);

-- CreateTable
CREATE TABLE "user_status" (
    "user_status_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_status_pkey" PRIMARY KEY ("user_status_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_ot_codigo_key" ON "tipo_ot"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_ot_interna_codigo_key" ON "tipo_ot_interna"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "user_status_codigo_key" ON "user_status"("codigo");

-- RenameIndex
ALTER INDEX "cotizacion_proveedor_material_proveedor_key" RENAME TO "cotizacion_proveedor_material_id_proveedor_id_key";

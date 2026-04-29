-- CreateTable
CREATE TABLE "configuracion_cotizacion" (
    "id" SERIAL NOT NULL,
    "tarifa_hora_usd" DECIMAL(10,2) NOT NULL DEFAULT 25,
    "tarifa_hora_sol" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "moneda_default_codigo" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "igv_porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(100),

    CONSTRAINT "configuracion_cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajador" (
    "trabajador_id" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "dni" VARCHAR(20),
    "area" VARCHAR(50) NOT NULL,
    "puesto" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabajador_pkey" PRIMARY KEY ("trabajador_id")
);

-- CreateIndex
CREATE INDEX "trabajador_dni_idx" ON "trabajador"("dni");

-- CreateIndex
CREATE INDEX "trabajador_area_idx" ON "trabajador"("area");

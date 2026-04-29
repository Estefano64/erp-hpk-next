-- CreateTable
CREATE TABLE "componente" (
    "componente_id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "componente_pkey" PRIMARY KEY ("componente_id")
);

-- CreateTable
CREATE TABLE "operacion_reparacion" (
    "operacion_reparacion_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "componente_codigo" VARCHAR(30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacion_reparacion_pkey" PRIMARY KEY ("operacion_reparacion_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "componente_codigo_key" ON "componente"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "operacion_reparacion_codigo_key" ON "operacion_reparacion"("codigo");

-- AddForeignKey
ALTER TABLE "operacion_reparacion" ADD CONSTRAINT "operacion_reparacion_componente_codigo_fkey" FOREIGN KEY ("componente_codigo") REFERENCES "componente"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "operacion_cod_rep" (
    "operacion_cod_rep_id" SERIAL NOT NULL,
    "cod_rep_codigo" VARCHAR(50) NOT NULL,
    "componente_codigo" VARCHAR(30) NOT NULL,
    "operacion_reparacion_codigo" VARCHAR(20),
    "trabajo" VARCHAR(200) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "horas" DECIMAL(6,2),
    "hh" DECIMAL(6,2),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacion_cod_rep_pkey" PRIMARY KEY ("operacion_cod_rep_id")
);

-- CreateIndex
CREATE INDEX "operacion_cod_rep_cod_rep_codigo_idx" ON "operacion_cod_rep"("cod_rep_codigo");

-- CreateIndex
CREATE INDEX "operacion_cod_rep_componente_codigo_idx" ON "operacion_cod_rep"("componente_codigo");

-- AddForeignKey
ALTER TABLE "operacion_cod_rep" ADD CONSTRAINT "operacion_cod_rep_cod_rep_codigo_fkey" FOREIGN KEY ("cod_rep_codigo") REFERENCES "codigo_reparacion"("codigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_cod_rep" ADD CONSTRAINT "operacion_cod_rep_componente_codigo_fkey" FOREIGN KEY ("componente_codigo") REFERENCES "componente"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacion_cod_rep" ADD CONSTRAINT "operacion_cod_rep_operacion_reparacion_codigo_fkey" FOREIGN KEY ("operacion_reparacion_codigo") REFERENCES "operacion_reparacion"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

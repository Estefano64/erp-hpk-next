-- CreateTable
CREATE TABLE "prestamos_herramientas" (
    "id" SERIAL NOT NULL,
    "herramienta_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "prestado_a" VARCHAR(100) NOT NULL,
    "ot_id" INTEGER,
    "fecha_entrega" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_devolucion_prevista" DATE,
    "fecha_devolucion_real" DATE,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PRESTADA',
    "observaciones" TEXT,
    "usuario_entrega" VARCHAR(100) NOT NULL,
    "usuario_recibe" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestamos_herramientas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prestamos_herramientas_herramienta_id_idx" ON "prestamos_herramientas"("herramienta_id");

-- CreateIndex
CREATE INDEX "prestamos_herramientas_estado_idx" ON "prestamos_herramientas"("estado");

-- CreateIndex
CREATE INDEX "prestamos_herramientas_ot_id_idx" ON "prestamos_herramientas"("ot_id");

-- AddForeignKey
ALTER TABLE "prestamos_herramientas" ADD CONSTRAINT "prestamos_herramientas_herramienta_id_fkey" FOREIGN KEY ("herramienta_id") REFERENCES "herramientas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestamos_herramientas" ADD CONSTRAINT "prestamos_herramientas_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "orden_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

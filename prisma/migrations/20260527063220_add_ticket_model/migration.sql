-- CreateTable
CREATE TABLE "ticket" (
    "id" SERIAL NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    "captura_key" VARCHAR(500),
    "captura_nombre" VARCHAR(300),
    "captura_mime" VARCHAR(100),
    "captura_tamano" INTEGER,
    "creado_por" VARCHAR(100) NOT NULL,
    "asignado_a" VARCHAR(100),
    "notas_resolucion" TEXT,
    "resuelto_por" VARCHAR(100),
    "fecha_resolucion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_estado_idx" ON "ticket"("estado");

-- CreateIndex
CREATE INDEX "ticket_creado_por_idx" ON "ticket"("creado_por");

-- CreateIndex
CREATE INDEX "ticket_created_at_idx" ON "ticket"("created_at");

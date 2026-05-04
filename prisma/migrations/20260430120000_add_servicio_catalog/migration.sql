-- Catálogo de servicios (autocomplete cuando tipo=SER en requerimientos)
CREATE TABLE "servicio" (
    "servicio_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "servicio_pkey" PRIMARY KEY ("servicio_id")
);

CREATE UNIQUE INDEX "servicio_codigo_key" ON "servicio"("codigo");

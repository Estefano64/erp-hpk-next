-- DropForeignKey
ALTER TABLE "estrategia" DROP CONSTRAINT "estrategia_equipo_codigo_fkey";

-- AlterTable
ALTER TABLE "estrategia" ADD COLUMN     "conjunto_codigo" VARCHAR(20),
ALTER COLUMN "equipo_codigo" DROP NOT NULL;

-- CreateTable
CREATE TABLE "conjunto_mantenimiento" (
    "conjunto_mantenimiento_id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(200),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conjunto_mantenimiento_pkey" PRIMARY KEY ("conjunto_mantenimiento_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conjunto_mantenimiento_codigo_key" ON "conjunto_mantenimiento"("codigo");

-- CreateIndex
CREATE INDEX "estrategia_equipo_codigo_idx" ON "estrategia"("equipo_codigo");

-- CreateIndex
CREATE INDEX "estrategia_conjunto_codigo_idx" ON "estrategia"("conjunto_codigo");

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_equipo_codigo_fkey" FOREIGN KEY ("equipo_codigo") REFERENCES "equipo"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estrategia" ADD CONSTRAINT "estrategia_conjunto_codigo_fkey" FOREIGN KEY ("conjunto_codigo") REFERENCES "conjunto_mantenimiento"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

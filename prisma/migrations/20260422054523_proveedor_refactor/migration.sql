/*
  Warnings:

  - You are about to drop the column `createdAt` on the `proveedores` table. All the data in the column will be lost.
  - You are about to drop the column `estado` on the `proveedores` table. All the data in the column will be lost.
  - You are about to drop the column `razonSocial` on the `proveedores` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `proveedores` table. All the data in the column will be lost.
  - Added the required column `razon_social` to the `proveedores` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "proveedores" DROP COLUMN "createdAt",
DROP COLUMN "estado",
DROP COLUMN "razonSocial",
DROP COLUMN "updatedAt",
ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombre_comercial" VARCHAR(200),
ADD COLUMN     "razon_social" VARCHAR(200) NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "usuario_actualiza" VARCHAR(100),
ADD COLUMN     "usuario_crea" VARCHAR(100),
ALTER COLUMN "contacto" DROP NOT NULL,
ALTER COLUMN "telefono" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

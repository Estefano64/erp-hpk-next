-- CreateTable
CREATE TABLE "task_list" (
    "id" SERIAL NOT NULL,
    "maquina_taller" VARCHAR(150) NOT NULL,
    "actividad_codigo" VARCHAR(20) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "usuario_responsable" VARCHAR(100),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_list_item" (
    "id" SERIAL NOT NULL,
    "task_list_id" INTEGER NOT NULL,
    "item" INTEGER NOT NULL,
    "tipo" VARCHAR(10) NOT NULL,
    "material_codigo" VARCHAR(50),
    "ref_descripcion" TEXT,
    "np" VARCHAR(150),
    "requerimiento" DECIMAL(12,3),
    "um" VARCHAR(20),
    "texto" TEXT,
    "precio" DECIMAL(15,4),

    CONSTRAINT "task_list_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_list_maquina_taller_idx" ON "task_list"("maquina_taller");

-- CreateIndex
CREATE INDEX "task_list_actividad_codigo_idx" ON "task_list"("actividad_codigo");

-- CreateIndex
CREATE INDEX "task_list_item_task_list_id_idx" ON "task_list_item"("task_list_id");

-- CreateIndex
CREATE INDEX "task_list_item_material_codigo_idx" ON "task_list_item"("material_codigo");

-- AddForeignKey
ALTER TABLE "task_list_item" ADD CONSTRAINT "task_list_item_task_list_id_fkey" FOREIGN KEY ("task_list_id") REFERENCES "task_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_list_item" ADD CONSTRAINT "task_list_item_material_codigo_fkey" FOREIGN KEY ("material_codigo") REFERENCES "material"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

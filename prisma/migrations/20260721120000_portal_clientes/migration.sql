-- Portal de clientes (fase 1):
--   - usuarios.cliente_id: cuenta con rol "cliente" vinculada a una empresa.
--   - orden_trabajo.visible_portal: opt-in de publicación por OT (default oculto).
ALTER TABLE "usuarios" ADD COLUMN "cliente_id" INTEGER;
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "cliente"("cliente_id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "usuarios_cliente_id_idx" ON "usuarios"("cliente_id");

ALTER TABLE "orden_trabajo" ADD COLUMN "visible_portal" BOOLEAN NOT NULL DEFAULT false;

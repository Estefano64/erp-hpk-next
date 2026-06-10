-- Detalle + descripción adicionales en flujos de aprobación.
-- Hasta ahora el aprobador solo dejaba `comentario_aprobacion` (max 500).
-- Pedido del user: separar en 3 campos
--   descripcion_aprobacion  → resumen corto (etiqueta visible en listados)
--   detalle_aprobacion      → texto largo (motivo, contexto, instrucciones)
--   comentario_aprobacion   → ya existente (queda como nota libre)
-- Aplica tanto a aprobaciones de Compra (OC) como de OTRepuesto (req).

ALTER TABLE "compras"
  ADD COLUMN "descripcion_aprobacion" VARCHAR(300),
  ADD COLUMN "detalle_aprobacion"     TEXT;

ALTER TABLE "ot_repuestos"
  ADD COLUMN "descripcion_aprobacion" VARCHAR(300),
  ADD COLUMN "detalle_aprobacion"     TEXT;

-- Liberación multi-nivel de documentos (estrategia A/B/C, 2026-08-11).
-- Firmas de niveles de liberación sobre OCs (compras) y requerimientos
-- (ot_repuestos). Solo firmas: los niveles requeridos se calculan en la app
-- desde el monto (Werteschema).

CREATE TABLE "liberacion_codigo" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER,
    "ot_repuesto_id" INTEGER,
    "nivel" VARCHAR(5) NOT NULL,
    "liberado_por" VARCHAR(100) NOT NULL,
    "fecha_liberacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentario" VARCHAR(500),
    "monto_usd" DECIMAL(14,2),

    CONSTRAINT "liberacion_codigo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "liberacion_codigo_compra_id_nivel_key" ON "liberacion_codigo"("compra_id", "nivel");
CREATE UNIQUE INDEX "liberacion_codigo_ot_repuesto_id_nivel_key" ON "liberacion_codigo"("ot_repuesto_id", "nivel");
CREATE INDEX "liberacion_codigo_ot_repuesto_id_idx" ON "liberacion_codigo"("ot_repuesto_id");

ALTER TABLE "liberacion_codigo"
    ADD CONSTRAINT "liberacion_codigo_compra_id_fkey"
    FOREIGN KEY ("compra_id") REFERENCES "compras"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "liberacion_codigo"
    ADD CONSTRAINT "liberacion_codigo_ot_repuesto_id_fkey"
    FOREIGN KEY ("ot_repuesto_id") REFERENCES "ot_repuestos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

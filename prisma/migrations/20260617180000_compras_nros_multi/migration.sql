-- Multi-valor en nro_guia / nro_factura de OC: el user pidió poder agregar
-- varios números separados por coma ("11111111, 2222222") sin que uno
-- sobrescriba al otro. La columna ya es VarChar pero el límite de 100 era
-- corto para varios números — la subimos a 500. La UI usa comma-separated
-- y el editor cambia a un Select mode="tags" para componer la lista.

ALTER TABLE "compras"
  ALTER COLUMN "nro_guia"    TYPE VARCHAR(500),
  ALTER COLUMN "nro_factura" TYPE VARCHAR(500);

-- Quién recibió el material en el despacho al técnico/OT. Antes solo quedaba
-- como texto libre en ot_repuestos.observaciones ("... — recibe: NOMBRE") y
-- en movimientos_inventario.persona_recibe. Columna aditiva, sin default.
ALTER TABLE "ot_repuestos" ADD COLUMN "persona_recibe" VARCHAR(150);

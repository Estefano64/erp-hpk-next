-- Split `servicio` into two specialized tables: servicio_reparacion (REP) y servicio_mantenimiento (MNT).
-- Data is migrated based on the tipo column populated previously.

CREATE TABLE "servicio_reparacion" (
  "servicio_reparacion_id" SERIAL PRIMARY KEY,
  "codigo"      VARCHAR(20) NOT NULL UNIQUE,
  "nombre"      VARCHAR(300) NOT NULL,
  "descripcion" TEXT,
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "servicio_mantenimiento" (
  "servicio_mantenimiento_id" SERIAL PRIMARY KEY,
  "codigo"      VARCHAR(20) NOT NULL UNIQUE,
  "nombre"      VARCHAR(300) NOT NULL,
  "descripcion" TEXT,
  "activo"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copiar datos según tipo
INSERT INTO servicio_reparacion (codigo, nombre, descripcion, activo, created_at, updated_at)
SELECT codigo, nombre, descripcion, activo, created_at, updated_at FROM servicio WHERE tipo = 'REP';

INSERT INTO servicio_mantenimiento (codigo, nombre, descripcion, activo, created_at, updated_at)
SELECT codigo, nombre, descripcion, activo, created_at, updated_at FROM servicio WHERE tipo = 'MNT';

-- Drop tabla antigua
DROP TABLE "servicio";

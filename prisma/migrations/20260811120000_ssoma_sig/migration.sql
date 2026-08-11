-- Módulo SSOMA - SIG (2026-08-11)
--   - reporte_seguridad (+ acciones + fotos)  ← formato HPK-S-F-03
--   - salida_no_conforme (+ fotos)            ← formato HPK-SIG-F-05
--   - solicitud_accion_correctiva (+ acciones)← formato SIG-G-F-10 (SAC)

-- ── Reporte de Seguridad ────────────────────────────────────────
CREATE TABLE "reporte_seguridad" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER,
    "anio" INTEGER,
    "lugar" VARCHAR(200),
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hora" VARCHAR(10),
    "tipo" VARCHAR(30),
    "reportado_por" VARCHAR(150),
    "cargo" VARCHAR(100),
    "danos_potenciales" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "descripcion" TEXT,
    "supervisor_ssoma" VARCHAR(150),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    "aprobado_por" VARCHAR(150),
    "fecha_aprobacion" TIMESTAMP(3),
    "comentario_aprobacion" TEXT,
    "cerrado_por" VARCHAR(150),
    "fecha_cierre" TIMESTAMP(3),
    "comentario_cierre" TEXT,
    "cierre_foto_key" VARCHAR(500),
    "cierre_foto_nombre" VARCHAR(300),
    "cierre_foto_mime" VARCHAR(100),
    "cierre_foto_tamano" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporte_seguridad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reporte_seguridad_anio_idx" ON "reporte_seguridad"("anio");
CREATE INDEX "reporte_seguridad_estado_idx" ON "reporte_seguridad"("estado");
CREATE INDEX "reporte_seguridad_created_at_idx" ON "reporte_seguridad"("created_at");

CREATE TABLE "reporte_seguridad_accion" (
    "id" SERIAL NOT NULL,
    "reporte_seguridad_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "descripcion" TEXT NOT NULL,
    "responsable" VARCHAR(150),
    "fecha_cumplimiento" DATE,

    CONSTRAINT "reporte_seguridad_accion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reporte_seguridad_accion_reporte_seguridad_id_idx" ON "reporte_seguridad_accion"("reporte_seguridad_id");

ALTER TABLE "reporte_seguridad_accion"
    ADD CONSTRAINT "reporte_seguridad_accion_reporte_seguridad_id_fkey"
    FOREIGN KEY ("reporte_seguridad_id") REFERENCES "reporte_seguridad"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reporte_seguridad_foto" (
    "id" SERIAL NOT NULL,
    "reporte_seguridad_id" INTEGER NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "r2_key" VARCHAR(500) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_sube" VARCHAR(100),

    CONSTRAINT "reporte_seguridad_foto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reporte_seguridad_foto_reporte_seguridad_id_idx" ON "reporte_seguridad_foto"("reporte_seguridad_id");

ALTER TABLE "reporte_seguridad_foto"
    ADD CONSTRAINT "reporte_seguridad_foto_reporte_seguridad_id_fkey"
    FOREIGN KEY ("reporte_seguridad_id") REFERENCES "reporte_seguridad"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Salida No Conforme ──────────────────────────────────────────
CREATE TABLE "salida_no_conforme" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER,
    "anio" INTEGER,
    "fecha" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "area" VARCHAR(100),
    "descripcion" TEXT,
    "reportado_por" VARCHAR(150),
    "area_reportante" VARCHAR(100),
    "accion_tomada" TEXT,
    "generado_por" VARCHAR(150),
    "responsable_salida" VARCHAR(150),
    "requiere_sac" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    "cerrado_por" VARCHAR(150),
    "fecha_cierre" TIMESTAMP(3),
    "comentario_cierre" TEXT,
    "cierre_foto_key" VARCHAR(500),
    "cierre_foto_nombre" VARCHAR(300),
    "cierre_foto_mime" VARCHAR(100),
    "cierre_foto_tamano" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salida_no_conforme_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salida_no_conforme_anio_idx" ON "salida_no_conforme"("anio");
CREATE INDEX "salida_no_conforme_estado_idx" ON "salida_no_conforme"("estado");
CREATE INDEX "salida_no_conforme_created_at_idx" ON "salida_no_conforme"("created_at");

CREATE TABLE "salida_no_conforme_foto" (
    "id" SERIAL NOT NULL,
    "salida_no_conforme_id" INTEGER NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "r2_key" VARCHAR(500) NOT NULL,
    "tipo_mime" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_sube" VARCHAR(100),

    CONSTRAINT "salida_no_conforme_foto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salida_no_conforme_foto_salida_no_conforme_id_idx" ON "salida_no_conforme_foto"("salida_no_conforme_id");

ALTER TABLE "salida_no_conforme_foto"
    ADD CONSTRAINT "salida_no_conforme_foto_salida_no_conforme_id_fkey"
    FOREIGN KEY ("salida_no_conforme_id") REFERENCES "salida_no_conforme"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Solicitud de Acciones Correctivas (SAC) ─────────────────────
CREATE TABLE "solicitud_accion_correctiva" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER,
    "anio" INTEGER,
    "salida_no_conforme_id" INTEGER,
    "tipo_desviacion" VARCHAR(30),
    "fuente" VARCHAR(30),
    "fuente_otros" VARCHAR(200),
    "sistemas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "descripcion" TEXT,
    "norma_requisito" TEXT,
    "documento_referencia" TEXT,
    "proceso_responsable" VARCHAR(200),
    "identificado_por" VARCHAR(150),
    "fecha_identificacion" DATE,
    "correccion_inmediata" TEXT,
    "analisis_causa_raiz" TEXT,
    "responsable_cierre" VARCHAR(150),
    "fecha_cierre_programada" DATE,
    "verificacion_eficacia" TEXT,
    "verificado_por" VARCHAR(150),
    "fecha_verificacion" DATE,
    "genera_riesgo" BOOLEAN,
    "riesgo_identificado" TEXT,
    "proceso_afectado" VARCHAR(200),
    "accion_riesgo" TEXT,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    "cerrado_por" VARCHAR(150),
    "fecha_cierre" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_crea" VARCHAR(100),
    "usuario_actualiza" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_accion_correctiva_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitud_accion_correctiva_anio_idx" ON "solicitud_accion_correctiva"("anio");
CREATE INDEX "solicitud_accion_correctiva_estado_idx" ON "solicitud_accion_correctiva"("estado");
CREATE INDEX "solicitud_accion_correctiva_salida_no_conforme_id_idx" ON "solicitud_accion_correctiva"("salida_no_conforme_id");
CREATE INDEX "solicitud_accion_correctiva_created_at_idx" ON "solicitud_accion_correctiva"("created_at");

ALTER TABLE "solicitud_accion_correctiva"
    ADD CONSTRAINT "solicitud_accion_correctiva_salida_no_conforme_id_fkey"
    FOREIGN KEY ("salida_no_conforme_id") REFERENCES "salida_no_conforme"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sac_accion" (
    "id" SERIAL NOT NULL,
    "sac_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "descripcion" TEXT NOT NULL,
    "responsable" VARCHAR(150),
    "fecha" DATE,

    CONSTRAINT "sac_accion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sac_accion_sac_id_idx" ON "sac_accion"("sac_id");

ALTER TABLE "sac_accion"
    ADD CONSTRAINT "sac_accion_sac_id_fkey"
    FOREIGN KEY ("sac_id") REFERENCES "solicitud_accion_correctiva"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

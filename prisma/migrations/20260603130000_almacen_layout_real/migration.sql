-- Reemplaza el seed genérico de zonas/posiciones del almacén HP&K Arequipa
-- por el layout REAL (Excel UBICACIONES… provisto el 2026-06-01):
--   HER  Herramientas — 5 estantes × 4 niveles = 20 posiciones (A1-A4, B1-B4, ... E1-E4)
--   SUM  Suministros  — 5 estantes × 4 niveles = 20 posiciones (A1-A4, B1-B4, ... E1-E4)
--   REP  Repuestos    — 10 estantes × 3 niveles = 30 posiciones (A1-A3, ... J1-J3)
--   STO  Stock        — 25 posiciones (A1-A7, B1-B7, C1-C7, D1-D4)
--
-- La zona "HERR_SUM" (combinada) se desdobla en HER + SUM, "OTS" se renombra
-- a REP, "STOCK" se renombra a STO. Las posiciones genéricas A1-A10 sembradas
-- en la migración anterior se eliminan SOLO si nadie las referencia todavía.

-- ── 1) Renombrar zonas existentes ────────────────────────────────────
UPDATE "almacen_zona"
   SET "codigo" = 'HER',
       "nombre" = 'Herramientas',
       "descripcion" = 'Estantes de herramientas del taller (A1-E4)',
       "orden" = 1
 WHERE "codigo" = 'HERR_SUM';

UPDATE "almacen_zona"
   SET "codigo" = 'REP',
       "nombre" = 'Repuestos',
       "descripcion" = 'Estantes de repuestos por OT (A1-J3)',
       "orden" = 3
 WHERE "codigo" = 'OTS';

UPDATE "almacen_zona"
   SET "codigo" = 'STO',
       "nombre" = 'Stock',
       "descripcion" = 'Stock disponible para uso general (A1-D4)',
       "orden" = 4
 WHERE "codigo" = 'STOCK';

-- ── 2) Nueva zona SUM (Suministros, antes mezclada en HERR_SUM) ──────
INSERT INTO "almacen_zona" ("codigo", "nombre", "descripcion", "orden")
VALUES ('SUM', 'Suministros', 'Estantes de suministros y consumibles del taller (A1-E4)', 2)
ON CONFLICT ("codigo") DO NOTHING;

-- ── 3) Limpiar posiciones genéricas sin referencias ──────────────────
-- Solo borramos las A1-A10 que NADIE esté usando en ot_repuestos. Si alguna
-- ya quedó referenciada por un movimiento real, se conserva.
DELETE FROM "almacen_posicion"
 WHERE "id" NOT IN (
   SELECT "almacen_posicion_id"
     FROM "ot_repuestos"
    WHERE "almacen_posicion_id" IS NOT NULL
 );

-- ── 4) Insertar el layout real ───────────────────────────────────────
-- Cada bloque inserta las posiciones de su zona usando ON CONFLICT para que
-- la migración sea idempotente (si alguna ya existe, se ignora).

-- HER: A1-A4, B1-B4, C1-C4, D1-D4, E1-E4
INSERT INTO "almacen_posicion" ("zona_id", "codigo", "nombre")
SELECT z."id", p."codigo", 'Estante ' || p."codigo" || ' HER'
  FROM "almacen_zona" z
 CROSS JOIN (VALUES
   ('A1'),('A2'),('A3'),('A4'),
   ('B1'),('B2'),('B3'),('B4'),
   ('C1'),('C2'),('C3'),('C4'),
   ('D1'),('D2'),('D3'),('D4'),
   ('E1'),('E2'),('E3'),('E4')
 ) AS p("codigo")
 WHERE z."codigo" = 'HER'
ON CONFLICT ("zona_id", "codigo") DO NOTHING;

-- SUM: A1-A4, B1-B4, C1-C4, D1-D4, E1-E4
INSERT INTO "almacen_posicion" ("zona_id", "codigo", "nombre")
SELECT z."id", p."codigo", 'Estante ' || p."codigo" || ' SUM'
  FROM "almacen_zona" z
 CROSS JOIN (VALUES
   ('A1'),('A2'),('A3'),('A4'),
   ('B1'),('B2'),('B3'),('B4'),
   ('C1'),('C2'),('C3'),('C4'),
   ('D1'),('D2'),('D3'),('D4'),
   ('E1'),('E2'),('E3'),('E4')
 ) AS p("codigo")
 WHERE z."codigo" = 'SUM'
ON CONFLICT ("zona_id", "codigo") DO NOTHING;

-- REP: A1-A3, B1-B3, ... J1-J3 (10 columnas × 3 niveles)
INSERT INTO "almacen_posicion" ("zona_id", "codigo", "nombre")
SELECT z."id", p."codigo", 'Estante ' || p."codigo" || ' REP'
  FROM "almacen_zona" z
 CROSS JOIN (VALUES
   ('A1'),('A2'),('A3'),
   ('B1'),('B2'),('B3'),
   ('C1'),('C2'),('C3'),
   ('D1'),('D2'),('D3'),
   ('E1'),('E2'),('E3'),
   ('F1'),('F2'),('F3'),
   ('G1'),('G2'),('G3'),
   ('H1'),('H2'),('H3'),
   ('I1'),('I2'),('I3'),
   ('J1'),('J2'),('J3')
 ) AS p("codigo")
 WHERE z."codigo" = 'REP'
ON CONFLICT ("zona_id", "codigo") DO NOTHING;

-- STO: A1-A7, B1-B7, C1-C7, D1-D4
INSERT INTO "almacen_posicion" ("zona_id", "codigo", "nombre")
SELECT z."id", p."codigo", 'Estante ' || p."codigo" || ' STO'
  FROM "almacen_zona" z
 CROSS JOIN (VALUES
   ('A1'),('A2'),('A3'),('A4'),('A5'),('A6'),('A7'),
   ('B1'),('B2'),('B3'),('B4'),('B5'),('B6'),('B7'),
   ('C1'),('C2'),('C3'),('C4'),('C5'),('C6'),('C7'),
   ('D1'),('D2'),('D3'),('D4')
 ) AS p("codigo")
 WHERE z."codigo" = 'STO'
ON CONFLICT ("zona_id", "codigo") DO NOTHING;

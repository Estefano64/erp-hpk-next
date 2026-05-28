// scripts/import-cotizaciones-railway.ts
//
// Sube los precios por proveedor del Excel cotizaciones.xlsx a la tabla
// cotizacion_proveedor. Matching de material por Número de Parte (np).
//
// Decisiones (acordadas con el usuario):
//   - Columna "PU CAT ($)" → crea/usa un Proveedor nuevo "CATERPILLAR"
//     (RUC placeholder "EXT00000002")
//   - Materiales sin match por np → se crean como NOCAT, con NP y desc del Excel
//   - Cotizaciones existentes (material, proveedor) → se SOBREESCRIBEN
//
// Uso:
//   npx tsx scripts/import-cotizaciones-railway.ts            (DRY-RUN)
//   npx tsx scripts/import-cotizaciones-railway.ts --apply    (escribe)

import * as XLSX from "xlsx";
import { PrismaClient, Prisma } from "@prisma/client";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../cotizaciones.xlsx");
const APPLY = process.argv.includes("--apply");

const DEFAULTS = {
  planta: "AQPTA01",
  area: "LG",
  categoria: "REP",
  clasificacionNoCat: "NOCAT",
  um: "und",
  moneda: "USD",
};

// Mapeo: nombre del Excel → datos para resolver Proveedor en Railway.
// `ruc` se usa para resolver (más estable que razón social).
const PROVEEDORES_EXCEL: Record<string, { ruc: string; etiqueta: string }> = {
  CAT: { ruc: "EXT00000002", etiqueta: "CATERPILLAR" }, // proveedor nuevo
  KOM: { ruc: "20302241598", etiqueta: "Komatsu Mitsui" },
  "SEAL SOURCE": { ruc: "EXT00000001", etiqueta: "Seal Source" },
  HERCULES: { ruc: "20508630345", etiqueta: "Hercules" },
  MEM: { ruc: "20605466045", etiqueta: "MEM" },
  DYNAMIC: { ruc: "20601269415", etiqueta: "Dynamic" },
  "BC BEARING": { ruc: "20506568707", etiqueta: "BC Bearing" },
};

type DataRow = {
  item: number | null;
  codigo: string | null;
  np: string | null;
  descripcion: string | null;
  marca: string | null;
  precios: Record<string, number | null>;
};

function norm(s: unknown): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

async function ensureProveedorCAT() {
  const ruc = PROVEEDORES_EXCEL.CAT.ruc;
  let p = await prisma.proveedor.findUnique({ where: { ruc } });
  if (p) return p;
  if (!APPLY) {
    console.log(`[DRY-RUN] crearía proveedor "CATERPILLAR" (RUC ${ruc})`);
    return null;
  }
  p = await prisma.proveedor.create({
    data: {
      ruc,
      razon_social: "CATERPILLAR",
      nombre_comercial: "Caterpillar",
      activo: true,
    },
  });
  console.log(`✅ Creado proveedor CATERPILLAR id=${p.id}`);
  return p;
}

async function ensureNoCatClasificacion() {
  const existing = await prisma.clasificacion.findUnique({
    where: { codigo: DEFAULTS.clasificacionNoCat },
  });
  if (existing) return existing;
  if (!APPLY) return null;
  return prisma.clasificacion.create({
    data: { codigo: DEFAULTS.clasificacionNoCat, nombre: "No Catalogado" },
  });
}

async function nextMaterialCodigo(): Promise<string> {
  // Busca el max numérico de codigos puramente numéricos y suma 1, padded a 6.
  const all = await prisma.material.findMany({
    select: { codigo: true },
    where: { codigo: { startsWith: "0" } }, // los nuestros son tipo "000001"...
  });
  let max = 0;
  for (const m of all) {
    if (/^\d+$/.test(m.codigo)) {
      const n = parseInt(m.codigo, 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(6, "0");
}

function parseSheet(): DataRow[] {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    header: 1,
  }) as unknown as Array<Array<unknown>>;

  // raw[0] = títulos de sección, raw[1] = headers (ITEM, CÓDIGO, NP, DESC, MARCA, PU CAT, PU KOM, ...)
  // raw[2..] = datos
  // Columnas conocidas (índice por header[1]):
  //   0:ITEM, 1:CÓDIGO, 2:NP, 3:DESC, 4:MARCA, 5:PU CAT, 6:PU KOM,
  //   7:PU SEAL SOURCE, 8:PU HERCULES, 9:PU MEM, 10:PU DYNAMIC, 11:PU BC BEARING,
  //   12:PRECIO MÍNIMO, 13:PROVEEDOR GANADOR, 14:PRECIO ÚLTIMA COMPRA

  const COL = {
    ITEM: 0,
    CODIGO: 1,
    NP: 2,
    DESC: 3,
    MARCA: 4,
    CAT: 5,
    KOM: 6,
    "SEAL SOURCE": 7,
    HERCULES: 8,
    MEM: 9,
    DYNAMIC: 10,
    "BC BEARING": 11,
  };

  const rows: DataRow[] = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length === 0) continue;
    const itemNum = r[COL.ITEM];
    if (itemNum == null || typeof itemNum !== "number") continue; // fila vacía/sumario

    rows.push({
      item: itemNum,
      codigo: r[COL.CODIGO] != null ? String(r[COL.CODIGO]).trim() : null,
      np: r[COL.NP] != null ? String(r[COL.NP]).trim() : null,
      descripcion: r[COL.DESC] != null ? String(r[COL.DESC]).trim() : null,
      marca: r[COL.MARCA] != null ? String(r[COL.MARCA]).trim() : null,
      precios: {
        CAT: r[COL.CAT] as number | null,
        KOM: r[COL.KOM] as number | null,
        "SEAL SOURCE": r[COL["SEAL SOURCE"]] as number | null,
        HERCULES: r[COL.HERCULES] as number | null,
        MEM: r[COL.MEM] as number | null,
        DYNAMIC: r[COL.DYNAMIC] as number | null,
        "BC BEARING": r[COL["BC BEARING"]] as number | null,
      },
    });
  }
  return rows;
}

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (ESCRIBE)" : "DRY-RUN"}`);
  console.log(`Excel: ${EXCEL_PATH}`);
  const rows = parseSheet();
  console.log(`Filas de datos leídas: ${rows.length}`);

  await ensureNoCatClasificacion();
  await ensureProveedorCAT();

  // Resolver proveedores por RUC.
  const provMap = new Map<string, number>();
  for (const [excelName, info] of Object.entries(PROVEEDORES_EXCEL)) {
    const p = await prisma.proveedor.findUnique({ where: { ruc: info.ruc } });
    if (p) {
      provMap.set(excelName, p.id);
    } else if (excelName === "CAT" && !APPLY) {
      console.log(`[DRY-RUN] proveedor CAT (CATERPILLAR) se asignará tras crearlo`);
    } else {
      console.warn(`⚠️  Proveedor "${excelName}" (RUC ${info.ruc}) NO encontrado — se saltarán sus precios.`);
    }
  }

  // Cargar todos los materiales con NP en memoria para matching rápido.
  const matAll = await prisma.material.findMany({
    select: { material_id: true, codigo: true, np: true, descripcion: true },
  });
  const npToMaterial = new Map<string, { material_id: number; codigo: string }>();
  for (const m of matAll) {
    if (m.np) {
      const key = norm(m.np);
      if (!npToMaterial.has(key)) {
        npToMaterial.set(key, { material_id: m.material_id, codigo: m.codigo });
      }
    }
  }
  console.log(`Materiales con NP indexados: ${npToMaterial.size}`);

  const counters = {
    cotizacionesNuevas: 0,
    cotizacionesUpdate: 0,
    materialesCreados: 0,
    sinNpExcel: 0,
    filasSinPrecios: 0,
    proveedorSinPrecios: { CAT: 0, KOM: 0, "SEAL SOURCE": 0, HERCULES: 0, MEM: 0, DYNAMIC: 0, "BC BEARING": 0 } as Record<string, number>,
  };
  const samples: string[] = [];

  // Para no chocar con códigos nuevos, mantenemos un counter local.
  let nextCodigo = APPLY ? await nextMaterialCodigo() : "000999";
  const nextCodigoNum = () => {
    const n = parseInt(nextCodigo, 10) + 1;
    nextCodigo = String(n).padStart(6, "0");
    return nextCodigo;
  };

  let i = 0;
  for (const row of rows) {
    i++;
    if (!row.np) {
      counters.sinNpExcel++;
      if (samples.length < 5) samples.push(`[SIN-NP] item=${row.item} cod=${row.codigo} desc=${row.descripcion}`);
      continue;
    }

    // Buscar material por np.
    const key = norm(row.np);
    let mat = npToMaterial.get(key);

    // Crear material si no existe.
    if (!mat) {
      const nuevoCodigo = APPLY ? await nextMaterialCodigo() : nextCodigoNum();
      counters.materialesCreados++;
      if (APPLY) {
        const created = await prisma.material.create({
          data: {
            codigo: nuevoCodigo,
            descripcion: (row.descripcion ?? `Sin descripción (NP ${row.np})`).slice(0, 500),
            planta_codigo: DEFAULTS.planta,
            area_codigo: DEFAULTS.area,
            categoria_codigo: DEFAULTS.categoria,
            clasificacion_codigo: DEFAULTS.clasificacionNoCat,
            unidad_medida_codigo: DEFAULTS.um,
            np: row.np,
            stock_actual: new Prisma.Decimal(0),
          },
        });
        mat = { material_id: created.material_id, codigo: created.codigo };
        npToMaterial.set(key, mat);
      } else if (samples.length < 10) {
        samples.push(`[CREATE-MAT] codigo=${nuevoCodigo} np=${row.np} desc=${row.descripcion}`);
      }
    }

    if (!mat && !APPLY) continue; // en dry-run, mat puede quedar null

    // Insertar / actualizar cotizaciones por proveedor con precio.
    let alMenosUno = false;
    for (const [excelName, precio] of Object.entries(row.precios)) {
      if (precio == null || !Number.isFinite(Number(precio)) || Number(precio) <= 0) continue;
      alMenosUno = true;
      const proveedorId = provMap.get(excelName);
      if (!proveedorId) {
        counters.proveedorSinPrecios[excelName]++;
        continue;
      }

      const precioDec = new Prisma.Decimal(precio);

      if (APPLY && mat) {
        const existing = await prisma.cotizacionProveedor.findUnique({
          where: { material_id_proveedor_id: { material_id: mat.material_id, proveedor_id: proveedorId } },
        });
        await prisma.cotizacionProveedor.upsert({
          where: { material_id_proveedor_id: { material_id: mat.material_id, proveedor_id: proveedorId } },
          create: {
            material_id: mat.material_id,
            proveedor_id: proveedorId,
            precio_unitario: precioDec,
            moneda_codigo: DEFAULTS.moneda,
            observaciones: "Import cotizaciones.xlsx (precio inicial)",
            usuario: "import-cotizaciones",
            fecha: new Date(),
          },
          update: {
            precio_unitario: precioDec,
            moneda_codigo: DEFAULTS.moneda,
            observaciones: "Import cotizaciones.xlsx (sobreescritura)",
            usuario: "import-cotizaciones",
            fecha: new Date(),
          },
        });
        if (existing) counters.cotizacionesUpdate++;
        else counters.cotizacionesNuevas++;
      } else {
        counters.cotizacionesNuevas++;
        if (samples.length < 12) samples.push(`[COT] np=${row.np} prov=${excelName} pu=${precio}`);
      }
    }
    if (!alMenosUno) counters.filasSinPrecios++;

    if (APPLY && i % 100 === 0) console.log(`  procesados ${i}/${rows.length}`);
  }

  console.log(`\n========== RESUMEN ==========`);
  console.log(`Filas Excel:                ${rows.length}`);
  console.log(`Filas sin NP (saltadas):    ${counters.sinNpExcel}`);
  console.log(`Filas sin ningún precio:    ${counters.filasSinPrecios}`);
  console.log(`Materiales a crear (NOCAT): ${counters.materialesCreados}`);
  console.log(`Cotizaciones a insertar:    ${counters.cotizacionesNuevas}`);
  console.log(`Cotizaciones a sobrescribir: ${counters.cotizacionesUpdate}`);
  console.log(`Precios saltados por proveedor sin ID:`, counters.proveedorSinPrecios);

  if (!APPLY && samples.length > 0) {
    console.log(`\nEjemplos:`);
    samples.forEach((s) => console.log(`  ${s}`));
    console.log(`\n💡 Para aplicar: npx tsx scripts/import-cotizaciones-railway.ts --apply`);
  } else if (APPLY) {
    console.log(`\n✅ Listo`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

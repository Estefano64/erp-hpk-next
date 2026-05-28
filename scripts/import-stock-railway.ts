// scripts/import-stock-railway.ts
//
// Sube el "Stock Disponible" del Excel Stock_Actualizado.xlsx al campo
// material.stock_actual en Railway, y además actualiza precio (+ moneda),
// punto_reposicion y stock_maximo.
//
// Para códigos del Excel que NO existan en la base de datos, se crean como
// materiales "no catalogados" — se les asigna la clasificación "NOCAT"
// (que el script crea si no existe) y defaults razonables para los demás FKs.
//
// Uso:
//   npx tsx scripts/import-stock-railway.ts            (DRY-RUN, no escribe)
//   npx tsx scripts/import-stock-railway.ts --apply    (escribe en Railway)

import * as XLSX from "xlsx";
import { PrismaClient, Prisma } from "@prisma/client";
import * as path from "node:path";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const EXCEL_PATH = path.resolve(__dirname, "../../Stock_Actualizado.xlsx");
const APPLY = process.argv.includes("--apply");

const DEFAULTS = {
  planta: "AQPTA01",
  area: "LG",
  categoria: "REP",          // si Excel no trae uno válido
  clasificacionNoCat: "NOCAT",
  um: "und",
  moneda: "USD",
};

type Row = {
  Código: string | number;
  Descripción: string | null;
  "N/P": string | null;
  Stock: number | null;
  UM: string | null;
  "Stock Disponible": number | null;
  "Pto. Reposición": number | null;
  Máximo: number | null;
  Fabricante: string | null;
  Categoría: string | null;
  "Precio Último": number | null;
  Moneda: string | null;
  Ubicación: string | null;
};

function normCodigo(v: string | number): string {
  if (typeof v === "number") return String(v).padStart(6, "0");
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return s.padStart(6, "0");
  return s;
}

function dec(n: number | null | undefined): Prisma.Decimal | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return new Prisma.Decimal(n);
}

function normMoneda(m: string | null | undefined): string {
  const up = (m ?? "USD").toString().trim().toUpperCase();
  if (up === "PEN") return "SOL";
  return up || "USD";
}

async function ensureNoCatClasificacion() {
  const existing = await prisma.clasificacion.findUnique({
    where: { codigo: DEFAULTS.clasificacionNoCat },
  });
  if (existing) return existing;
  if (!APPLY) {
    console.log(`[DRY-RUN] crearía clasificación "${DEFAULTS.clasificacionNoCat}" (No Catalogado)`);
    return null;
  }
  return prisma.clasificacion.create({
    data: { codigo: DEFAULTS.clasificacionNoCat, nombre: "No Catalogado" },
  });
}

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (ESCRIBE)" : "DRY-RUN"}`);
  console.log(`Excel: ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: null });
  console.log(`Filas leídas: ${rows.length}`);

  // Catálogos válidos para validar FKs.
  const [ums, fabs, cats] = await Promise.all([
    prisma.unidadMedida.findMany({ select: { codigo: true } }),
    prisma.fabricante.findMany({ select: { codigo: true } }),
    prisma.categoria.findMany({ select: { codigo: true } }),
  ]);
  const umSet = new Set(ums.map((u) => u.codigo));
  const fabSet = new Set(fabs.map((f) => f.codigo));
  const catSet = new Set(cats.map((c) => c.codigo));

  await ensureNoCatClasificacion();

  // Cache de materiales existentes (codigo -> id).
  const existentes = await prisma.material.findMany({ select: { material_id: true, codigo: true } });
  const codigoToId = new Map(existentes.map((m) => [m.codigo, m.material_id]));
  console.log(`Materiales en DB: ${existentes.length}`);

  let aActualizar = 0;
  let aCrear = 0;
  let conflictos = 0;
  const sample: { tipo: string; codigo: string; detail?: string }[] = [];
  const duplicadosExcel = new Set<string>();
  const seenExcel = new Set<string>();

  // Validar duplicados de código en el Excel.
  for (const r of rows) {
    const codigo = normCodigo(r["Código"]);
    if (seenExcel.has(codigo)) duplicadosExcel.add(codigo);
    seenExcel.add(codigo);
  }
  if (duplicadosExcel.size > 0) {
    console.log(`\n⚠️  Códigos duplicados en Excel: ${duplicadosExcel.size}`);
    [...duplicadosExcel].slice(0, 10).forEach((c) => console.log(`   - ${c}`));
  }

  // Procesar.
  let i = 0;
  for (const r of rows) {
    i++;
    const codigo = normCodigo(r["Código"]);
    const stockDisp = dec(r["Stock Disponible"]);
    const puntoRep = dec(r["Pto. Reposición"]);
    const stockMax = dec(r["Máximo"]);
    const precio = dec(r["Precio Último"]);
    const moneda = normMoneda(r["Moneda"]);

    const existingId = codigoToId.get(codigo);

    if (existingId) {
      aActualizar++;
      if (APPLY) {
        await prisma.material.update({
          where: { material_id: existingId },
          data: {
            stock_actual: stockDisp ?? new Prisma.Decimal(0),
            punto_reposicion: puntoRep,
            stock_maximo: stockMax,
            precio: precio,
            moneda_codigo: precio ? moneda : undefined,
          },
        });
      }
      if (sample.length < 5 && APPLY === false) {
        sample.push({
          tipo: "UPDATE",
          codigo,
          detail: `stock=${stockDisp ?? 0}, prep=${puntoRep ?? "-"}, max=${stockMax ?? "-"}, precio=${precio ?? "-"} ${precio ? moneda : ""}`,
        });
      }
    } else {
      aCrear++;
      const um = r.UM && umSet.has(String(r.UM)) ? String(r.UM) : DEFAULTS.um;
      const fab = r.Fabricante && fabSet.has(String(r.Fabricante)) ? String(r.Fabricante) : null;
      const cat = r.Categoría && catSet.has(String(r.Categoría)) ? String(r.Categoría) : DEFAULTS.categoria;
      const desc = (r.Descripción?.toString().trim() || `Sin descripción (${codigo})`).slice(0, 500);

      if (r.UM && !umSet.has(String(r.UM))) {
        if (sample.filter((s) => s.tipo === "UM-FALLBACK").length < 3) {
          sample.push({ tipo: "UM-FALLBACK", codigo, detail: `UM '${r.UM}' no existe → 'und'` });
        }
      }

      if (APPLY) {
        try {
          const created = await prisma.material.create({
            data: {
              codigo,
              descripcion: desc,
              planta_codigo: DEFAULTS.planta,
              area_codigo: DEFAULTS.area,
              categoria_codigo: cat,
              clasificacion_codigo: DEFAULTS.clasificacionNoCat,
              unidad_medida_codigo: um,
              fabricante_codigo: fab,
              np: r["N/P"] ?? null,
              stock_actual: stockDisp ?? new Prisma.Decimal(0),
              punto_reposicion: puntoRep,
              stock_maximo: stockMax,
              precio: precio,
              moneda_codigo: precio ? moneda : null,
            },
          });
          codigoToId.set(codigo, created.material_id);
        } catch (e) {
          conflictos++;
          console.error(`   ✗ Error creando ${codigo}:`, e instanceof Error ? e.message : e);
        }
      }
      if (sample.length < 10 && !APPLY) {
        sample.push({
          tipo: "CREATE",
          codigo,
          detail: `desc="${desc.slice(0, 60)}…", UM=${um}, cat=${cat}, fab=${fab ?? "-"}, stock=${stockDisp ?? 0}`,
        });
      }
    }

    if (APPLY && i % 100 === 0) console.log(`  procesados ${i}/${rows.length}`);
  }

  console.log(`\n========== RESUMEN ==========`);
  console.log(`Filas Excel:       ${rows.length}`);
  console.log(`A ACTUALIZAR:      ${aActualizar}`);
  console.log(`A CREAR (no cat):  ${aCrear}`);
  console.log(`Conflictos:        ${conflictos}`);
  console.log(`Duplicados Excel:  ${duplicadosExcel.size}`);

  if (!APPLY && sample.length > 0) {
    console.log(`\nEjemplos (${sample.length}):`);
    for (const s of sample) {
      console.log(`  [${s.tipo}] ${s.codigo} — ${s.detail ?? ""}`);
    }
  }

  if (!APPLY) {
    console.log(`\n💡 Para aplicar, correr de nuevo con --apply`);
  } else {
    console.log(`\n✅ Listo`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

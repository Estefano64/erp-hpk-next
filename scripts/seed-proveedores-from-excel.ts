// scripts/seed-proveedores-from-excel.ts
//
// Importa proveedores desde PROVEEDORES.xlsx:
//   1. Borra los 6 proveedores seed (junto con sus cotizaciones/compras dummy).
//   2. Crea los 83 proveedores del Excel por RUC (idempotente: si ya existe, lo
//      actualiza con los datos del Excel).
//
// Uso:
//   DRY_RUN=1 npx tsx scripts/seed-proveedores-from-excel.ts
//   TARGET=railway npx tsx scripts/seed-proveedores-from-excel.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error("falta URL"); process.exit(1); }

const FILE = "C:/Users/HP/Downloads/PROVEEDORES.xlsx";

// RUCs de los 6 seeds que el usuario quiere eliminar (no están en el Excel).
const SEED_RUCS_A_BORRAR = [
  "20100043170", // FERREYROS S.A.
  "20109167429", // KOMATSU-MITSUI MAQUINARIAS PERU S.A.
  "20143231014", // BOHLER UDDEHOLM PERU S.A.
  "20512345671", // MACHEN PERU S.A.C.
  "20445566778", // HOLDING INDUSTRIAL S.A.
  "20556677889", // TRACTO SONI E.I.R.L.
];

interface Row {
  razon_social: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  contacto: string | null;
  email: string | null;
}

function clean(s: unknown): string | null {
  if (s == null) return null;
  const v = String(s).trim().replace(/\r\n|\r/g, " ");
  return v.length > 0 ? v : null;
}

function readExcel(): Row[] {
  const wb = XLSX.readFile(FILE);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Record<string, unknown>[];
  // Skip 2 filas de encabezado/título.
  const rows = raw.slice(2).filter((r) => r["BASE DE DATOS DE PROVEEDORES"] && r["__EMPTY"]);
  return rows.map((r) => ({
    razon_social: String(r["BASE DE DATOS DE PROVEEDORES"]).trim().replace(/\r\n|\r/g, " "),
    ruc: String(r["__EMPTY"]).trim(),
    direccion: clean(r["__EMPTY_1"]),
    telefono: clean(r["__EMPTY_2"]),
    contacto: clean(r["__EMPTY_3"]),
    email: clean(r["__EMPTY_4"]),
  })).filter((r) => r.ruc.length === 11); // RUC peruano = 11 dígitos
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}`);
  const rows = readExcel();
  console.log(`Filas válidas en Excel: ${rows.length}`);

  // ── 1) Borrar seeds ──
  for (const ruc of SEED_RUCS_A_BORRAR) {
    const prov = await prisma.proveedor.findUnique({ where: { ruc }, select: { id: true, razon_social: true } });
    if (!prov) { console.log(`[skip] seed RUC ${ruc} no existe`); continue; }
    const counts = {
      cot: await prisma.cotizacionProveedor.count({ where: { proveedor_id: prov.id } }),
      cmp: await prisma.compra.count({ where: { proveedor_id: prov.id } }),
    };
    console.log(`[DELETE] ${ruc} ${prov.razon_social} (cotizaciones=${counts.cot}, compras=${counts.cmp})`);
    if (DRY_RUN) continue;
    if (counts.cot > 0) await prisma.cotizacionProveedor.deleteMany({ where: { proveedor_id: prov.id } });
    if (counts.cmp > 0) {
      // borrar detalles primero (FK Cascade no garantizada para Compra.proveedor)
      const compras = await prisma.compra.findMany({ where: { proveedor_id: prov.id }, select: { id: true } });
      for (const c of compras) {
        await prisma.compraDetalle.deleteMany({ where: { compra_id: c.id } });
      }
      await prisma.compra.deleteMany({ where: { proveedor_id: prov.id } });
    }
    await prisma.proveedor.delete({ where: { id: prov.id } });
  }

  // ── 2) Upsert por RUC ──
  let created = 0, updated = 0;
  for (const r of rows) {
    const existing = await prisma.proveedor.findUnique({ where: { ruc: r.ruc } });
    if (existing) {
      console.log(`[UPDATE] ${r.ruc} ${r.razon_social}`);
      updated++;
    } else {
      console.log(`[CREATE] ${r.ruc} ${r.razon_social}`);
      created++;
    }
    if (DRY_RUN) continue;
    await prisma.proveedor.upsert({
      where: { ruc: r.ruc },
      create: {
        ruc: r.ruc,
        razon_social: r.razon_social.slice(0, 200),
        direccion: r.direccion,
        telefono: r.telefono?.slice(0, 20) ?? null,
        contacto: r.contacto?.slice(0, 100) ?? null,
        email: r.email?.slice(0, 100) ?? null,
        usuario_crea: "seed-excel",
        usuario_actualiza: "seed-excel",
      },
      update: {
        razon_social: r.razon_social.slice(0, 200),
        direccion: r.direccion,
        telefono: r.telefono?.slice(0, 20) ?? null,
        contacto: r.contacto?.slice(0, 100) ?? null,
        email: r.email?.slice(0, 100) ?? null,
        usuario_actualiza: "seed-excel",
      },
    });
  }

  console.log(`\nTotal: ${created} creados, ${updated} actualizados.`);
  const final = await prisma.proveedor.count();
  console.log(`Proveedores en BD ahora: ${final}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

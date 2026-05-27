// Importa proveedores desde un Excel al catálogo Proveedor.
// Idempotente: upsert por RUC.
//
// Espera columnas: RUC, Razón social, Nombre comercial, Contacto, Teléfono, Email, Dirección.
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/seed-proveedores-xlsx.ts <ruta-al-xlsx>
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import path from "path";

const prisma = new PrismaClient();

interface FilaXlsx {
  RUC?: string | number;
  "Razón social"?: string;
  "Nombre comercial"?: string;
  Contacto?: string;
  "Teléfono"?: string | number;
  Email?: string;
  "Dirección"?: string;
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function cleanRuc(v: unknown): string | null {
  if (v == null) return null;
  // Acepta números y strings. Saca todo lo que no sea dígito.
  const s = String(v).replace(/\D/g, "");
  return s.length > 0 ? s : null;
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error("Falta ruta al .xlsx. Uso: npx tsx scripts/seed-proveedores-xlsx.ts <ruta>");
    process.exit(1);
  }

  const wb = XLSX.readFile(path.resolve(xlsxPath));
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const filas = XLSX.utils.sheet_to_json<FilaXlsx>(ws, { defval: "" });

  console.log(`📄 ${filas.length} filas en el Excel (${sheetName})`);

  let creados = 0;
  let actualizados = 0;
  const errores: { fila: number; ruc?: string; error: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const filaNum = i + 2; // +1 por header, +1 por base 1
    const ruc = cleanRuc(f.RUC);
    const razonSocial = clean(f["Razón social"]);

    if (!ruc) {
      errores.push({ fila: filaNum, error: "RUC vacío o inválido" });
      continue;
    }
    if (ruc.length !== 11) {
      errores.push({ fila: filaNum, ruc, error: `RUC debe tener 11 dígitos (tiene ${ruc.length})` });
      continue;
    }
    if (!razonSocial) {
      errores.push({ fila: filaNum, ruc, error: "Razón social vacía" });
      continue;
    }

    const data = {
      razon_social: razonSocial.slice(0, 200),
      nombre_comercial: clean(f["Nombre comercial"])?.slice(0, 200) ?? null,
      contacto: clean(f.Contacto)?.slice(0, 100) ?? null,
      telefono: clean(f["Teléfono"])?.slice(0, 20) ?? null,
      email: clean(f.Email)?.slice(0, 100) ?? null,
      direccion: clean(f["Dirección"]) ?? null,
    };

    try {
      const existing = await prisma.proveedor.findUnique({ where: { ruc }, select: { id: true } });
      if (existing) {
        await prisma.proveedor.update({
          where: { id: existing.id },
          data: { ...data, usuario_actualiza: "seed-xlsx" },
        });
        actualizados++;
      } else {
        await prisma.proveedor.create({
          data: { ruc, ...data, usuario_crea: "seed-xlsx", usuario_actualiza: "seed-xlsx", activo: true },
        });
        creados++;
      }
    } catch (e) {
      errores.push({ fila: filaNum, ruc, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`\n✓ Resultados:`);
  console.log(`  - Creados:     ${creados}`);
  console.log(`  - Actualizados: ${actualizados}`);
  console.log(`  - Errores:      ${errores.length}`);
  if (errores.length > 0) {
    console.log("\n⚠️ Detalle de errores:");
    for (const e of errores) {
      console.log(`  Fila ${e.fila}${e.ruc ? ` (RUC ${e.ruc})` : ""}: ${e.error}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

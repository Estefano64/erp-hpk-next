// Agrega/actualiza las áreas "Limpieza" y "Software" al catálogo Area.
// Idempotente: upsert por codigo.
//
// Uso:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-areas-extra.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AREAS_EXTRA = [
  { codigo: "LP", nombre: "Limpieza" },
  { codigo: "SW", nombre: "Software" },
];

async function main() {
  for (const a of AREAS_EXTRA) {
    const result = await prisma.area.upsert({
      where: { codigo: a.codigo },
      update: { nombre: a.nombre, activo: true },
      create: { codigo: a.codigo, nombre: a.nombre, activo: true },
    });
    console.log(`✓ ${a.codigo} — ${a.nombre} (area_id=${result.area_id})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

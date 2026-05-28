// Crea/actualiza solo los 5 usuarios firmantes (los que tienen imagen en
// public/firmas/). Es idempotente: upsert por codigoEmpleado.
// Mantener sincronizado con la sección equivalente en prisma/seed.ts.
//
// Uso:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-firmantes.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FIRMANTES = [
  { codigo: "USR-001", nombre: "Antonio Zumaeta Mendoza" },
  { codigo: "USR-002", nombre: "Carlos Viña Miranda" },
  { codigo: "USR-003", nombre: "Diego Jaime Monge" },
  { codigo: "USR-004", nombre: "Juan Diego Muñoz Manrique" },
  { codigo: "USR-005", nombre: "Miriam Ccanahuire" },
];

async function main() {
  const hash = await bcrypt.hash("hpyk2026", 10);
  for (const u of FIRMANTES) {
    const result = await prisma.usuario.upsert({
      where: { codigoEmpleado: u.codigo },
      update: {},
      create: {
        codigoEmpleado: u.codigo,
        nombre: u.nombre,
        password: hash,
        roles: ["admin", "aprobador_evaluacion"],
      },
    });
    console.log(`✓ ${u.codigo} — ${u.nombre} (id=${result.id})`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

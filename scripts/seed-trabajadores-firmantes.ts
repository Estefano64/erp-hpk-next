// Crea/actualiza 3 trabajadores que también son firmantes de OC.
// Idempotente: hace findFirst por nombre exacto y update si existe, o create si no.
//
// El area debe coincidir con el filtro del dropdown "Asignado a" en OTs internas
// (src/app/(dashboard)/ordenes-trabajo-internas/page.tsx): solo aparecen quienes
// tienen area "LOGISTICA" o cuyo nombre contiene "Antonio".
//
// Uso:
//   DATABASE_URL="postgresql://..." npx tsx scripts/seed-trabajadores-firmantes.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TrabajadorSeed {
  nombre: string;
  area: string;
  puesto: string;
}

const TRABAJADORES: TrabajadorSeed[] = [
  { nombre: "Diego Jaime Monge",         area: "LOGISTICA",     puesto: "OPERARIO LOGISTICA" },
  { nombre: "Miriam Ccanahuire",         area: "LOGISTICA",     puesto: "OPERARIO LOGISTICA" },
  { nombre: "Antonio Zumaeta Mendoza",   area: "MANTENIMIENTO", puesto: "OPERARIO MANTENIMIENTO" },
];

async function main() {
  for (const t of TRABAJADORES) {
    const existing = await prisma.trabajador.findFirst({
      where: { nombre: t.nombre },
      select: { trabajador_id: true, area: true, puesto: true },
    });
    if (existing) {
      await prisma.trabajador.update({
        where: { trabajador_id: existing.trabajador_id },
        data: { area: t.area, puesto: t.puesto, activo: true },
      });
      console.log(
        `✓ ${t.nombre} actualizado (id=${existing.trabajador_id}, area: ${existing.area}→${t.area})`,
      );
    } else {
      const created = await prisma.trabajador.create({
        data: { nombre: t.nombre, area: t.area, puesto: t.puesto, activo: true },
        select: { trabajador_id: true },
      });
      console.log(`✓ ${t.nombre} creado (id=${created.trabajador_id}, ${t.area})`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

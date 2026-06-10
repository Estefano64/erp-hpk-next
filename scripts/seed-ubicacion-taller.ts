// Seed: agrega la ubicación "Taller" al catálogo de ubicaciones.
//
// Pedido del user: el taller es donde se trabajan los reparos / cilindros que
// ya bajaron de almacén. Quería que apareciera como una ubicación más para
// poder asignar items y trackearlos ahí.
//
// Idempotente: si ya existe (codigo='TALLER'), no hace nada.
import { prisma } from "@/lib/prisma";

async function main() {
  const codigo = "TALLER";
  const existing = await prisma.ubicacion.findUnique({
    where: { codigo },
    select: { codigo: true, nombre: true, activo: true },
  });
  if (existing) {
    console.log(`Ya existe: ${existing.codigo} — ${existing.nombre} (activo=${existing.activo})`);
    if (existing.activo === false) {
      await prisma.ubicacion.update({ where: { codigo }, data: { activo: true } });
      console.log("✓ Reactivada.");
    }
    return;
  }
  const created = await prisma.ubicacion.create({
    data: {
      codigo,
      nombre: "Taller",
      descripcion: "Taller de reparación — items consumidos en proceso de trabajo",
      activo: true,
    },
  });
  console.log(`✓ Creada: ${created.codigo} — ${created.nombre}`);
}
main().finally(() => prisma.$disconnect());

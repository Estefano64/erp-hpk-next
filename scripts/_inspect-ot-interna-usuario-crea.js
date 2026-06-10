// Inspecciona algunas OTs internas en Railway para ver si usuario_crea está
// siendo sobreescrito. Solo lectura.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  // Top 10 OTs internas por updatedAt desc (las más recién modificadas)
  const ots = await p.ordenTrabajoInterna.findMany({
    orderBy: { id: "desc" },
    take: 15,
    select: { id: true, ot: true, usuario_crea: true, fecha_creacion: true, descripcion: true },
  });
  console.log("OTs internas más recientes:");
  console.log("─".repeat(110));
  for (const o of ots) {
    const fc = o.fecha_creacion ? new Date(o.fecha_creacion).toISOString().slice(0, 16).replace("T", " ") : "-";
    console.log(`  id=${String(o.id).padEnd(4)} ot=${o.ot} usuario_crea="${o.usuario_crea ?? "(null)"}" fecha_creacion=${fc}  ${o.descripcion?.slice(0, 50) ?? ""}`);
  }

  // Cuántos usuarios distintos hay en usuario_crea
  const grouped = await p.ordenTrabajoInterna.groupBy({
    by: ["usuario_crea"],
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });
  console.log("\nDistribución de usuario_crea:");
  for (const g of grouped) {
    console.log(`  "${g.usuario_crea ?? "(null)"}"  ${g._count._all} OTs`);
  }

  await p.$disconnect();
})();

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

async function main() {
  const trabajadores = await prisma.trabajador.findMany({
    select: { trabajador_id: true, nombre: true, area: true, puesto: true, activo: true },
    orderBy: [{ area: "asc" }, { nombre: "asc" }],
  });
  console.log(`Total trabajadores: ${trabajadores.length}\n`);

  const grupos = new Map<string, typeof trabajadores>();
  for (const t of trabajadores) {
    const key = t.area;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(t);
  }
  for (const [area, lista] of [...grupos.entries()].sort()) {
    console.log(`── ${area} (${lista.length}) ──`);
    for (const t of lista) {
      console.log(`  id=${t.trabajador_id} | ${t.nombre} | ${t.puesto} ${t.activo ? "" : "(INACTIVO)"}`);
    }
  }

  console.log("\n--- Búsqueda 'antonio' (case-insensitive) ---");
  const antonios = trabajadores.filter((t) => t.nombre.toLowerCase().includes("antonio"));
  for (const a of antonios) console.log(`  ${a.nombre} | area=${a.area} | puesto=${a.puesto}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());

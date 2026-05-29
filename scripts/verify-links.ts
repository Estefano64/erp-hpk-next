// Read-only: verifica el vínculo Trabajador↔Usuario en Railway.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const env = readFileSync(".env", "utf8");
const m = env.match(/^RAILWAY_DATABASE_URL=(.+)$/m);
if (!m) { console.error("No hay RAILWAY_DATABASE_URL"); process.exit(1); }
const url = m[1].trim().replace(/^["']|["']$/g, "");
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const totalTrab = await prisma.trabajador.count();
  const totalUsr = await prisma.usuario.count();
  const usrConTrab = await prisma.usuario.count({ where: { trabajadorId: { not: null } } });
  const trabConCuenta = await prisma.trabajador.count({ where: { usuario: { is: {} } } });

  console.log(`\nTrabajadores totales:        ${totalTrab}`);
  console.log(`Usuarios totales:            ${totalUsr}`);
  console.log(`Usuarios con trabajadorId:   ${usrConTrab}`);
  console.log(`Trabajadores con cuenta:     ${trabConCuenta}`);

  // Muestra los primeros 10 trabajadores con su cuenta (si existe)
  const trabs = await prisma.trabajador.findMany({
    take: 15,
    include: { usuario: { select: { id: true, nombre: true, roles: true } } },
    orderBy: { trabajador_id: "asc" },
  });
  console.log("\nMuestra (trabajador -> cuenta vinculada):");
  for (const t of trabs) {
    const u = t.usuario;
    console.log(`  [${t.trabajador_id}] ${(t.nombre ?? "").padEnd(30)} -> ${u ? `usuario#${u.id} [${u.roles.join(",")}]` : "SIN CUENTA"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

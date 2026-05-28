// Muestra el estado de cuentas vs trabajadores en Railway:
//   - Trabajadores SIN cuenta
//   - Cuentas SIN trabajador (orphans)
//   - Vínculos actuales (resumen)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.RAILWAY_DATABASE_URL;
if (!url) { console.error("falta RAILWAY_DATABASE_URL"); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const trabajadores = await prisma.trabajador.findMany({
    orderBy: [{ area: "asc" }, { nombre: "asc" }],
    include: { usuario: { select: { codigoEmpleado: true, email: true, rol: true, activo: true } } },
  });
  const usuarios = await prisma.usuario.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, codigoEmpleado: true, email: true, nombre: true, rol: true, activo: true, trabajadorId: true },
  });

  const sinCuenta = trabajadores.filter((t) => !t.usuario);
  const orphanUsuarios = usuarios.filter((u) => u.trabajadorId == null);

  console.log(`\n═══ Estado Cuentas / Trabajadores ═══`);
  console.log(`Trabajadores totales: ${trabajadores.length}`);
  console.log(`Trabajadores CON cuenta: ${trabajadores.length - sinCuenta.length}`);
  console.log(`Trabajadores SIN cuenta: ${sinCuenta.length}`);
  console.log(`Cuentas totales: ${usuarios.length}`);
  console.log(`Cuentas vinculadas: ${usuarios.length - orphanUsuarios.length}`);
  console.log(`Cuentas SIN trabajador: ${orphanUsuarios.length}`);

  console.log(`\n── Trabajadores SIN cuenta (${sinCuenta.length}) ──`);
  for (const t of sinCuenta) {
    console.log(`  #${t.trabajador_id}  ${t.nombre.padEnd(45)}  ${(t.area ?? "").padEnd(15)} ${t.puesto ?? ""}`);
  }

  console.log(`\n── Cuentas SIN trabajador (${orphanUsuarios.length}) ──`);
  for (const u of orphanUsuarios) {
    console.log(`  #${u.id}  ${u.codigoEmpleado.padEnd(10)} ${u.nombre.padEnd(30)}  ${u.email ?? ""}  rol=${u.rol}`);
  }

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

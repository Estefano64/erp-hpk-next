// scripts/list-trabajadores-usuarios-railway.ts
//
// Lista TODOS los trabajadores y usuarios de Railway en formato tabular.
// Uso: npx tsx scripts/list-trabajadores-usuarios-railway.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const url = process.env.RAILWAY_DATABASE_URL;
if (!url) { console.error("Falta RAILWAY_DATABASE_URL"); process.exit(1); }

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  // ─── TRABAJADORES ──────────────────────────────────────────────
  const trabs = await prisma.trabajador.findMany({
    orderBy: [{ area: "asc" }, { nombre: "asc" }],
    include: {
      equipo: { select: { codigo: true, descripcion: true } },
    },
  });

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  TRABAJADORES en Railway  (total: ${trabs.length})`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  for (const t of trabs) {
    const equipo = t.equipo ? `${t.equipo.codigo} (${t.equipo.descripcion})` : "—";
    console.log(`#${t.trabajador_id}  ${t.nombre}`);
    console.log(`  DNI: ${t.dni ?? "—"}   Área: ${t.area ?? "—"}   Puesto: ${t.puesto ?? "—"}`);
    console.log(`  Equipo asignado: ${equipo}   $/h: ${t.costo_hora_hombre ?? "—"}   $/extra: ${t.costo_hora_extra ?? "—"}   Activo: ${t.activo}`);
    console.log();
  }

  // Grupos por área
  console.log(`─── Por área ───`);
  const porArea = new Map<string, number>();
  for (const t of trabs) {
    const k = t.area ?? "(sin área)";
    porArea.set(k, (porArea.get(k) ?? 0) + 1);
  }
  for (const [a, n] of [...porArea.entries()].sort()) {
    console.log(`  ${a.padEnd(25)} ${n}`);
  }

  console.log(`\n─── Por puesto ───`);
  const porPuesto = new Map<string, number>();
  for (const t of trabs) {
    const k = t.puesto ?? "(sin puesto)";
    porPuesto.set(k, (porPuesto.get(k) ?? 0) + 1);
  }
  for (const [p, n] of [...porPuesto.entries()].sort()) {
    console.log(`  ${p.padEnd(30)} ${n}`);
  }

  // ─── USUARIOS DEL SISTEMA ──────────────────────────────────────
  const users = await prisma.usuario.findMany({
    orderBy: [{ rol: "asc" }, { nombre: "asc" }],
  });

  console.log(`\n\n═══════════════════════════════════════════════════════════════`);
  console.log(`  USUARIOS DEL SISTEMA en Railway  (total: ${users.length})`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);

  for (const u of users) {
    console.log(`#${u.id}  ${u.nombre}`);
    console.log(`  Código: ${u.codigoEmpleado}   DNI: ${u.dni ?? "—"}   Email: ${u.email ?? "—"}`);
    console.log(`  Rol: ${u.rol}   Activo: ${u.activo}   Creado: ${u.createdAt.toISOString().slice(0, 10)}`);
    console.log();
  }

  console.log(`─── Por rol ───`);
  const porRol = new Map<string, number>();
  for (const u of users) porRol.set(u.rol, (porRol.get(u.rol) ?? 0) + 1);
  for (const [r, n] of [...porRol.entries()].sort()) {
    console.log(`  ${r.padEnd(20)} ${n}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

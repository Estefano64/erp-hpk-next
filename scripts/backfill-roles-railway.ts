// scripts/backfill-roles-railway.ts
//
// Asigna roles a las cuentas existentes según el puesto/área del trabajador
// vinculado. Reglas (acordadas con el usuario):
//
//   - Cuentas SIN trabajador (sistema, admin, facturación, ventas) → quedan
//     con el rol que ya tenían (típicamente "admin"). No tocar.
//   - Trabajador con puesto técnico (Soldador, Torno, Fresa, Mandrino,
//     Practicante, Evaluación/Armado) → roles ["tecnico", "evaluador"].
//   - Trabajador "Jefe de X" → mantener admin si lo tiene + agregar "evaluador"
//     (puede firmar como evaluador, no como supervisor).
//   - Luis Huerta (DNI 41916808) → ["admin", "tecnico", "evaluador",
//     "aprobador_evaluacion"] — caso especial: admin y operario y firma como
//     supervisor.
//   - Juan Vera Canales (DNI 73116071) → ["admin", "aprobador_evaluacion"] —
//     planner que aprueba evaluaciones.
//
// El admin puede ajustar manualmente desde la UI después de correr esto.
//
//   DRY_RUN=1 TARGET=railway npx tsx scripts/backfill-roles-railway.ts
//   TARGET=railway npx tsx scripts/backfill-roles-railway.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const TARGET = process.env.TARGET ?? "local";
const DRY_RUN = process.env.DRY_RUN === "1";
const url = TARGET === "railway" ? process.env.RAILWAY_DATABASE_URL : process.env.DATABASE_URL;
if (!url) { console.error(`falta URL de ${TARGET}`); process.exit(1); }
const prisma = new PrismaClient({ datasources: { db: { url } } });

const PUESTOS_TECNICOS = new Set([
  "Evaluación / Armado", "Fresa", "Mandrino", "Practicante", "Soldador", "Torno",
]);

// DNIs con roles especiales (override por nombre, robusto a variaciones).
const ESPECIAL_POR_DNI: Record<string, string[]> = {
  "41916808": ["admin", "tecnico", "evaluador", "aprobador_evaluacion"], // Luis Huerta
  "73116071": ["admin", "aprobador_evaluacion"],                          // Juan Vera Canales
};

function calcularRoles(trabajador: { puesto: string | null; area: string | null; dni: string | null }, rolesActuales: string[]): string[] {
  // 1) override especial por DNI tiene precedencia absoluta.
  if (trabajador.dni && ESPECIAL_POR_DNI[trabajador.dni]) {
    return ESPECIAL_POR_DNI[trabajador.dni];
  }

  const out = new Set<string>();
  // Mantener admin si ya lo tenía (no se quita admin por backfill).
  if (rolesActuales.includes("admin")) out.add("admin");

  const puesto = (trabajador.puesto ?? "").trim();
  const area = (trabajador.area ?? "").trim().toUpperCase();

  const esJefe = puesto.toUpperCase().startsWith("JEFE");
  const areaNoOperativa = area === "LIMPIEZA" || area === "SEGURIDAD" || area === "LOGISTICA";

  if (PUESTOS_TECNICOS.has(puesto)) {
    // Operario del taller: técnico + evaluador (firma sus propios trabajos).
    out.add("tecnico");
    out.add("evaluador");
  } else if (esJefe && !areaNoOperativa) {
    // Jefes de áreas operativas (mantenimiento, operaciones, etc.): firman
    // como evaluadores. Los jefes de logistica/limpieza/seguridad NO firman.
    out.add("evaluador");
  } else if (area === "LIMPIEZA" || area === "SEGURIDAD") {
    // Sin acceso de operación; viewer sirve para que puedan loguear.
    out.add("viewer");
  } else if (puesto.toUpperCase() === "COMPRAS" || area === "LOGISTICA") {
    // Placeholder "logistica" hasta que definamos sus permisos.
    out.add("logistica");
  } else if (area === "CONTABILIDAD") {
    out.add("contabilidad");
  } else if (area === "GERENCIA") {
    // Gerencia ya tiene admin habitualmente; si no, viewer.
    if (out.size === 0) out.add("viewer");
  }

  // Garantizamos al menos viewer.
  if (out.size === 0) out.add("viewer");
  return [...out].sort();
}

async function main() {
  console.log(`Target: ${TARGET}${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const usuarios = await prisma.usuario.findMany({
    include: { trabajador: true },
    orderBy: { nombre: "asc" },
  });

  let cambios = 0, sinCambios = 0;
  for (const u of usuarios) {
    if (!u.trabajador) {
      console.log(`[SKIP] ${u.codigoEmpleado} "${u.nombre}" — sin trabajador (sistema). roles=[${u.roles.join(",")}]`);
      sinCambios++;
      continue;
    }
    const nuevos = calcularRoles(u.trabajador, u.roles);
    const previos = [...u.roles].sort().join(",");
    const proximos = nuevos.join(",");
    if (previos === proximos) {
      console.log(`[OK]    ${u.codigoEmpleado} "${u.nombre}" — sin cambios [${proximos}]`);
      sinCambios++;
      continue;
    }
    console.log(`[UPDATE] ${u.codigoEmpleado} "${u.nombre}" — [${previos}] → [${proximos}]`);
    cambios++;
    if (!DRY_RUN) {
      await prisma.usuario.update({ where: { id: u.id }, data: { roles: nuevos } });
    }
  }

  console.log(`\nResumen: ${cambios} actualizados, ${sinCambios} sin cambios.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

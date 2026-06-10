/**
 * Reparación de una sola vez: estados/flags colgados de tareas del POOL.
 *
 * Contexto: hasta el fix, nada revertía el estado cuando una tarea perdía su
 * fecha (cambiar de semana, "sacar de la semana", overflow de emergencia al
 * pool, desmarcar HE). Quedaron filas con:
 *   A) estado = "programado" pero fecha_inicio NULL  → salen "programadas" en el pool
 *   B) publicado = true pero fecha_inicio NULL       → flag de plan congelado sin agenda
 *   C) horas_extras + fecha_fin sin fecha_inicio     → fin colgado al cambiar de semana
 * El código nuevo ya no genera estos casos; este script limpia los existentes.
 *
 * Uso:
 *   npx tsx scripts/repair-pool-estados.ts            (DRY-RUN: solo lista)
 *   npx tsx scripts/repair-pool-estados.ts --apply    (aplica los cambios)
 */

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";

const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(`  REPARACIÓN estados/flags colgados del pool   ${APPLY ? "[APLICAR]" : "[DRY-RUN]"}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  const colgadas = await prisma.planificacionOT.findMany({
    where: {
      fecha_inicio: null,
      OR: [
        { estado: "programado" },
        { publicado: true },
        { fecha_fin: { not: null } },
      ],
    },
    select: {
      id: true,
      ot_id: true,
      descripcion: true,
      estado: true,
      publicado: true,
      semana_plan: true,
      fecha_fin: true,
      tecnico: true,
      orden_trabajo: { select: { ot: true } },
    },
    orderBy: { id: "asc" },
  });

  const estadoColgado = colgadas.filter((r) => r.estado === "programado");
  const pubColgado = colgadas.filter((r) => r.publicado);
  const finColgado = colgadas.filter((r) => r.fecha_fin != null);

  console.log(`  A) estado "programado" sin fecha:  ${estadoColgado.length}`);
  console.log(`  B) publicado=true sin fecha:       ${pubColgado.length}`);
  console.log(`  C) fecha_fin sin fecha_inicio:     ${finColgado.length}\n`);

  if (colgadas.length > 0) {
    console.log("  ──────────────────────────────────────────────────────────");
    console.log("   id   OT        estado      pub fin  semana    tarea");
    console.log("  ──────────────────────────────────────────────────────────");
    for (const r of colgadas) {
      const ot = r.orden_trabajo?.ot != null ? String(r.orden_trabajo.ot) : (r.ot_id != null ? `#${r.ot_id}` : "S/OT");
      console.log(
        `   ${String(r.id).padStart(4)} ${ot.padEnd(8)} ${(r.estado ?? "—").padEnd(11)} ${r.publicado ? " ✔ " : "   "} ${r.fecha_fin ? " ✔ " : "   "} ${(r.semana_plan ?? "—").padEnd(8)}  ${(r.descripcion ?? "").slice(0, 40)}`,
      );
    }
    console.log("  ──────────────────────────────────────────────────────────\n");
  }

  if (!APPLY) {
    console.log("  DRY-RUN: no se modificó nada.");
    console.log("  Para aplicar:  npx tsx scripts/repair-pool-estados.ts --apply\n");
    return;
  }

  const a = await prisma.planificacionOT.updateMany({
    where: { fecha_inicio: null, estado: "programado" },
    data: { estado: "abierto" },
  });
  const b = await prisma.planificacionOT.updateMany({
    where: { fecha_inicio: null, publicado: true },
    data: { publicado: false },
  });
  const c = await prisma.planificacionOT.updateMany({
    where: { fecha_inicio: null, fecha_fin: { not: null } },
    data: { fecha_fin: null },
  });
  console.log(`  ✅ A) ${a.count} estado(s) programado → abierto`);
  console.log(`  ✅ B) ${b.count} flag(s) publicado limpiado(s)`);
  console.log(`  ✅ C) ${c.count} fecha_fin colgada(s) limpiada(s)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

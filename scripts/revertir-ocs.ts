// Revierte el rename de OCs hecho por scripts/recodificar-ocs.ts.
// Vuelve a los nombres originales (formato D{YY}{NNNN}) leyendo el mapeo
// guardado en ot_historial.datos_adicionales por las trazas que dejó el script
// anterior.
//
// Uso:
//   DATABASE_URL="..." npx tsx scripts/revertir-ocs.ts            # dry-run
//   DATABASE_URL="..." npx tsx scripts/revertir-ocs.ts --apply
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface Mapeo { anterior: string; nuevo: string }

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}`);

  // Trazas dejadas por scripts/recodificar-ocs.ts
  const historiales = await prisma.oTHistorial.findMany({
    where: { usuario: "seed-recodificar-ocs" },
    select: { id: true, datos_adicionales: true },
  });

  console.log(`📄 Trazas encontradas: ${historiales.length}`);

  const planes: Mapeo[] = [];
  for (const h of historiales) {
    if (!h.datos_adicionales) continue;
    try {
      const j = JSON.parse(h.datos_adicionales) as Mapeo;
      if (j.anterior && j.nuevo) planes.push(j);
    } catch { /* skip */ }
  }

  // Deduplicar (por si una OC fue renombrada por varias OTs vinculadas)
  const unicos = new Map<string, Mapeo>();
  for (const p of planes) unicos.set(p.nuevo, p);
  const final = [...unicos.values()];

  console.log(`📝 Reverts planeados: ${final.length}`);
  for (const p of final) {
    console.log(`  ${p.nuevo}  →  ${p.anterior}`);
  }

  if (!APPLY) {
    console.log("\n🟡 Para aplicar corré con --apply");
    return;
  }

  let ok = 0;
  let errs = 0;
  for (const p of final) {
    try {
      await prisma.$transaction(async (tx) => {
        const compra = await tx.compra.findUnique({
          where: { numero_po: p.nuevo },
          select: { id: true },
        });
        if (!compra) {
          console.warn(`  ⚠ No existe compra con numero_po=${p.nuevo}, salteando`);
          return;
        }
        await tx.compra.update({
          where: { id: compra.id },
          data: { numero_po: p.anterior },
        });
        await tx.oTRepuesto.updateMany({
          where: { po_id: compra.id },
          data: { nro_oc: p.anterior },
        });
      });
      ok++;
    } catch (e) {
      errs++;
      console.error(`✗ ${p.nuevo} → ${p.anterior}:`, e instanceof Error ? e.message : e);
    }
  }

  // Borrar las trazas de migración para no contar dos veces si se vuelve a correr.
  await prisma.oTHistorial.deleteMany({ where: { usuario: "seed-recodificar-ocs" } });

  console.log(`\n✓ Aplicado: ${ok} revertidas, ${errs} errores.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });

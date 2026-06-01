// scripts/borrar-movimiento-29-05.ts
//
// Borra UN movimiento de inventario específico:
//   - Material codigo: 000207 (Contratuerca 3J-6899 CATERPILLAR)
//   - Fecha:           2026-05-29
//   - Tipo:            SALIDA
//   - Doc referencia:  "OT 391926"
//   - Usuario:         Diego Jaime Monge
//
// NO toca stock_actual del material — el user explicitamente NO quiere
// devolver +1 unidad. Solo elimina el registro del histórico.
//
// Modos:
//   npx tsx scripts/borrar-movimiento-29-05.ts
//       DRY-RUN: muestra el movimiento que matchea y termina.
//
//   npx tsx scripts/borrar-movimiento-29-05.ts --apply
//       Borra el movimiento. Contra remoto pide I_KNOW=1.
//
// Para Railway:
//   $env:DATABASE_URL = "postgresql://...rlwy.net.../railway"
//   $env:I_KNOW = "1"
//   npx tsx scripts/borrar-movimiento-29-05.ts --apply

import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const I_KNOW = process.env.I_KNOW === "1";

function maskUrl(u: string): string {
  return u.replace(/:[^:@/]+@/, ":***@");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const esLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log("=".repeat(72));
  console.log(`BORRAR MOVIMIENTO 29/05/2026 — ${APPLY ? "[APPLY]" : "[DRY-RUN]"}`);
  console.log(`DB: ${maskUrl(dbUrl)}`);
  console.log(`Local: ${esLocal ? "SÍ" : "NO (Railway u otro remoto)"}`);
  console.log("=".repeat(72));

  if (APPLY && !esLocal && !I_KNOW) {
    console.error("\n⛔ Apuntás a BD remota. Re-ejecutar con I_KNOW=1 para confirmar.\n");
    await prisma.$disconnect();
    process.exit(2);
  }

  // Buscar el material por código.
  const material = await prisma.material.findUnique({
    where: { codigo: "000207" },
    select: { material_id: true, codigo: true, descripcion: true, stock_actual: true },
  });
  if (!material) {
    console.error("\n⛔ No se encontró el material 000207 en la BD.\n");
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\nMaterial: ${material.codigo} — ${material.descripcion}`);
  console.log(`Stock actual: ${material.stock_actual} (NO se modifica)`);

  // Buscar el movimiento exacto. Filtros conservadores para evitar borrar
  // algo distinto si el mismo material tuvo varias SALIDAS ese día.
  const inicioDia = new Date("2026-05-29T00:00:00.000Z");
  const finDia = new Date("2026-05-30T00:00:00.000Z");
  const candidatos = await prisma.movimientoInventario.findMany({
    where: {
      material_id: material.material_id,
      tipo_movimiento: "SALIDA",
      fecha_movimiento: { gte: inicioDia, lt: finDia },
    },
    orderBy: { id: "asc" },
  });

  console.log(`\nMovimientos candidatos del 2026-05-29 para este material: ${candidatos.length}`);
  for (const m of candidatos) {
    console.log(
      `  id=${m.id}  cant=${m.cantidad}  precio=${m.precio_unitario ?? "(null)"} ${m.moneda ?? ""}` +
      `  doc="${m.documento_referencia ?? ""}"  usuario="${m.usuario}"  fecha=${m.fecha_movimiento.toISOString()}`,
    );
  }

  if (candidatos.length === 0) {
    console.log("\n✓ No hay nada que borrar.\n");
    await prisma.$disconnect();
    return;
  }
  if (candidatos.length > 1) {
    console.log(`\n⚠️  Hay ${candidatos.length} candidatos para el mismo material+día.`);
    console.log("   Refinando filtro por documento_referencia='OT 391926' y usuario que contenga 'Diego'.");
  }

  // Filtro fino: documento "OT 391926" + usuario Diego (case-insensitive).
  const target = candidatos.find((m) => {
    const doc = (m.documento_referencia ?? "").trim();
    const user = (m.usuario ?? "").toLowerCase();
    return doc === "OT 391926" && user.includes("diego");
  });

  if (!target) {
    console.error("\n⛔ Ningún candidato matchea con doc='OT 391926' + usuario='Diego'. Abortar para no borrar algo equivocado.\n");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`\n🎯 Target identificado: id=${target.id}`);

  if (!APPLY) {
    console.log("\n(DRY-RUN — re-ejecutar con --apply para borrar.)\n");
    await prisma.$disconnect();
    return;
  }

  console.log("\n🔥 Borrando...");
  await prisma.movimientoInventario.delete({ where: { id: target.id } });
  console.log(`   ✓ Movimiento ${target.id} eliminado del histórico.`);
  console.log(`   ✓ stock_actual del material 000207 NO se modificó (sigue en ${material.stock_actual}).`);

  console.log("\n✅ Listo.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

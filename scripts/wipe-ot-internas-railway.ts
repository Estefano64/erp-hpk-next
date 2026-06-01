// scripts/wipe-ot-internas-railway.ts
//
// Borra TODAS las OT internas existentes en la BD apuntada por DATABASE_URL.
// Pensado para correr una sola vez ANTES de deployar el cambio de formato
// (OT-INT-XXXX → OIXXXXYY): así el cliente arranca con todas las OT internas
// en el formato nuevo y no quedan reqs viejos con nro_req "OT-INT-0001-1".
//
// NO toca nada más:
//   - OT externas (REP/BIE/SER): INTACTAS
//   - Catálogos (clientes, proveedores, materiales): INTACTOS
//   - OCs no vinculadas a OT internas: INTACTAS
//   - Movimientos de inventario de OCs externas: INTACTOS
//
// SÍ borra en cascada (por la FK de OTRepuesto / OtAdjunto / OTHistorial):
//   - Requerimientos de las OT internas a borrar
//   - Adjuntos de las OT internas a borrar (más archivos en R2 — best-effort)
//   - Historial de las OT internas a borrar
//
// Modos:
//   npx tsx scripts/wipe-ot-internas-railway.ts
//       → DRY-RUN: muestra qué borraría y termina.
//
//   npx tsx scripts/wipe-ot-internas-railway.ts --apply
//       → Borra. Pide confirmación con I_KNOW=1 si la DB no es local.
//
// Para Railway: en una terminal, exportá temporalmente el URL de Railway
// (sacalo de Railway → Postgres service → Variables → DATABASE_PUBLIC_URL)
// y corré con I_KNOW=1:
//
//   $env:DATABASE_URL = "postgresql://...rlwy.net.../railway"
//   $env:I_KNOW = "1"
//   npx tsx scripts/wipe-ot-internas-railway.ts --apply
//
// Después del wipe, deployás la app (que aplica las migraciones de formato
// OI/PPP/tipo_pago) y el cliente crea las nuevas con OI000126, OI000226, etc.

import { prisma } from "../src/lib/prisma";
import { deleteObject } from "../src/lib/r2-helpers";

const APPLY = process.argv.includes("--apply");
const I_KNOW = process.env.I_KNOW === "1";

function maskUrl(u: string): string {
  return u.replace(/:[^:@/]+@/, ":***@");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "(sin DATABASE_URL)";
  const esLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");

  console.log("=".repeat(72));
  console.log(`WIPE OT INTERNAS — ${APPLY ? "[APPLY]" : "[DRY-RUN]"}`);
  console.log(`DB: ${maskUrl(dbUrl)}`);
  console.log(`Local: ${esLocal ? "SÍ" : "NO (Railway u otro remoto)"}`);
  console.log("=".repeat(72));

  if (APPLY && !esLocal && !I_KNOW) {
    console.error("\n⛔ Apuntás a una BD remota.");
    console.error("   Para confirmar que sabés lo que hacés, re-ejecutá con I_KNOW=1.");
    console.error("   Ej (PowerShell):");
    console.error("     $env:I_KNOW=\"1\"; npx tsx scripts/wipe-ot-internas-railway.ts --apply\n");
    await prisma.$disconnect();
    process.exit(2);
  }

  // Listar las OT internas + sus dependientes.
  const otsInternas = await prisma.ordenTrabajoInterna.findMany({
    select: {
      id: true,
      ot: true,
      descripcion: true,
      fecha_creacion: true,
      activo: true,
      _count: {
        select: { repuestos: true, adjuntos: true, historial: true },
      },
    },
    orderBy: { id: "asc" },
  });

  console.log(`\nOT internas encontradas: ${otsInternas.length}`);
  if (otsInternas.length === 0) {
    console.log("Nada que borrar.\n");
    await prisma.$disconnect();
    return;
  }

  for (const o of otsInternas) {
    const fecha = o.fecha_creacion?.toISOString().slice(0, 10) ?? "—";
    const desc = (o.descripcion ?? "").slice(0, 60);
    console.log(
      `  id=${o.id}  ot=${o.ot ?? "(null)"}  ${fecha}  activo=${o.activo}` +
      `  reqs=${o._count.repuestos}  adjuntos=${o._count.adjuntos}  hist=${o._count.historial}` +
      `  "${desc}"`,
    );
  }

  // Adjuntos en R2 que vamos a limpiar best-effort.
  const adjuntos = await prisma.otAdjunto.findMany({
    where: { orden_trabajo_interna_id: { in: otsInternas.map((o) => o.id) } },
    select: { r2_key: true },
  });
  const adjuntosReqsInternas = await prisma.oTRepuestoAdjunto.findMany({
    where: {
      ot_repuesto: { orden_trabajo_interna_id: { in: otsInternas.map((o) => o.id) } },
    },
    select: { r2_key: true },
  });
  const totalR2 = adjuntos.length + adjuntosReqsInternas.length;
  console.log(`\nArchivos R2 a limpiar (best-effort): ${totalR2}`);

  console.log("\nSe MANTIENE:");
  console.log("   OT externas (REP/BIE/SER), adjuntos, historial, evaluaciones");
  console.log("   Catálogos, usuarios, configuración");
  console.log("   OCs y movimientos de inventario que NO sean de estas OT internas");

  if (!APPLY) {
    console.log("\n(DRY-RUN — no se borró nada. Re-ejecutar con --apply para aplicar.)\n");
    await prisma.$disconnect();
    return;
  }

  console.log("\n🔥 Aplicando...");
  await prisma.$transaction(async (tx) => {
    const ids = otsInternas.map((o) => o.id);

    // 1. Adjuntos de los requerimientos de estas OT internas (FK Cascade
    //    desde OTRepuesto borra esto, pero somos explícitos para los R2 keys).
    await tx.oTRepuestoAdjunto.deleteMany({
      where: { ot_repuesto: { orden_trabajo_interna_id: { in: ids } } },
    });

    // 2. Requerimientos de estas OT internas (la FK a Compra es opcional —
    //    si la req estaba en una OC, dejamos la OC intacta pero el req se va).
    //    Limpiamos po_id antes para evitar FK constraint si Prisma lo intenta.
    await tx.oTRepuesto.updateMany({
      where: { orden_trabajo_interna_id: { in: ids } },
      data: { po_id: null },
    });
    await tx.oTRepuesto.deleteMany({
      where: { orden_trabajo_interna_id: { in: ids } },
    });

    // 3. Adjuntos y historial de las OT internas (caen por cascade pero
    //    los borramos explícito por claridad de logs).
    await tx.otAdjunto.deleteMany({
      where: { orden_trabajo_interna_id: { in: ids } },
    });
    await tx.oTHistorial.deleteMany({
      where: { orden_trabajo_interna_id: { in: ids } },
    });

    // 4. Las OT internas mismas.
    const del = await tx.ordenTrabajoInterna.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`   ✓ ${del.count} OT(s) internas borradas`);
  });

  // 5. R2: borrar los archivos físicos (best-effort, fuera de la transacción).
  if (totalR2 > 0) {
    console.log(`   Limpiando ${totalR2} archivo(s) en R2...`);
    const keys = [...adjuntos, ...adjuntosReqsInternas].map((a) => a.r2_key);
    let ok = 0;
    let fail = 0;
    for (const k of keys) {
      try {
        await deleteObject(k);
        ok++;
      } catch (e) {
        fail++;
        console.warn(`   ⚠ no se pudo borrar ${k}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`   ✓ R2: ${ok} borrados, ${fail} fallidos (los fallidos quedan huérfanos)`);
  }

  console.log("\n✅ Wipe completado. La BD quedó lista para arrancar con OT internas en formato OI.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

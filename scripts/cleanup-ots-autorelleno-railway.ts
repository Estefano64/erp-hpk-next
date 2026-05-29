// scripts/cleanup-ots-autorelleno-railway.ts
//
// Limpia los campos de OrdenTrabajo que fueron AUTORRELLENADOS por el script
// de import (no estaban en el Excel original):
//
// 1. tipo_codigo = "REP"                 → null
// 2. recursos_status_codigo = "Recursos completos" → null
// 3. usuario_crea = "import-xlsx"        → null
// 4. garantia_codigo = "No" cuando NO existe valor original en el Excel
//                                         → null
//    (los OTs con garantia_codigo "Si" se respetan)
// 5. cod_rep_flota = "-"                 → null  (16 OTs)
//
// Solo afecta OTs cuyo usuario_crea sea "import-xlsx" (el import masivo).
// OTs creadas manualmente por usuarios reales no se tocan.
//
// Uso:
//   npx tsx scripts/cleanup-ots-autorelleno-railway.ts             (DRY-RUN)
//   npx tsx scripts/cleanup-ots-autorelleno-railway.ts --apply     (escribe)

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (ESCRIBE)" : "DRY-RUN"}\n`);

  // Filtro base: solo OTs del import masivo. Las que un usuario real creó
  // (con su nombre en usuario_crea) NO se tocan.
  const FROM_IMPORT = { usuario_crea: "import-xlsx" as string | null };

  // ── Conteos previos por campo ─────────────────────────────────────────
  const totalImport = await prisma.ordenTrabajo.count({ where: FROM_IMPORT });
  const conTipoRep = await prisma.ordenTrabajo.count({
    where: { ...FROM_IMPORT, tipo_codigo: "REP" },
  });
  const conRecursosCompletos = await prisma.ordenTrabajo.count({
    where: { ...FROM_IMPORT, recursos_status_codigo: "Recursos completos" },
  });
  const conGarantiaNoHardcoded = await prisma.ordenTrabajo.count({
    where: { ...FROM_IMPORT, garantia_codigo: "No" },
  });
  const conGarantiaSi = await prisma.ordenTrabajo.count({
    where: { ...FROM_IMPORT, garantia_codigo: "Si" },
  });
  const conFlotaGuion = await prisma.ordenTrabajo.count({
    where: { cod_rep_flota: "-" },
  });
  const totalConUsuarioCrea = await prisma.ordenTrabajo.count({
    where: FROM_IMPORT,
  });

  console.log(`📊 Estado actual de OTs importadas (usuario_crea = "import-xlsx"):`);
  console.log(`   Total OTs importadas:                 ${totalImport}`);
  console.log(`   Con tipo_codigo = "REP":              ${conTipoRep}`);
  console.log(`   Con recursos_status = "Recursos comp.": ${conRecursosCompletos}`);
  console.log(`   Con garantia_codigo = "No":           ${conGarantiaNoHardcoded}`);
  console.log(`   Con garantia_codigo = "Si":           ${conGarantiaSi} (se respeta)`);
  console.log(`   Con cod_rep_flota = "-":              ${conFlotaGuion}`);
  console.log(`   Con usuario_crea = "import-xlsx":     ${totalConUsuarioCrea}\n`);

  if (!APPLY) {
    console.log(`🟡 DRY-RUN. Lo que se haría con --apply:`);
    console.log(`   UPDATE → tipo_codigo: null            (${conTipoRep} OTs)`);
    console.log(`   UPDATE → recursos_status_codigo: null (${conRecursosCompletos} OTs)`);
    console.log(`   UPDATE → garantia_codigo: null        (${conGarantiaNoHardcoded} OTs con "No")`);
    console.log(`   UPDATE → cod_rep_flota: null          (${conFlotaGuion} OTs con "-")`);
    console.log(`   UPDATE → usuario_crea: null           (${totalConUsuarioCrea} OTs con "import-xlsx")`);
    console.log(`\n💡 Para aplicar: npx tsx scripts/cleanup-ots-autorelleno-railway.ts --apply`);
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────
  console.log(`🔴 Aplicando UPDATEs...`);

  const r1 = await prisma.ordenTrabajo.updateMany({
    where: { ...FROM_IMPORT, tipo_codigo: "REP" },
    data: { tipo_codigo: null },
  });
  console.log(`   ✓ tipo_codigo → null:           ${r1.count}`);

  const r2 = await prisma.ordenTrabajo.updateMany({
    where: { ...FROM_IMPORT, recursos_status_codigo: "Recursos completos" },
    data: { recursos_status_codigo: null },
  });
  console.log(`   ✓ recursos_status_codigo → null: ${r2.count}`);

  const r3 = await prisma.ordenTrabajo.updateMany({
    where: { ...FROM_IMPORT, garantia_codigo: "No" },
    data: { garantia_codigo: null },
  });
  console.log(`   ✓ garantia_codigo "No" → null:  ${r3.count}`);

  const r4 = await prisma.ordenTrabajo.updateMany({
    where: { cod_rep_flota: "-" },
    data: { cod_rep_flota: null },
  });
  console.log(`   ✓ cod_rep_flota "-" → null:     ${r4.count}`);

  const r5 = await prisma.ordenTrabajo.updateMany({
    where: FROM_IMPORT,
    data: { usuario_crea: null },
  });
  console.log(`   ✓ usuario_crea → null:          ${r5.count}`);

  console.log(`\n✅ Cleanup completado`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

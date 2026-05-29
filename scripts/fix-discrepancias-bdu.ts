// Aplica los fixes de las 4 discrepancias reportadas:
//
// 1. OT 353425: BDU tiene 2 filas (CAT/988K/EQ6140 y KOM/PC1250/EQ8109) — ambas
//    con cliente=Antapaccay y descripcion="CILINDRO DE VOLTEO DE BUCKET".
//    Railway tiene la versión EQ8109/PC1250 pero con descripcion="CILINDRO DE
//    DIRECCION" y fabricante=Caterpillar (incorrecto). Fix:
//    - descripcion → "CILINDRO DE VOLTEO DE BUCKET"
//    - fabricante → Komatsu (id=2) — coincide con el equipo EQ8109/PC1250.
//    NOTA: la duplicación en BDU es un issue de fuente; aquí solo mantenemos
//    una OT (la BD enforza unicidad de `ot`). El usuario debe depurar BDU.
//
// 2. OTs 288024/288124/288224: cliente debería ser UNIMAQ (id=9), no Antapaccay.
//
// 3. OTs 258224/259124/264324/283524/283624: descripcion → "CILINDRO DE VOLTEO DE RIPPER"
//    OTs 389626/390026: descripcion → "CILINDRO DE LEVANTE DE RIPPER"
//
// 4. OT 247324: fabricante → CATERPILLAR (id=1)
//    OTs 290224/291424: fabricante → WBM (id=4)

import { PrismaClient } from "@prisma/client";

const RAILWAY_URL =
  "postgresql://postgres:vthphXsotIJPSGPdpZkkLRSDVxVuBHVG@yamabiko.proxy.rlwy.net:42613/railway";
const prisma = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Modo: ${APPLY ? "🔴 APPLY" : "🟡 DRY-RUN"}\n`);

  const ops: Array<{ desc: string; ot: number; data: Record<string, unknown> }> = [
    // 1. OT 353425
    {
      desc: "OT 353425: descripcion + fabricante Komatsu",
      ot: 353425,
      data: { descripcion: "CILINDRO DE VOLTEO DE BUCKET", id_fabricante: 2 },
    },
    // 2. Cliente UNIMAQ (id=9)
    { desc: "OT 288024: cliente → UNIMAQ", ot: 288024, data: { id_cliente: 9 } },
    { desc: "OT 288124: cliente → UNIMAQ", ot: 288124, data: { id_cliente: 9 } },
    { desc: "OT 288224: cliente → UNIMAQ", ot: 288224, data: { id_cliente: 9 } },
    // 3. Descripcion → VOLTEO DE RIPPER
    { desc: "OT 258224: descripcion VOLTEO DE RIPPER", ot: 258224, data: { descripcion: "CILINDRO DE VOLTEO DE RIPPER" } },
    { desc: "OT 259124: descripcion VOLTEO DE RIPPER", ot: 259124, data: { descripcion: "CILINDRO DE VOLTEO DE RIPPER" } },
    { desc: "OT 264324: descripcion VOLTEO DE RIPPER", ot: 264324, data: { descripcion: "CILINDRO DE VOLTEO DE RIPPER" } },
    { desc: "OT 283524: descripcion VOLTEO DE RIPPER", ot: 283524, data: { descripcion: "CILINDRO DE VOLTEO DE RIPPER" } },
    { desc: "OT 283624: descripcion VOLTEO DE RIPPER", ot: 283624, data: { descripcion: "CILINDRO DE VOLTEO DE RIPPER" } },
    // 3b. Descripcion → LEVANTE DE RIPPER
    { desc: "OT 389626: descripcion LEVANTE DE RIPPER", ot: 389626, data: { descripcion: "CILINDRO DE LEVANTE DE RIPPER" } },
    { desc: "OT 390026: descripcion LEVANTE DE RIPPER", ot: 390026, data: { descripcion: "CILINDRO DE LEVANTE DE RIPPER" } },
    // 4. Fabricante
    { desc: "OT 247324: fabricante → CATERPILLAR (id=1)", ot: 247324, data: { id_fabricante: 1 } },
    { desc: "OT 290224: fabricante → WBM (id=4)", ot: 290224, data: { id_fabricante: 4 } },
    { desc: "OT 291424: fabricante → WBM (id=4)", ot: 291424, data: { id_fabricante: 4 } },
  ];

  console.log(`📋 ${ops.length} operaciones planificadas:\n`);
  for (const o of ops) {
    const ot = await prisma.ordenTrabajo.findFirst({
      where: { ot: o.ot },
      select: { id: true, ot: true, descripcion: true, id_cliente: true, id_fabricante: true },
    });
    if (!ot) {
      console.log(`   ⚠ ${o.desc} — OT ${o.ot} NO EXISTE en Railway`);
      continue;
    }
    console.log(`   ✓ ${o.desc}`);
    if (!APPLY) {
      console.log(`       data: ${JSON.stringify(o.data)}`);
    } else {
      await prisma.ordenTrabajo.update({ where: { id: ot.id }, data: o.data });
    }
  }

  if (!APPLY) {
    console.log(`\n🟡 DRY-RUN. Para aplicar: npx tsx scripts/fix-discrepancias-bdu.ts --apply`);
  } else {
    console.log(`\n✅ Aplicado`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

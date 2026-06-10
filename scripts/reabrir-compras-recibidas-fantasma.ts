// Reabre las compras que figuran ENTREGADO/COMPLETO pero tienen reqs vinculados
// con cantidad_recibida = 0 → para el flujo del user, "salen recibidas pero
// el stock no está". Las pasamos a INCOMPLETO para que aparezcan en
// /movimientos como recepcionables. No tocamos stock (eso lo hará el user
// cuando re-recepcione).
//
// Uso: npx tsx scripts/reabrir-compras-recibidas-fantasma.ts           # dry-run
//      npx tsx scripts/reabrir-compras-recibidas-fantasma.ts --apply   # aplica
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  type Row = {
    compra_id: number; numero_po: string; status_oc_codigo: string;
    reqs_en_cero: bigint;
  };
  const candidatas = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT c.id AS compra_id, c.numero_po, c.status_oc_codigo,
           COUNT(r.id) AS reqs_en_cero
      FROM compras c
      JOIN ot_repuestos r ON r.po_id = c.id
     WHERE c.status_oc_codigo IN ('ENTREGADO','COMPLETO')
       AND c.es_almacen_abierto = false
       AND COALESCE(r.cantidad_recibida, 0) = 0
       AND r.status_requerimiento_codigo NOT IN ('ANULADO','DESAPROBADO')
     GROUP BY c.id, c.numero_po, c.status_oc_codigo
     ORDER BY c.id DESC
  `);

  console.log(`Compras a reabrir: ${candidatas.length}`);
  for (const c of candidatas) {
    console.log(`  ${APPLY ? "[APPLY]" : "[dry-run]"} Compra ${c.compra_id} ${c.numero_po} status=${c.status_oc_codigo} reqs_en_cero=${c.reqs_en_cero} → INCOMPLETO`);
    if (!APPLY) continue;
    await prisma.compra.update({
      where: { id: c.compra_id },
      data: {
        status_oc_codigo: "INCOMPLETO",
        observaciones: {
          set: `Reabierta automáticamente — figuraba ${c.status_oc_codigo} pero ${c.reqs_en_cero} req(s) tenían cantidad_recibida=0. Re-recepcionar desde Movimientos.`,
        },
      },
    });
  }
  if (!APPLY) {
    console.log(`\nDry-run. Para aplicar: npx tsx scripts/reabrir-compras-recibidas-fantasma.ts --apply`);
  } else {
    console.log(`\n✓ Aplicado.`);
  }
}
main().finally(() => prisma.$disconnect());

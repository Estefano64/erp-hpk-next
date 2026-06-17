// Reconciliación de OTRepuesto status=CONSUMIDO_OC_ABIERTA con cantidad_recibida
// ya seteada (flujo viejo): bajamos cantidad_recibida a 0 para que aparezcan
// en /despachos por OT (el filtro `cant_pendiente > 0` los excluía).
//
// Solo afecta items que NUNCA fueron entregados al técnico (status sigue siendo
// CONSUMIDO_OC_ABIERTA, no ENTREGADO). Si ya fue marcado como ENTREGADO no se
// toca.
//
// Uso: npx tsx scripts/reconciliar-consumidos-oc-abierta.ts            # dry-run
//      npx tsx scripts/reconciliar-consumidos-oc-abierta.ts --apply    # aplica
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const candidatos = await prisma.$queryRawUnsafe<{
    id: number; nro_req: string | null; item_req: number | null;
    ot_id: number | null; orden_trabajo_interna_id: number | null;
    cantidad: string; cantidad_recibida: string; po_id: number | null;
  }[]>(`
    SELECT id, nro_req, item_req, ot_id, orden_trabajo_interna_id,
           cantidad::text, cantidad_recibida::text, po_id
      FROM ot_repuestos
     WHERE status_oc_codigo = 'CONSUMIDO_OC_ABIERTA'
       AND COALESCE(cantidad_recibida, 0) > 0
     ORDER BY id ASC
  `);

  console.log(`Reqs CONSUMIDO_OC_ABIERTA con cantidad_recibida > 0: ${candidatos.length}`);
  for (const r of candidatos.slice(0, 30)) {
    console.log(`  ${APPLY ? "[APPLY]" : "[dry-run]"} REQ ${r.nro_req}/${r.item_req}  ot_id=${r.ot_id}  po_id=${r.po_id}  cant=${r.cantidad}/${r.cantidad_recibida} → cantidad_recibida=0`);
  }
  if (candidatos.length > 30) console.log(`  ... y ${candidatos.length - 30} más`);

  if (!APPLY) {
    console.log("\nDry-run. Para aplicar: npx tsx scripts/reconciliar-consumidos-oc-abierta.ts --apply");
    return;
  }
  if (candidatos.length === 0) return;
  const ids = candidatos.map((r) => r.id);
  const result = await prisma.oTRepuesto.updateMany({
    where: { id: { in: ids } },
    data: { cantidad_recibida: 0, fecha_entrega_real: null },
  });
  console.log(`\n✓ Actualizados: ${result.count}`);
}
main().finally(() => prisma.$disconnect());

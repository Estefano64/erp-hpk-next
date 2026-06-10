// Reconciliación: reqs (OTRepuesto) que están en status_oc PROCESO|INCOMPLETO
// pero ya tienen cantidad_recibida = cantidad → marcarlos como ENTREGADO.
//
// Esto sucedía cuando el despacho a la OT (consumir-de-almacen viejo o algún
// otro path) incrementaba cantidad_recibida pero no movía el status_oc.
// Resultado: el item queda "fantasma" — fully despachado pero el sistema lo
// muestra como en proceso, y el módulo /despachos lo filtra como "ya hecho"
// (cant_pendiente=0). El user no entiende por qué la OT no aparece.
//
// Uso: npx tsx scripts/reconciliar-otrepuestos-despachados.ts            # dry-run
//      npx tsx scripts/reconciliar-otrepuestos-despachados.ts --apply    # aplica
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  const candidatos = await prisma.$queryRawUnsafe<{
    id: number; nro_req: string | null; item_req: number | null;
    ot_id: number | null; orden_trabajo_interna_id: number | null;
    status_oc_codigo: string | null;
    cantidad: string; cantidad_recibida: string;
  }[]>(`
    SELECT r.id, r.nro_req, r.item_req, r.ot_id, r.orden_trabajo_interna_id,
           r.status_oc_codigo,
           r.cantidad::text, r.cantidad_recibida::text
      FROM ot_repuestos r
     WHERE r.status_oc_codigo IN ('PROCESO','INCOMPLETO')
       AND r.status_requerimiento_codigo NOT IN ('ANULADO','DESAPROBADO')
       AND r.cantidad > 0
       AND COALESCE(r.cantidad_recibida, 0) >= r.cantidad
     ORDER BY r.id ASC
  `);

  console.log(`Reqs con status PROCESO/INCOMPLETO + cantidad_recibida=cantidad: ${candidatos.length}`);
  for (const r of candidatos.slice(0, 50)) {
    console.log(`  ${APPLY ? "[APPLY]" : "[dry-run]"} REQ ${r.nro_req}/${r.item_req}  ot_id=${r.ot_id}/ot_int=${r.orden_trabajo_interna_id}  status=${r.status_oc_codigo}  cant=${r.cantidad}/rec=${r.cantidad_recibida} → ENTREGADO`);
  }
  if (candidatos.length > 50) console.log(`  ... y ${candidatos.length - 50} más`);

  if (!APPLY) {
    console.log("\nDry-run. Para aplicar: npx tsx scripts/reconciliar-otrepuestos-despachados.ts --apply");
    return;
  }
  if (candidatos.length === 0) return;
  const ids = candidatos.map((r) => r.id);
  const result = await prisma.oTRepuesto.updateMany({
    where: { id: { in: ids } },
    data: { status_oc_codigo: "ENTREGADO" },
  });
  console.log(`\n✓ Actualizados: ${result.count}`);
}
main().finally(() => prisma.$disconnect());

// Reconciliar Material.stock_actual contra la suma de movimientos. Si hay
// discrepancias, agregamos un MovimientoInventario tipo AJUSTE que iguale el
// stock_actual con el ledger. Sin --apply solo reporta (dry-run).
//
// Uso: npx tsx scripts/reconciliar-stock.ts            # dry-run
//      npx tsx scripts/reconciliar-stock.ts --apply    # aplica
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

type Row = {
  material_id: number;
  codigo: string;
  stock_actual: string;
  suma_movs: string;
  diff: string;
};

async function main() {
  const inconsistencias = await prisma.$queryRawUnsafe<Row[]>(`
    WITH movs AS (
      SELECT material_id,
             SUM(CASE WHEN tipo_movimiento='ENTRADA' THEN cantidad
                      WHEN tipo_movimiento='SALIDA'  THEN -cantidad ELSE 0 END) AS suma
        FROM movimientos_inventario
       WHERE material_id IS NOT NULL
       GROUP BY material_id
    )
    SELECT m.material_id, m.codigo,
           m.stock_actual::text AS stock_actual,
           COALESCE(movs.suma, 0)::text AS suma_movs,
           (m.stock_actual - COALESCE(movs.suma, 0))::text AS diff
      FROM material m
      LEFT JOIN movs ON movs.material_id = m.material_id
     WHERE ABS(m.stock_actual - COALESCE(movs.suma, 0)) > 0.001
     ORDER BY ABS(m.stock_actual - COALESCE(movs.suma, 0)) DESC
  `);

  console.log(`\n=== ${inconsistencias.length} inconsistencias ===\n`);
  if (inconsistencias.length === 0) {
    console.log("Nada que reconciliar.");
    return;
  }

  for (const x of inconsistencias) {
    const diff = new Prisma.Decimal(x.diff); // stock_actual - suma_movs
    // Si diff > 0  → stock_actual está por encima del ledger → falta una SALIDA o sobra una ENTRADA.
    //   Compensamos con una SALIDA tipo "AJUSTE".
    // Si diff < 0  → stock_actual está por debajo del ledger → falta una ENTRADA o sobra una SALIDA.
    //   Compensamos con una ENTRADA tipo "AJUSTE".
    const tipo = diff.gt(0) ? "SALIDA" : "ENTRADA";
    const cantidad = diff.abs();
    const accion = APPLY ? "[APPLY]" : "[dry-run]";
    console.log(`${accion} [${x.codigo}] stock=${x.stock_actual} movs=${x.suma_movs} diff=${x.diff} → ${tipo} ${cantidad}`);
    if (!APPLY) continue;
    await prisma.movimientoInventario.create({
      data: {
        material_id: x.material_id,
        tipo_movimiento: tipo,
        cantidad,
        documento_referencia: "AJUSTE-RECONCILIACION",
        observacion: `Ajuste automático: stock_actual (${x.stock_actual}) no coincidía con sum(movs) (${x.suma_movs}). Diff=${x.diff}.`,
        usuario: "sistema-reconciliacion",
      },
    });
  }
  if (!APPLY) {
    console.log("\nDry-run terminado. Para aplicar: npx tsx scripts/reconciliar-stock.ts --apply");
  } else {
    console.log("\n✓ Aplicado.");
  }
}
main().finally(() => prisma.$disconnect());

// Helpers para movimientos de inventario.
// Por ahora: cascada de resolución del precio al hacer una SALIDA, para que el
// movimiento quede con un snapshot del costo real al momento de salir.

import { Prisma } from "@prisma/client";

export interface PrecioSalida {
  precio: Prisma.Decimal | null;
  moneda: string | null;
}

/**
 * Resuelve el precio unitario y moneda para registrar en un MovimientoInventario
 * tipo SALIDA. Cascada:
 *   1) material.precio (si > 0) + material.moneda_codigo
 *   2) último CompraDetalle del material (precio_unitario de la OC más reciente
 *      no anulada) + moneda de la compra
 *   3) null
 *
 * Debe correrse dentro de una transacción para evitar inconsistencias si el
 * precio del catálogo se actualiza concurrentemente.
 */
export async function resolverPrecioSalida(
  tx: Prisma.TransactionClient,
  materialId: number,
): Promise<PrecioSalida> {
  // 1) Snapshot del precio del catálogo.
  const mat = await tx.material.findUnique({
    where: { material_id: materialId },
    select: { precio: true, moneda_codigo: true },
  });
  if (mat?.precio != null) {
    const p = new Prisma.Decimal(mat.precio);
    if (p.gt(0)) {
      return { precio: p, moneda: mat.moneda_codigo ?? "USD" };
    }
  }

  // 2) Fallback: último precio de OC para el material (excluyendo anuladas).
  const det = await tx.compraDetalle.findFirst({
    where: {
      material_id: materialId,
      compra: { status_oc_codigo: { notIn: ["ANULADO", "DEVOLUCION"] } },
    },
    select: {
      precio_unitario: true,
      compra: { select: { moneda_codigo: true, fecha_solicitud: true } },
    },
    orderBy: [{ compra: { fecha_solicitud: "desc" } }, { id: "desc" }],
  });
  if (det?.precio_unitario != null) {
    const p = new Prisma.Decimal(det.precio_unitario);
    if (p.gt(0)) {
      return { precio: p, moneda: det.compra?.moneda_codigo ?? "USD" };
    }
  }

  // 3) Sin precio disponible.
  return { precio: null, moneda: null };
}

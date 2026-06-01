// Helpers para movimientos de inventario.
//
// Sistema de costeo: PROMEDIO PONDERADO (PPP).
//   - Cada ENTRADA contra OC recalcula `Material.costo_promedio`:
//       costo_promedio_nuevo = (stock_act × costo_promedio_actual
//                                + cantidad_entrada × precio_oc)
//                              / (stock_act + cantidad_entrada)
//   - La SALIDA de almacén toma `costo_promedio` como precio del movimiento.
//   - Si las monedas difieren entre OCs entrantes, se conserva la última.
//
// Por qué PPP y no FIFO: PPP no requiere tabla de lotes — el promedio vive
// en `material.costo_promedio` y se actualiza in-place. Es lo más usado en
// industria de mantenimiento y permite calcular costos de OT con una sola
// query por material.

import { Prisma } from "@prisma/client";

export interface PrecioSalida {
  precio: Prisma.Decimal | null;
  moneda: string | null;
}

/**
 * Resuelve el precio unitario y moneda para registrar en un MovimientoInventario
 * tipo SALIDA. Cascada:
 *   1) material.costo_promedio (PPP — el más exacto si hay ingresos previos)
 *   2) material.precio (catálogo — si nunca hubo ENTRADAS)
 *   3) último CompraDetalle del material (precio_unitario de la OC más reciente
 *      no anulada) + moneda de la compra
 *   4) null
 *
 * Debe correrse dentro de una transacción para evitar inconsistencias si el
 * precio del catálogo se actualiza concurrentemente.
 */
export async function resolverPrecioSalida(
  tx: Prisma.TransactionClient,
  materialId: number,
): Promise<PrecioSalida> {
  const mat = await tx.material.findUnique({
    where: { material_id: materialId },
    select: {
      precio: true,
      moneda_codigo: true,
      costo_promedio: true,
      costo_promedio_moneda: true,
    },
  });

  // 1) PPP: si hay un costo promedio mantenido por las ENTRADAs, ese gana.
  if (mat?.costo_promedio != null) {
    const p = new Prisma.Decimal(mat.costo_promedio);
    if (p.gt(0)) {
      return { precio: p, moneda: mat.costo_promedio_moneda ?? "USD" };
    }
  }

  // 2) Catálogo: si nunca entró mercadería, el precio del catálogo es la
  //    mejor aproximación.
  if (mat?.precio != null) {
    const p = new Prisma.Decimal(mat.precio);
    if (p.gt(0)) {
      return { precio: p, moneda: mat.moneda_codigo ?? "USD" };
    }
  }

  // 3) Fallback final: último precio de OC para el material (excluyendo anuladas).
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

  // 4) Sin precio disponible.
  return { precio: null, moneda: null };
}

/**
 * Recalcula el costo promedio ponderado del material al recibir una ENTRADA.
 *
 * Debe llamarse DENTRO de la transacción de ingreso-po, ANTES del increment
 * de stock_actual (necesita el stock previo para la fórmula).
 *
 * @param stockPrevio    cantidad en stock ANTES de aplicar esta entrada
 * @param costoPrevio    `Material.costo_promedio` antes de aplicar (puede ser null)
 * @param cantidadEntrada unidades que están entrando ahora
 * @param precioEntrada  `CompraDetalle.precio_unitario` de esta entrada
 * @param monedaEntrada  moneda de la OC que origina la entrada
 *
 * Si el stock previo es ≤ 0, el costo nuevo es el precio de la entrada (no hay
 * con qué promediar). Si la entrada no tiene precio (>0), el promedio no se
 * actualiza (mantiene el previo) — evita corromper el promedio con ceros.
 */
export async function recalcularCostoPromedio(
  tx: Prisma.TransactionClient,
  materialId: number,
  params: {
    stockPrevio: Prisma.Decimal | number;
    costoPrevio: Prisma.Decimal | number | null;
    cantidadEntrada: Prisma.Decimal | number;
    precioEntrada: Prisma.Decimal | number | null;
    monedaEntrada: string | null;
  },
): Promise<void> {
  const cantEntrada = new Prisma.Decimal(params.cantidadEntrada);
  if (cantEntrada.lte(0)) return;

  const precioEntrada = params.precioEntrada != null
    ? new Prisma.Decimal(params.precioEntrada)
    : null;
  if (precioEntrada == null || precioEntrada.lte(0)) return;

  const stockPrevio = new Prisma.Decimal(params.stockPrevio);
  const costoPrevio = params.costoPrevio != null
    ? new Prisma.Decimal(params.costoPrevio)
    : null;

  let costoNuevo: Prisma.Decimal;
  if (stockPrevio.lte(0) || costoPrevio == null || costoPrevio.lte(0)) {
    // No hay stock previo (o no había costo) → el costo es el precio de entrada.
    costoNuevo = precioEntrada;
  } else {
    const valorPrevio = stockPrevio.mul(costoPrevio);
    const valorEntrada = cantEntrada.mul(precioEntrada);
    const stockNuevo = stockPrevio.plus(cantEntrada);
    costoNuevo = valorPrevio.plus(valorEntrada).div(stockNuevo);
  }

  await tx.material.update({
    where: { material_id: materialId },
    data: {
      costo_promedio: costoNuevo,
      costo_promedio_moneda: params.monedaEntrada ?? "USD",
    },
  });
}

// Stock LIBRE vs stock FÍSICO de un material.
//
// Problema que resuelve (2026-08): `Material.stock_actual` es el stock
// contable/físico del almacén, pero NO todo lo que está ahí está libre.
// El circuito es:
//
//   1. Se emite una OC por un requerimiento de la OT X.
//   2. `/movimientos/ingreso-po` recepciona la OC → INCREMENTA
//      `Material.stock_actual` y deja el req en COMPLETO / INCOMPLETO.
//      El material ya está físicamente en el almacén, pero es de la OT X.
//   3. `/despachos` entrega al técnico → recién ahí DECREMENTA
//      `Material.stock_actual` y el req pasa a ENTREGADO.
//
// Entre (2) y (3) esas unidades suman a `stock_actual` aunque están
// comprometidas con la OT X. El tab "Almacén" de /requerimientos las estaba
// ofreciendo como stock disponible para OTRAS OTs (mal cruce): el usuario
// veía "hay stock, consumí de almacén" y en realidad ese repuesto ya tenía
// dueño.
//
//   stock_libre = stock_actual − reservado_a_OTs
//
// NO se cuentan como reservados los estados que YA descontaron stock:
//   - ENTREGADO            → despacho ya decrementó `stock_actual`.
//   - CONSUMIDO_ALMACEN    → consumir-de-almacen ya decrementó `stock_actual`.
//   - CONSUMIDO_OC_ABIERTA → sale del stock fijo de la OC abierta, no del catálogo.
//   - ANULADO / DEVOLUCION → no aplica.

import type { PrismaClient, Prisma } from "@prisma/client";
import { formatOtCodigo, formatOtInternaCodigo } from "@/lib/ot-formato";

type TxClient = PrismaClient | Prisma.TransactionClient;

// Estados del OTRepuesto en los que el material ya ingresó al almacén vía
// recepción de OC pero todavía no salió hacia el técnico.
export const ESTADOS_STOCK_RESERVADO = ["COMPLETO", "INCOMPLETO"] as const;

export interface ReservaMaterial {
  /** Unidades físicamente en almacén pero comprometidas con alguna OT. */
  cantidad: number;
  /** Códigos de OT (V000126 / OI000012 / ...) dueñas de esas unidades. */
  ots: string[];
}

/**
 * Suma, por material, las unidades que están en el almacén pero ya asignadas
 * a una OT (recibidas de una OC y pendientes de despacho al técnico).
 *
 * @param materialIds  Si se pasa, limita el cálculo a esos materiales.
 *                     Sin él calcula el mapa completo (la tabla es chica y
 *                     el filtro por estado la deja en pocos cientos de filas).
 */
export async function calcularStockReservado(
  db: TxClient,
  materialIds?: number[],
): Promise<Map<number, ReservaMaterial>> {
  const mapa = new Map<number, ReservaMaterial>();
  if (materialIds && materialIds.length === 0) return mapa;

  const filas = await db.oTRepuesto.findMany({
    where: {
      material_id: materialIds ? { in: materialIds } : { not: null },
      // Sin OC no hubo ingreso a stock por este req → no reserva nada.
      po_id: { not: null },
      status_oc_codigo: { in: [...ESTADOS_STOCK_RESERVADO] },
      status_requerimiento_codigo: "APROBADO",
      // Items "libres" del editor de OC no representan material de una OT.
      OR: [{ solo_para_oc: false }, { solo_para_oc: null }],
    },
    select: {
      material_id: true,
      cantidad: true,
      cantidad_recibida: true,
      orden_trabajo: { select: { ot: true, tipo_codigo: true } },
      orden_trabajo_interna: { select: { ot: true } },
    },
  });

  for (const f of filas) {
    if (f.material_id == null) continue;
    // Lo que efectivamente llegó al almacén para este req, acotado a lo
    // pedido (en recepción completa `cantidad_recibida` = `cantidad`).
    const recibida = Math.min(Number(f.cantidad_recibida ?? 0), Number(f.cantidad));
    if (!Number.isFinite(recibida) || recibida <= 0) continue;

    const prev = mapa.get(f.material_id) ?? { cantidad: 0, ots: [] };
    prev.cantidad += recibida;
    const codigo = f.orden_trabajo
      ? formatOtCodigo(f.orden_trabajo.ot, f.orden_trabajo.tipo_codigo, "")
      : f.orden_trabajo_interna
        ? formatOtInternaCodigo(f.orden_trabajo_interna.ot, "")
        : "";
    if (codigo && !prev.ots.includes(codigo)) prev.ots.push(codigo);
    mapa.set(f.material_id, prev);
  }

  for (const r of mapa.values()) r.ots.sort();
  return mapa;
}

/** stock_actual − reservado, nunca negativo. */
export function stockLibre(stockActual: number | null | undefined, reservado: number): number {
  return Math.max(0, Number(stockActual ?? 0) - reservado);
}

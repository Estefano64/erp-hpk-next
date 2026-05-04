import { Prisma } from "@prisma/client";

// Recalcula subtotal/impuesto/total de una Compra a partir de sus detalles,
// usando Prisma.Decimal para no perder precisión.
export async function recalcCompraTotals(
  tx: Prisma.TransactionClient,
  compraId: number,
): Promise<void> {
  const detalles = await tx.compraDetalle.findMany({
    where: { compra_id: compraId },
    select: { subtotal: true, impuesto: true, descuento: true },
  });

  const subtotal = detalles.reduce(
    (acc, d) => acc.plus(d.subtotal).minus(d.descuento ?? 0),
    new Prisma.Decimal(0),
  );
  const impuesto = detalles.reduce(
    (acc, d) => acc.plus(d.impuesto ?? 0),
    new Prisma.Decimal(0),
  );

  await tx.compra.update({
    where: { id: compraId },
    data: { subtotal, impuesto, total: subtotal.plus(impuesto) },
  });
}

// Calcula subtotal/total de una línea con cantidad, precio, descuento e impuesto.
export function calcularLinea(args: {
  cantidad: number | string | Prisma.Decimal;
  precio_unitario: number | string | Prisma.Decimal;
  descuento?: number | string | Prisma.Decimal | null;
  impuesto?: number | string | Prisma.Decimal | null;
}): { subtotal: Prisma.Decimal; descuento: Prisma.Decimal; impuesto: Prisma.Decimal; total: Prisma.Decimal } {
  const cantidad = new Prisma.Decimal(args.cantidad);
  const precio = new Prisma.Decimal(args.precio_unitario);
  const descuento = new Prisma.Decimal(args.descuento ?? 0);
  const impuesto = new Prisma.Decimal(args.impuesto ?? 0);
  const subtotal = cantidad.mul(precio);
  const total = subtotal.minus(descuento).plus(impuesto);
  return { subtotal, descuento, impuesto, total };
}

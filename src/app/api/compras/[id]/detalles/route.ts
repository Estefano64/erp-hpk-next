import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateDetalleSchema = z.object({
  material_id: z.number().int().positive(),
  cantidad: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().min(0).default(0),
  descuento: z.coerce.number().min(0).optional().nullable(),
  impuesto: z.coerce.number().min(0).optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

// Recalcula subtotal/impuesto/total de la compra a partir de sus detalles.
async function recalcCompraTotals(tx: import("@prisma/client").Prisma.TransactionClient, compraId: number) {
  const detalles = await tx.compraDetalle.findMany({
    where: { compra_id: compraId },
    select: { subtotal: true, impuesto: true, descuento: true },
  });
  const subtotal = detalles.reduce((a, d) => a + Number(d.subtotal) - Number(d.descuento ?? 0), 0);
  const impuesto = detalles.reduce((a, d) => a + Number(d.impuesto ?? 0), 0);
  const total = subtotal + impuesto;
  await tx.compra.update({ where: { id: compraId }, data: { subtotal, impuesto, total } });
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    const body = await req.json();
    const parsed = CreateDetalleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const sub = d.cantidad * d.precio_unitario;
    const desc = Number(d.descuento ?? 0);
    const imp = Number(d.impuesto ?? 0);
    const total = sub - desc + imp;

    const created = await prisma.$transaction(async (tx) => {
      const exists = await tx.compra.findUnique({ where: { id: compraId }, select: { status_oc_codigo: true } });
      if (!exists) throw Object.assign(new Error("Compra no encontrada"), { code: "NOT_FOUND" });
      if (exists.status_oc_codigo === "ANULADO") {
        throw Object.assign(new Error("No se pueden agregar líneas a una compra anulada"), { code: "ANULADO" });
      }
      const det = await tx.compraDetalle.create({
        data: {
          compra_id: compraId,
          material_id: d.material_id,
          cantidad: d.cantidad,
          precio_unitario: d.precio_unitario,
          subtotal: sub,
          descuento: desc,
          impuesto: imp,
          total,
          status_oc_codigo: d.status_oc_codigo ?? null,
          observaciones: d.observaciones ?? null,
        },
        include: { material: { select: { material_id: true, codigo: true, descripcion: true, np: true } } },
      });
      await recalcCompraTotals(tx, compraId);
      return det;
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "ANULADO") return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("POST /api/compras/[id]/detalles error:", error);
    return NextResponse.json({ error: "Error al crear línea" }, { status: 500 });
  }
}

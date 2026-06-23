import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calcularLinea, recalcCompraTotals } from "@/lib/compra-utils";

import { parseInt4Safe } from "@/lib/ot-formato";
const CreateDetalleSchema = z.object({
  material_id: z.number().int().positive(),
  cantidad: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().min(0).default(0),
  descuento: z.coerce.number().min(0).optional().nullable(),
  impuesto: z.coerce.number().min(0).optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = parseInt4Safe(id) ?? 0;
    const body = await req.json();
    const parsed = CreateDetalleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const { subtotal, descuento, impuesto, total } = calcularLinea(d);

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
          subtotal,
          descuento,
          impuesto,
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

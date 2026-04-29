import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const UpdateDetalleSchema = z.object({
  material_id: z.number().int().positive().optional(),
  cantidad: z.coerce.number().positive().optional(),
  precio_unitario: z.coerce.number().min(0).optional(),
  descuento: z.coerce.number().min(0).optional().nullable(),
  impuesto: z.coerce.number().min(0).optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

async function recalcCompraTotals(tx: import("@prisma/client").Prisma.TransactionClient, compraId: number) {
  const detalles = await tx.compraDetalle.findMany({
    where: { compra_id: compraId },
    select: { subtotal: true, impuesto: true, descuento: true },
  });
  const subtotal = detalles.reduce((a, d) => a + Number(d.subtotal) - Number(d.descuento ?? 0), 0);
  const impuesto = detalles.reduce((a, d) => a + Number(d.impuesto ?? 0), 0);
  await tx.compra.update({
    where: { id: compraId },
    data: { subtotal, impuesto, total: subtotal + impuesto },
  });
}

type Ctx = { params: Promise<{ id: string; detId: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id, detId } = await ctx.params;
    const compraId = Number(id);
    const detalleId = Number(detId);
    const body = await req.json();
    const parsed = UpdateDetalleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.compraDetalle.findUnique({
        where: { id: detalleId },
        select: { id: true, compra_id: true, cantidad: true, precio_unitario: true, descuento: true, impuesto: true, cantidad_recibida: true },
      });
      if (!current || current.compra_id !== compraId) {
        throw Object.assign(new Error("Línea no pertenece a esa compra"), { code: "NOT_FOUND" });
      }

      // Si ya hubo recepción, bloquear cambio de cantidad o material
      const cantidadRecibida = Number(current.cantidad_recibida ?? 0);
      if (cantidadRecibida > 0) {
        if (parsed.data.material_id !== undefined || parsed.data.cantidad !== undefined) {
          throw Object.assign(
            new Error(`Línea tiene ${cantidadRecibida} ya recibido. No se puede cambiar material ni cantidad.`),
            { code: "RECEIVED" },
          );
        }
      }

      const cantidad = parsed.data.cantidad ?? Number(current.cantidad);
      const precio = parsed.data.precio_unitario ?? Number(current.precio_unitario);
      const desc = parsed.data.descuento !== undefined ? Number(parsed.data.descuento ?? 0) : Number(current.descuento ?? 0);
      const imp = parsed.data.impuesto !== undefined ? Number(parsed.data.impuesto ?? 0) : Number(current.impuesto ?? 0);
      const sub = cantidad * precio;
      const total = sub - desc + imp;

      const data: Record<string, unknown> = {
        subtotal: sub,
        total,
        descuento: desc,
        impuesto: imp,
      };
      if (parsed.data.material_id !== undefined) data.material_id = parsed.data.material_id;
      if (parsed.data.cantidad !== undefined) data.cantidad = cantidad;
      if (parsed.data.precio_unitario !== undefined) data.precio_unitario = precio;
      if (parsed.data.status_oc_codigo !== undefined) data.status_oc_codigo = parsed.data.status_oc_codigo;
      if (parsed.data.observaciones !== undefined) data.observaciones = parsed.data.observaciones;

      const det = await tx.compraDetalle.update({
        where: { id: detalleId },
        data,
        include: { material: { select: { material_id: true, codigo: true, descripcion: true, np: true } } },
      });
      await recalcCompraTotals(tx, compraId);
      return det;
    });

    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "RECEIVED") return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("PUT detalle error:", error);
    return NextResponse.json({ error: "Error al actualizar línea" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id, detId } = await ctx.params;
    const compraId = Number(id);
    const detalleId = Number(detId);

    await prisma.$transaction(async (tx) => {
      const current = await tx.compraDetalle.findUnique({
        where: { id: detalleId },
        select: { id: true, compra_id: true, cantidad_recibida: true },
      });
      if (!current || current.compra_id !== compraId) {
        throw Object.assign(new Error("Línea no pertenece a esa compra"), { code: "NOT_FOUND" });
      }
      if (Number(current.cantidad_recibida ?? 0) > 0) {
        throw Object.assign(new Error("No se puede borrar una línea con recepción registrada"), { code: "RECEIVED" });
      }
      await tx.compraDetalle.delete({ where: { id: detalleId } });
      await recalcCompraTotals(tx, compraId);
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "RECEIVED") return NextResponse.json({ error: err.message }, { status: 409 });
    console.error("DELETE detalle error:", error);
    return NextResponse.json({ error: "Error al borrar línea" }, { status: 500 });
  }
}

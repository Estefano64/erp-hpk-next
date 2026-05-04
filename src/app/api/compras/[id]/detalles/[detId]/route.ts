import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calcularLinea, recalcCompraTotals } from "@/lib/compra-utils";

const UpdateDetalleSchema = z.object({
  material_id: z.number().int().positive().optional(),
  cantidad: z.coerce.number().positive().optional(),
  precio_unitario: z.coerce.number().min(0).optional(),
  descuento: z.coerce.number().min(0).optional().nullable(),
  impuesto: z.coerce.number().min(0).optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

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
      const descRaw = parsed.data.descuento !== undefined ? parsed.data.descuento ?? 0 : current.descuento ?? 0;
      const impRaw = parsed.data.impuesto !== undefined ? parsed.data.impuesto ?? 0 : current.impuesto ?? 0;

      const { subtotal, descuento, impuesto, total } = calcularLinea({
        cantidad,
        precio_unitario: precio,
        descuento: descRaw,
        impuesto: impRaw,
      });

      const data: Record<string, unknown> = {
        subtotal,
        total,
        descuento,
        impuesto,
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

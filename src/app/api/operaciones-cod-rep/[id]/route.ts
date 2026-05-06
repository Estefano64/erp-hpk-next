import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  horas: z.coerce.number().min(0).optional().nullable(),
  hh: z.coerce.number().min(0).optional().nullable(),
  qty: z.coerce.number().int().min(1).optional(),
  trabajo: z.string().trim().min(1).max(200).optional(),
  componente_codigo: z.string().trim().optional(),
  operacion_reparacion_codigo: z.string().trim().optional().nullable(),
  orden: z.coerce.number().int().min(0).optional(),
  activo: z.boolean().optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const updated = await prisma.operacionCodRep.update({
      where: { operacion_cod_rep_id: Number(id) },
      data: parsed.data,
      include: { componente: { select: { codigo: true, nombre: true } } },
    });
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("PUT /api/operaciones-cod-rep/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE — borra una operación de la plantilla. Falla si tiene planificaciones referenciándola.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.operacionCodRep.delete({
      where: { operacion_cod_rep_id: Number(id) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003" || error.code === "P2014") {
        return NextResponse.json({
          error: "No se puede eliminar: hay planificaciones referenciando esta operación.",
        }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      }
    }
    console.error("DELETE /api/operaciones-cod-rep/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

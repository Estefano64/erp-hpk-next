import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.contrato.findUnique({
    where: { id: (parseInt4Safe(id) ?? 0) },
    include: { cliente: true, codigo_reparacion: true },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await prisma.contrato.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data: {
        codigo: body.codigo,
        cliente_id: body.cliente_id,
        cod_rep_id: body.cod_rep_id || null,
        fecha_inicio: parseDateOnly(body.fecha_inicio)!,
        fecha_termino: parseDateOnly(body.fecha_termino)!,
        dias_reparacion: body.dias_reparacion,
        precio: body.precio,
      },
      include: { cliente: true, codigo_reparacion: true },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.contrato.update({
      where: { id: (parseInt4Safe(id) ?? 0) },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

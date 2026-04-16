import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.cliente.findUnique({
    where: { cliente_id: Number(id) },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await prisma.cliente.update({
      where: { cliente_id: Number(id) },
      data: {
        codigo: body.codigo,
        razon_social: body.razon_social,
        nombre_comercial: body.nombre_comercial || null,
        ruc: body.ruc || null,
        direccion: body.direccion || null,
        telefono: body.telefono || null,
        email: body.email || null,
        contacto_principal: body.contacto_principal || null,
      },
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
    await prisma.cliente.update({
      where: { cliente_id: Number(id) },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

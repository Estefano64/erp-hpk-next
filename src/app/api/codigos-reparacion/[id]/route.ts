import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// GET — detalle
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.codigoReparacion.findUnique({
    where: { cod_rep_id: Number(id) },
    include: { tipo: true, categoria: true, flota: true, fabricante: true, posicion: true, moneda: true },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

// PUT — actualizar
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await prisma.codigoReparacion.update({
      where: { cod_rep_id: Number(id) },
      data: {
        descripcion: body.descripcion,
        tipo_codigo: body.tipo_codigo,
        categoria_codigo: body.categoria_codigo,
        flota_codigo: body.flota_codigo,
        fabricante_codigo: body.fabricante_codigo || null,
        np: body.np || null,
        posicion_codigo: body.posicion_codigo || null,
        precio: body.precio ?? null,
        moneda_codigo: body.moneda_codigo || null,
      },
      include: { tipo: true, categoria: true, flota: true, fabricante: true, posicion: true, moneda: true },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE — soft delete
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await prisma.codigoReparacion.update({
      where: { cod_rep_id: Number(id) },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

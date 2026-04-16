import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// GET — detalle
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.material.findUnique({
    where: { material_id: Number(id) },
    include: {
      planta: true,
      area: true,
      categoria: true,
      clasificacion: true,
      unidad_medida: true,
      moneda: true,
      fabricante: true,
    },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

// PUT — actualizar
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const updated = await prisma.material.update({
      where: { material_id: Number(id) },
      data: {
        descripcion: body.descripcion,
        planta_codigo: body.planta_codigo,
        area_codigo: body.area_codigo,
        categoria_codigo: body.categoria_codigo,
        clasificacion_codigo: body.clasificacion_codigo,
        unidad_medida_codigo: body.unidad_medida_codigo,
        plazo_entrega: body.plazo_entrega ?? null,
        precio: body.precio ?? null,
        moneda_codigo: body.moneda_codigo || null,
        fabricante_codigo: body.fabricante_codigo || null,
        np: body.np || null,
        modelo: body.modelo || null,
        caja: body.caja || null,
        ubicacion: body.ubicacion || null,
        punto_reposicion: body.punto_reposicion ?? null,
        stock_maximo: body.stock_maximo ?? null,
      },
      include: {
        planta: true,
        area: true,
        categoria: true,
        clasificacion: true,
        unidad_medida: true,
        moneda: true,
        fabricante: true,
      },
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
    await prisma.material.update({
      where: { material_id: Number(id) },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

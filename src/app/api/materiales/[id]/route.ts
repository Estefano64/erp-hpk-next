import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";

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

// PATCH — actualizar solo los campos enviados (inline edit). No toca el resto.
const PATCHABLE_FIELDS = new Set([
  "descripcion", "plazo_entrega", "precio", "moneda_codigo",
  "fabricante_codigo", "np", "modelo", "caja", "ubicacion",
  "punto_reposicion", "stock_maximo",
]);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!PATCHABLE_FIELDS.has(k)) continue;
      // string vacío → null (consistente con la convención del PUT)
      if (typeof v === "string" && v.trim() === "") data[k] = null;
      else data[k] = v;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
    }
    const updated = await prisma.material.update({
      where: { material_id: Number(id) },
      data,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/materiales/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const materialId = Number(id);
    const force = new URL(req.url).searchParams.get("force") === "true";

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json(
          { error: "Solo administradores pueden eliminar permanentemente" },
          { status: 403 }
        );
      }

      const [otRepuestos, compraDetalles, tareas] = await Promise.all([
        prisma.oTRepuesto.count({ where: { material_id: materialId } }),
        prisma.compraDetalle.count({ where: { material_id: materialId } }),
        prisma.tarea.count({ where: { material: { material_id: materialId } } }),
      ]);

      if (otRepuestos > 0 || compraDetalles > 0 || tareas > 0) {
        const partes: string[] = [];
        if (otRepuestos > 0) partes.push(`${otRepuestos} repuesto(s) en OTs`);
        if (compraDetalles > 0) partes.push(`${compraDetalles} línea(s) de compra`);
        if (tareas > 0) partes.push(`${tareas} tarea(s)`);
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `Tiene ${partes.join(", ")} en el historial. Use "Desactivar" o cierre esas referencias.`,
            otRepuestos,
            compraDetalles,
            tareas,
          },
          { status: 409 }
        );
      }

      await prisma.material.delete({ where: { material_id: materialId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    await prisma.material.update({
      where: { material_id: materialId },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

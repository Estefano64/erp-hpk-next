import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";
import { ensureFlotaCodigo } from "@/lib/flota";

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
    const flotaCodigo = await ensureFlotaCodigo(body.flota_codigo);
    if (!flotaCodigo) {
      return NextResponse.json({ error: "La flota es requerida" }, { status: 400 });
    }
    const updated = await prisma.codigoReparacion.update({
      where: { cod_rep_id: Number(id) },
      data: {
        descripcion: body.descripcion,
        tipo_codigo: body.tipo_codigo,
        categoria_codigo: body.categoria_codigo,
        flota_codigo: flotaCodigo,
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

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const codRepId = Number(id);
    const force = new URL(req.url).searchParams.get("force") === "true";

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json(
          { error: "Solo administradores pueden eliminar permanentemente" },
          { status: 403 }
        );
      }

      const [contratos, ots, tareas] = await Promise.all([
        prisma.contrato.count({ where: { cod_rep_id: codRepId } }),
        prisma.ordenTrabajo.count({ where: { id_cod_rep: codRepId } }),
        prisma.tarea.count({ where: { codigo_reparacion: { cod_rep_id: codRepId } } }),
      ]);

      if (contratos > 0 || ots > 0 || tareas > 0) {
        const partes: string[] = [];
        if (contratos > 0) partes.push(`${contratos} contrato(s)`);
        if (ots > 0) partes.push(`${ots} OT(s)`);
        if (tareas > 0) partes.push(`${tareas} tarea(s)`);
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `Tiene ${partes.join(", ")} en el historial. Use "Desactivar" o cierre esas referencias.`,
            contratos,
            ots,
            tareas,
          },
          { status: 409 }
        );
      }

      await prisma.codigoReparacion.delete({ where: { cod_rep_id: codRepId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    await prisma.codigoReparacion.update({
      where: { cod_rep_id: codRepId },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

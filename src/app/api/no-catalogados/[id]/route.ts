import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

// DELETE — Dar de baja (soft delete) un material no catalogado.
//   ?force=true  → eliminación física (solo si no tiene movimientos).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const matId = parseInt4Safe(id) ?? 0;
    const force = new URL(req.url).searchParams.get("force") === "true";

    const mat = await prisma.materialNoCatalogado.findUnique({
      where: { id: matId },
      include: { _count: { select: { movimientos: true } } },
    });
    if (!mat) return NextResponse.json({ error: "Material no encontrado" }, { status: 404 });

    if (force) {
      if (mat._count.movimientos > 0) {
        return NextResponse.json(
          { error: "Tiene movimientos registrados; usá baja lógica en su lugar." },
          { status: 400 },
        );
      }
      await prisma.materialNoCatalogado.delete({ where: { id: matId } });
      return NextResponse.json({ message: "Material eliminado" });
    }

    await prisma.materialNoCatalogado.update({
      where: { id: matId },
      data: { activo: false },
    });
    return NextResponse.json({ message: "Material dado de baja" });
  } catch (error) {
    console.error("DELETE /api/no-catalogados/[id] error:", error);
    return NextResponse.json({ error: "Error al dar de baja" }, { status: 500 });
  }
}

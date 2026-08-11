import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";
import { deleteObject } from "@/lib/r2-helpers";

// DELETE — elimina una foto de la salida no conforme (BD + objeto R2).
// Solo mientras el registro no esté cerrado.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; fotoId: string }> },
) {
  try {
    const { id, fotoId } = await ctx.params;
    const idNum = parseInt4Safe(id);
    const fotoIdNum = parseInt4Safe(fotoId);
    if (idNum == null || fotoIdNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const foto = await prisma.salidaNoConformeFoto.findFirst({
      where: { id: fotoIdNum, salida_no_conforme_id: idNum },
      include: { salida: { select: { estado: true, activo: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    if (!foto.salida.activo || foto.salida.estado === "CERRADO") {
      return NextResponse.json({ error: "El registro no admite cambios" }, { status: 409 });
    }

    await prisma.salidaNoConformeFoto.delete({ where: { id: fotoIdNum } });
    try {
      await deleteObject(foto.r2_key);
    } catch (err) {
      console.error("No se pudo borrar objeto R2 (foto SNC):", err);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

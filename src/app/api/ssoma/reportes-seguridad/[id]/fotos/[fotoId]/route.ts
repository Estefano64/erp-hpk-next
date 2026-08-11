import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";
import { deleteObject } from "@/lib/r2-helpers";

// DELETE — elimina una foto del reporte (BD + objeto R2).
// Solo mientras el reporte no esté cerrado.
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

    const foto = await prisma.reporteSeguridadFoto.findFirst({
      where: { id: fotoIdNum, reporte_seguridad_id: idNum },
      include: { reporte: { select: { estado: true, activo: true } } },
    });
    if (!foto) return NextResponse.json({ error: "Foto no encontrada" }, { status: 404 });
    if (!foto.reporte.activo || foto.reporte.estado === "CERRADO") {
      return NextResponse.json({ error: "El reporte no admite cambios" }, { status: 409 });
    }

    await prisma.reporteSeguridadFoto.delete({ where: { id: fotoIdNum } });
    // Borrado del objeto después de la fila: si R2 falla queda un huérfano
    // inofensivo en el bucket (mismo trade-off que el resto de módulos).
    try {
      await deleteObject(foto.r2_key);
    } catch (err) {
      console.error("No se pudo borrar objeto R2 (foto RS):", err);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

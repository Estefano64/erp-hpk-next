// DELETE /api/compras/[id]/adjuntos/[adjId]
// Borra un adjunto (R2 + BD). Acepta 404 de R2 (objeto ya borrado) y limpia
// el registro de BD igual — evita dejar metadata huérfana.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2-helpers";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string; adjId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id, adjId } = await params;
    const compraId = parseInt4Safe(id) ?? 0;
    const adjuntoId = Number(adjId);
    if (compraId == null || !Number.isFinite(adjuntoId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const adj = await prisma.compraAdjunto.findUnique({ where: { id: adjuntoId } });
    if (!adj || adj.compra_id !== compraId) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    try {
      await deleteObject(adj.r2_key);
    } catch (error: unknown) {
      const httpStatus = (error as { $metadata?: { httpStatusCode?: number } } | undefined)
        ?.$metadata?.httpStatusCode;
      if (httpStatus !== 404) {
        console.error("DELETE compra adjunto: fallo R2", error);
        return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
      }
      console.warn(`DELETE compra adjunto: R2 404 para key ${adj.r2_key} — continúo`);
    }

    await prisma.compraAdjunto.delete({ where: { id: adjuntoId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/compras/[id]/adjuntos/[adjId] error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

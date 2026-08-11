import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma } from "@/lib/ssoma-server";

// POST — el encargado de seguridad revisa y aprueba el reporte.
// ABIERTO → APROBADO. Comentario opcional.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id);
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    if (!(await esEncargadoSsoma(req))) {
      return NextResponse.json({ error: "Solo el encargado de seguridad puede aprobar" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.reporteSeguridad.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!actual.activo) return NextResponse.json({ error: "Reporte anulado" }, { status: 409 });
    if (actual.estado !== "ABIERTO") {
      return NextResponse.json({ error: `No se puede aprobar en estado ${actual.estado}` }, { status: 409 });
    }

    const updated = await prisma.reporteSeguridad.update({
      where: { id: idNum },
      data: {
        estado: "APROBADO",
        aprobado_por: usuario,
        fecha_aprobacion: new Date(),
        comentario_aprobacion: body.comentario?.trim() || null,
        usuario_actualiza: usuario,
      },
      include: {
        acciones: { orderBy: { orden: "asc" } },
        fotos: { orderBy: { id: "asc" } },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

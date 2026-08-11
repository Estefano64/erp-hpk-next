import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma } from "@/lib/ssoma-server";

// POST — cierra la SAC (ABIERTA → CERRADA). Solo encargado SSOMA.
// Body opcional: { verificacion_eficacia?, verificado_por?, fecha_verificacion? }
// para sellar la verificación de la eficacia en el mismo acto de cierre.
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
      return NextResponse.json({ error: "Solo el encargado de seguridad puede cerrar" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.solicitudAccionCorrectiva.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!actual.activo) return NextResponse.json({ error: "SAC anulada" }, { status: 409 });
    if (actual.estado !== "ABIERTA") {
      return NextResponse.json({ error: "La SAC ya está cerrada" }, { status: 409 });
    }

    const updated = await prisma.solicitudAccionCorrectiva.update({
      where: { id: idNum },
      data: {
        estado: "CERRADA",
        cerrado_por: usuario,
        fecha_cierre: new Date(),
        ...(body.verificacion_eficacia !== undefined
          ? { verificacion_eficacia: body.verificacion_eficacia?.trim() || null }
          : {}),
        ...(body.verificado_por !== undefined
          ? { verificado_por: body.verificado_por?.trim() || usuario }
          : {}),
        ...(body.fecha_verificacion !== undefined
          ? { fecha_verificacion: body.fecha_verificacion ? new Date(body.fecha_verificacion) : new Date() }
          : {}),
        usuario_actualiza: usuario,
      },
      include: {
        acciones: { orderBy: { orden: "asc" } },
        salida_no_conforme: { select: { id: true, numero: true, anio: true } },
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

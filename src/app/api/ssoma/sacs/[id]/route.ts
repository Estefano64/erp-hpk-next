import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma, sacDataDesdeBody, sacAccionesDesdeBody } from "@/lib/ssoma-server";

// GET — detalle de la SAC.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id);
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const sac = await prisma.solicitudAccionCorrectiva.findUnique({
      where: { id: idNum },
      include: {
        acciones: { orderBy: { orden: "asc" } },
        salida_no_conforme: { select: { id: true, numero: true, anio: true, descripcion: true } },
      },
    });
    if (!sac) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: sac });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// PATCH — edita la SAC mientras esté ABIERTA. Solo encargado SSOMA.
// `acciones` (si viene) reemplaza el plan completo.
export async function PATCH(
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
      return NextResponse.json(
        { error: "Solo el encargado de seguridad puede editar SACs" },
        { status: 403 },
      );
    }
    const body = await req.json();
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.solicitudAccionCorrectiva.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!actual.activo) return NextResponse.json({ error: "SAC anulada" }, { status: 409 });
    if (actual.estado === "CERRADA") {
      return NextResponse.json({ error: "La SAC ya está cerrada" }, { status: 409 });
    }

    const parsed = sacDataDesdeBody(body);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.data.descripcion === null) {
      return NextResponse.json({ error: "La descripción no puede ser vacía" }, { status: 400 });
    }
    const acciones = sacAccionesDesdeBody(body);

    const updated = await prisma.$transaction(async (tx) => {
      if (acciones !== null) {
        await tx.sacAccion.deleteMany({ where: { sac_id: idNum } });
        if (acciones.length > 0) {
          await tx.sacAccion.createMany({
            data: acciones.map((a) => ({ ...a, sac_id: idNum })),
          });
        }
      }
      return tx.solicitudAccionCorrectiva.update({
        where: { id: idNum },
        data: { ...parsed.data, usuario_actualiza: usuario },
        include: {
          acciones: { orderBy: { orden: "asc" } },
          salida_no_conforme: { select: { id: true, numero: true, anio: true } },
        },
      });
    });

    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// DELETE — anular (soft-delete). Solo encargado SSOMA o admin.
export async function DELETE(
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
      return NextResponse.json({ error: "Solo el encargado de seguridad puede anular" }, { status: 403 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    await prisma.solicitudAccionCorrectiva.update({
      where: { id: idNum },
      data: { activo: false, usuario_actualiza: usuario },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

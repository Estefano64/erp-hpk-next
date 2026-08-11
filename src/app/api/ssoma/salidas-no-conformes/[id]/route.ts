import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma } from "@/lib/ssoma-server";

// GET — detalle de la salida no conforme.
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
    const snc = await prisma.salidaNoConforme.findUnique({
      where: { id: idNum },
      include: {
        fotos: { orderBy: { id: "asc" } },
        sacs: {
          select: { id: true, numero: true, anio: true, estado: true, activo: true, descripcion: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!snc) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: snc });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// PATCH — edita la salida no conforme mientras esté ABIERTA.
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
    const body = await req.json();
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.salidaNoConforme.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!actual.activo) {
      return NextResponse.json({ error: "Registro anulado" }, { status: 409 });
    }
    if (actual.estado === "CERRADO") {
      return NextResponse.json({ error: "La salida no conforme ya está cerrada" }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { usuario_actualiza: usuario };

    if (body.fecha !== undefined) data.fecha = body.fecha ? new Date(body.fecha) : new Date();
    if (body.area !== undefined) data.area = body.area?.trim() || null;
    if (body.descripcion !== undefined) {
      const t = String(body.descripcion).trim();
      if (!t) return NextResponse.json({ error: "La descripción no puede ser vacía" }, { status: 400 });
      data.descripcion = t;
    }
    if (body.reportado_por !== undefined) data.reportado_por = body.reportado_por?.trim() || null;
    if (body.area_reportante !== undefined) data.area_reportante = body.area_reportante?.trim() || null;
    if (body.accion_tomada !== undefined) data.accion_tomada = body.accion_tomada?.trim() || null;
    if (body.generado_por !== undefined) data.generado_por = body.generado_por?.trim() || null;
    if (body.responsable_salida !== undefined) data.responsable_salida = body.responsable_salida?.trim() || null;
    if (body.requiere_sac !== undefined) data.requiere_sac = body.requiere_sac === true;
    if (body.observaciones !== undefined) data.observaciones = body.observaciones?.trim() || null;

    const updated = await prisma.salidaNoConforme.update({
      where: { id: idNum },
      data,
      include: {
        fotos: { orderBy: { id: "asc" } },
        sacs: { select: { id: true, numero: true, anio: true, estado: true, activo: true } },
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
    await prisma.salidaNoConforme.update({
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

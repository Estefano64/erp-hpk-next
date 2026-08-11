import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma } from "@/lib/ssoma-server";

// GET — detalle del reporte de seguridad.
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
    const rep = await prisma.reporteSeguridad.findUnique({
      where: { id: idNum },
      include: {
        acciones: { orderBy: { orden: "asc" } },
        fotos: { orderBy: { id: "asc" } },
      },
    });
    if (!rep) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: rep });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// PATCH — edita el reporte mientras NO esté cerrado.
//   - Parte A (lugar/fecha/hora/tipo/reportador/daños/descripción): editable
//     en ABIERTO.
//   - Parte B (plan de acción `acciones` + supervisor_ssoma): editable en
//     ABIERTO y APROBADO (el encargado va llenando el seguimiento).
// `acciones` reemplaza el plan completo (deleteMany + create).
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

    const actual = await prisma.reporteSeguridad.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!actual.activo) {
      return NextResponse.json({ error: "Reporte anulado" }, { status: 409 });
    }
    if (actual.estado === "CERRADO") {
      return NextResponse.json({ error: "El reporte ya está cerrado" }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { usuario_actualiza: usuario };

    if (body.lugar !== undefined) data.lugar = body.lugar?.trim() || null;
    if (body.fecha !== undefined) data.fecha = body.fecha ? new Date(body.fecha) : new Date();
    if (body.hora !== undefined) data.hora = body.hora?.trim() || null;
    if (body.tipo !== undefined) {
      if (body.tipo && !["ACTO_INSEGURO", "CONDICION_INSEGURA"].includes(body.tipo)) {
        return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
      }
      data.tipo = body.tipo || null;
    }
    if (body.reportado_por !== undefined) data.reportado_por = body.reportado_por?.trim() || null;
    if (body.cargo !== undefined) data.cargo = body.cargo?.trim() || null;
    if (body.danos_potenciales !== undefined) {
      data.danos_potenciales = Array.isArray(body.danos_potenciales)
        ? body.danos_potenciales.filter((d: unknown) =>
            typeof d === "string" &&
            ["PERSONAL", "EQUIPOS_MATERIALES_AMBIENTALES", "VEHICULARES"].includes(d))
        : [];
    }
    if (body.descripcion !== undefined) {
      const t = String(body.descripcion).trim();
      if (!t) return NextResponse.json({ error: "La descripción no puede ser vacía" }, { status: 400 });
      data.descripcion = t;
    }
    if (body.supervisor_ssoma !== undefined) data.supervisor_ssoma = body.supervisor_ssoma?.trim() || null;

    const accionesNuevas = Array.isArray(body.acciones)
      ? body.acciones
          .map((a: Record<string, unknown>, i: number) => ({
            orden: i + 1,
            descripcion: typeof a.descripcion === "string" ? a.descripcion.trim() : "",
            responsable: typeof a.responsable === "string" ? a.responsable.trim() || null : null,
            fecha_cumplimiento: a.fecha_cumplimiento ? new Date(String(a.fecha_cumplimiento)) : null,
          }))
          .filter((a: { descripcion: string }) => a.descripcion.length > 0)
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      if (accionesNuevas !== null) {
        await tx.reporteSeguridadAccion.deleteMany({ where: { reporte_seguridad_id: idNum } });
        if (accionesNuevas.length > 0) {
          await tx.reporteSeguridadAccion.createMany({
            data: accionesNuevas.map((a: Record<string, unknown>) => ({ ...a, reporte_seguridad_id: idNum })),
          });
        }
      }
      return tx.reporteSeguridad.update({
        where: { id: idNum },
        data,
        include: {
          acciones: { orderBy: { orden: "asc" } },
          fotos: { orderBy: { id: "asc" } },
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
    await prisma.reporteSeguridad.update({
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

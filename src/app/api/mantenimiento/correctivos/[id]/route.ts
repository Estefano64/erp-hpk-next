import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

// GET — detalle del reporte correctivo con todas las relaciones.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const rep = await prisma.reporteCorrectivo.findUnique({
      where: { id: idNum },
      include: {
        equipo: {
          select: {
            codigo: true,
            descripcion: true,
            modelo: true,
            numero_serie: true,
            tipo_codigo: true,
            fabricante: { select: { nombre: true } },
            tipo: { select: { nombre: true } },
          },
        },
        area: { select: { codigo: true, nombre: true } },
        ot_interna: {
          select: {
            id: true,
            ot: true,
            descripcion: true,
            ot_status: { select: { codigo: true, nombre: true } },
            user_status: { select: { codigo: true, nombre: true } },
            recursos_status: { select: { codigo: true, nombre: true } },
          },
        },
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

// PATCH — actualiza campos del reporte. Permite:
//   - editar detalle_falla / reportado_por (etapa 1, mientras esté REPORTADO)
//   - llenar descripcion_correctivo + realizado_por + responsable_area (etapa 3)
//     y cambiar el estado a COMPLETADO automáticamente si la descripción no es vacía
//   - editar fecha
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const body = await req.json();
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.reporteCorrectivo.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (!actual.activo) {
      return NextResponse.json({ error: "Reporte anulado" }, { status: 409 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { usuario_actualiza: usuario };

    if (body.detalle_falla !== undefined) {
      const t = String(body.detalle_falla).trim();
      if (!t) return NextResponse.json({ error: "detalle_falla no puede ser vacío" }, { status: 400 });
      data.detalle_falla = t;
    }
    if (body.reportado_por !== undefined) data.reportado_por = body.reportado_por?.trim() || null;
    if (body.area_codigo !== undefined) data.area_codigo = body.area_codigo;
    if (body.fecha !== undefined) data.fecha = body.fecha ? new Date(body.fecha) : new Date();
    if (body.responsable_area !== undefined) data.responsable_area = body.responsable_area?.trim() || null;

    // Cierre del correctivo: si llega descripcion_correctivo no vacío, marcamos COMPLETADO
    // y sellamos fecha_correctivo + realizado_por.
    if (body.descripcion_correctivo !== undefined) {
      const txt = (body.descripcion_correctivo || "").trim();
      data.descripcion_correctivo = txt || null;
      if (txt) {
        data.realizado_por = (body.realizado_por?.trim() || usuario);
        data.fecha_correctivo = body.fecha_correctivo ? new Date(body.fecha_correctivo) : new Date();
        data.estado = "COMPLETADO";
      } else if (actual.estado === "COMPLETADO") {
        // si vacían la descripción tras haberlo completado, vuelve a EN_PROCESO o REPORTADO según OT
        data.estado = "EN_PROCESO";
      }
    } else {
      // solo realizado_por / fecha_correctivo sin tocar descripción
      if (body.realizado_por !== undefined) data.realizado_por = body.realizado_por?.trim() || null;
      if (body.fecha_correctivo !== undefined) {
        data.fecha_correctivo = body.fecha_correctivo ? new Date(body.fecha_correctivo) : null;
      }
    }

    const updated = await prisma.reporteCorrectivo.update({
      where: { id: idNum },
      data,
      include: {
        equipo: { select: { codigo: true, descripcion: true } },
        area: { select: { codigo: true, nombre: true } },
        ot_interna: { select: { id: true, ot: true, ot_status: { select: { nombre: true } } } },
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

// DELETE — soft-delete (anular). Marca activo=false.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    await prisma.reporteCorrectivo.update({
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

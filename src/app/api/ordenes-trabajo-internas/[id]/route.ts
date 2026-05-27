import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// GET — detalle de una OT interna con todas las relaciones.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: Number(id) },
      include: {
        planta: true,
        equipo: { select: { codigo: true, descripcion: true } },
        tipo_ot_interna: true,
        prioridad_atencion: true,
        estrategia: { select: { estrategia_id: true, codigo: true, descripcion: true } },
        user_status: true,
        ot_status: true,
        recursos_status: true,
      },
    });
    if (!ot) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ data: ot });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// PUT — update parcial con control de versión optimista.
// Cliente envía `version` actual; si no coincide, 409 (otro usuario actualizó primero).
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const otId = Number(id);

    // Optimistic concurrency: cliente envía la version que tenía leída.
    if (body.version !== undefined) {
      const current = await prisma.ordenTrabajoInterna.findUnique({
        where: { id: otId },
        select: { version: true },
      });
      if (!current) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      if (current.version !== body.version) {
        return NextResponse.json(
          { error: "Otro usuario actualizó esta OT. Refrescá y reintentá." },
          { status: 409 },
        );
      }
    }

    // Lista blanca de campos editables.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    const editable = [
      "planta_codigo", "equipo_codigo", "tipo_ot_interna_codigo", "descripcion",
      "prioridad_atencion_codigo", "semana_revision", "estrategia_id", "task_list",
      "user_status_codigo", "ot_status_codigo", "recursos_status_codigo",
      "asignado_a", "comentarios",
    ];
    for (const k of editable) {
      if (k in body) data[k] = body[k] === "" ? null : body[k];
    }
    // Fechas requieren conversión manual.
    for (const k of ["fecha_inicio_plan", "fecha_fin_plan", "fecha_inicio_real", "fecha_fin_real", "fecha_cierre"] as const) {
      if (k in body) data[k] = body[k] ? new Date(body[k]) : null;
    }

    const usuarioActualiza = await getAuditUser(req);
    if (usuarioActualiza) data.usuario_crea = data.usuario_crea ?? usuarioActualiza;

    data.version = { increment: 1 };

    const updated = await prisma.ordenTrabajoInterna.update({
      where: { id: otId },
      data,
      include: {
        equipo: { select: { codigo: true, descripcion: true } },
        tipo_ot_interna: true,
        ot_status: true,
        user_status: true,
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

// DELETE — elimina una OT interna por id.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.ordenTrabajoInterna.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin, auditOTInternaChange, AUDIT_OT_INTERNA_SELECT_FIELDS } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";

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

    // Defensa explícita: `usuario_crea` JAMÁS debe modificarse en un update.
    // Es la persona que creó la OT y la auditoría depende de eso. Aunque el
    // frontend nunca debería mandarlo, lo borramos del body antes de procesar
    // para garantizarlo a nivel del API (defense in depth).
    delete body.usuario_crea;
    delete body.fecha_creacion;

    // Lista blanca de campos editables. `usuario_crea` y `fecha_creacion`
    // QUEDAN FUERA INTENCIONALMENTE — son inmutables post-creación.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    const editable = [
      "planta_codigo", "equipo_codigo", "area_taller", "tipo_ot_interna_codigo", "descripcion",
      "prioridad_atencion_codigo", "semana_revision", "estrategia_id", "task_list",
      "user_status_codigo", "ot_status_codigo", "recursos_status_codigo",
      "asignado_a", "comentarios", "solicitud_mantenimiento",
    ];
    for (const k of editable) {
      if (k in body) data[k] = body[k] === "" ? null : body[k];
    }
    // Fechas requieren conversión manual.
    for (const k of ["fecha_inicio_plan", "fecha_fin_plan", "fecha_inicio_real", "fecha_fin_real", "fecha_cierre"] as const) {
      if (k in body) data[k] = body[k] ? new Date(body[k]) : null;
    }

    // Cada edición se traza en OTHistorial (con el usuario que editó + diff).
    // El "quién editó" se conserva en el historial, NO en la fila principal.
    const usuarioActualiza = (await getAuditUser(req)) ?? "sistema";

    data.version = { increment: 1 };

    const updated = await prisma.$transaction(async (tx) => {
      // Snapshot previo CON LOS MISMOS CAMPOS auditados. Tenemos que pedirlos
      // ANTES del update para diff. Usamos un select expandido con version+id.
      const previo = await tx.ordenTrabajoInterna.findUnique({
        where: { id: otId },
        select: { id: true, version: true, ...AUDIT_OT_INTERNA_SELECT_FIELDS },
      });
      if (!previo) throw new Error("No encontrada");

      const u = await tx.ordenTrabajoInterna.update({
        where: { id: otId },
        data,
        include: {
          equipo: { select: { codigo: true, descripcion: true } },
          tipo_ot_interna: true,
          ot_status: true,
          user_status: true,
        },
      });

      // Audit estructurado: un registro de historial por cada campo que cambió,
      // con descripción legible "Campo: antes → ahora". Mismo patrón que OT externa.
      await auditOTInternaChange(
        tx,
        otId,
        previo as unknown as Record<string, unknown>,
        u as unknown as Record<string, unknown>,
        usuarioActualiza,
      );
      return u;
    });

    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// PATCH — activar / desactivar (soft-delete reversible). Solo admin.
// Body: { activo: boolean }. Desactivar oculta la OT interna de los listados;
// los datos se conservan. (El `ot` es @unique → su número no se reutiliza.)
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo un administrador puede desactivar/reactivar OTs internas" }, { status: 403 });
    }
    const { id } = await params;
    const otId = Number(id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.activo !== "boolean") {
      return NextResponse.json({ error: "Falta 'activo' (boolean)" }, { status: 400 });
    }
    const existing = await prisma.ordenTrabajoInterna.findUnique({ where: { id: otId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const usuario = (await getAuditUser(req)) ?? "sistema";
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ordenTrabajoInterna.update({
        where: { id: otId },
        data: { activo: body.activo as boolean, version: { increment: 1 } },
      });
      await tx.oTHistorial.create({
        data: {
          orden_trabajo_interna_id: otId,
          tipo_operacion: "EDICION",
          descripcion: body.activo ? "OT interna reactivada" : "OT interna desactivada (anulada)",
          usuario,
        },
      });
      return u;
    });
    return NextResponse.json({ data: updated, message: body.activo ? "OT interna reactivada" : "OT interna desactivada" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// DELETE — elimina una OT interna en cascada (hard delete). Solo admin. Sus
// hijos (adjuntos, historial, requerimientos) caen por cascada de la DB.
// Best-effort: borra los archivos de R2 (adjuntos).
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo un administrador puede eliminar OTs internas" }, { status: 403 });
    }
    const { id } = await params;
    const otId = Number(id);
    const existing = await prisma.ordenTrabajoInterna.findUnique({ where: { id: otId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    // Keys de R2 a limpiar después (los registros se borran por cascade).
    const adjuntos = await prisma.otAdjunto.findMany({ where: { orden_trabajo_interna_id: otId }, select: { r2_key: true } });

    await prisma.ordenTrabajoInterna.delete({ where: { id: otId } });

    await Promise.all(adjuntos.map((a) => deleteObject(a.r2_key).catch((e) => console.warn("R2 huérfano al borrar OT interna:", a.r2_key, e))));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

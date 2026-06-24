import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin, auditOTInternaChange, AUDIT_OT_INTERNA_SELECT_FIELDS } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

// GET — detalle de una OT interna con todas las relaciones.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: (parseInt4Safe(id) ?? 0) },
      include: {
        planta: true,
        equipo: { select: { codigo: true, descripcion: true } },
        tipo_ot_interna: true,
        prioridad_atencion: true,
        // `actividad_codigo` (MP1-4 o PM1-4) es el nivel real de mantenimiento
        // preventivo — el frontend lo necesita para hacer match con TaskList.
        estrategia: { select: { estrategia_id: true, codigo: true, descripcion: true, actividad_codigo: true } },
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
    const otId = parseInt4Safe(id) ?? 0;

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
      // task_list removido (2026-06): el campo libre fue reemplazado por la
      // vista tabla en el tab Tareas que lee directamente del catálogo
      // TaskList según equipo + estrategia PM. La columna sigue en BD por
      // compat con datos legacy pero ya no se acepta como input.
      "prioridad_atencion_codigo", "semana_revision", "estrategia_id",
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

    // Guard de cierre: la OT solo se puede pasar a "Cerrada" cuando todos los
    // campos clave estén completos (fechas reales + responsable + recursos +
    // aprobación). Evita cerrar OTs con datos huérfanos.
    if (data.ot_status_codigo === "Cerrada") {
      const actual = await prisma.ordenTrabajoInterna.findUnique({
        where: { id: otId },
        select: {
          ot_status_codigo: true,
          fecha_inicio_real: true,
          fecha_fin_real: true,
          asignado_a: true,
          recursos_status_codigo: true,
          aprobacion_status_codigo: true,
        },
      });
      if (!actual) {
        return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      }
      // Solo valida en la transición Abierta → Cerrada. Si ya está cerrada
      // (re-save idempotente), no bloquea.
      if (actual.ot_status_codigo !== "Cerrada") {
        // El update es parcial: si el body NO trae un campo, vale el actual.
        const merged = {
          fecha_inicio_real: "fecha_inicio_real" in data ? data.fecha_inicio_real : actual.fecha_inicio_real,
          fecha_fin_real: "fecha_fin_real" in data ? data.fecha_fin_real : actual.fecha_fin_real,
          asignado_a: "asignado_a" in data ? data.asignado_a : actual.asignado_a,
          recursos_status_codigo: "recursos_status_codigo" in data ? data.recursos_status_codigo : actual.recursos_status_codigo,
          aprobacion_status_codigo: "aprobacion_status_codigo" in data ? data.aprobacion_status_codigo : actual.aprobacion_status_codigo,
        };
        const faltantes: string[] = [];
        if (!merged.fecha_inicio_real) faltantes.push("Fecha de inicio real");
        if (!merged.fecha_fin_real) faltantes.push("Fecha de fin real");
        if (!merged.asignado_a) faltantes.push("Asignado a");
        if (merged.recursos_status_codigo !== "Recursos completos") faltantes.push("Recursos completos");
        if (merged.aprobacion_status_codigo !== "APROBADA") faltantes.push("Aprobación (debe estar APROBADA)");
        if (faltantes.length > 0) {
          return NextResponse.json(
            {
              error: `No se puede cerrar la OT — faltan: ${faltantes.join(", ")}.`,
              faltantes,
            },
            { status: 409 },
          );
        }
      }
    }

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
    const otId = parseInt4Safe(id) ?? 0;
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
    const otId = parseInt4Safe(id) ?? 0;
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

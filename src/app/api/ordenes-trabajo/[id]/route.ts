import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditOTChange, AUDIT_OT_SELECT_FIELDS, getAuditUser, isAdmin } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { deleteObject } from "@/lib/r2-helpers";

type Params = { params: Promise<{ id: string }> };

// GET — obtener una OT por id
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const record = await prisma.ordenTrabajo.findUnique({
      where: { id: Number(id) },
      include: {
        cliente: true,
        codigo_reparacion: { include: { tipo: true, flota: true, fabricante: true, posicion: true } },
        fabricante: true,
        garantia: true,
        atencion_reparacion: true,
        tipo_reparacion: true,
        tipo_garantia: true,
        prioridad_atencion: true,
        base_metalica: true,
        ot_status: true,
        recursos_status: true,
        taller_status: true,
        moneda_cotizacion: true,
      },
    });

    if (!record) {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener OT" }, { status: 500 });
  }
}

// PUT — actualizar una OT
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Versioning para concurrencia optimista (opcional: si no viene, se omite el chequeo)
    const clientVersion: number | undefined = typeof body.version === "number" ? body.version : undefined;
    delete body.version;

    // Recalcular % PCR si se actualizan los valores
    if (body.pcr !== undefined && body.horas !== undefined) {
      if (Number(body.pcr) > 0) {
        body.porcentaje_pcr = Number(((Number(body.horas) / Number(body.pcr)) * 100).toFixed(2));
      }
    }

    // Formatear fechas si vienen como string
    const dateFields = [
      "fecha_recepcion", "fecha_requerimiento_cliente", "fecha_reprogramada",
      "fecha_evaluacion", "fecha_entrega_informe", "fecha_cotizacion",
      "fecha_aprobacion", "fecha_llegada_repuestos", "fecha_entrega",
      "fecha_facturacion", "fecha_req_1", "fecha_req_2",
    ];
    for (const field of dateFields) {
      if (body[field]) body[field] = parseDateOnly(body[field]);
    }

    // Si cambia el número de OT, mantener el año derivado en sync.
    if (body.ot != null && body.ot !== "") body.anio = Number(body.ot) % 100;

    // Si el tipo cambia a BIE/SER, los campos exclusivos de Reparación dejan
    // de aplicar y se nulifican. Antes quedaban con el valor heredado de
    // cuando era REP (atención=Contrato, PCR, garantía, etc.) y corrompían
    // los reportes. Solo se aplica si el body trae tipo_codigo nuevo.
    if (body.tipo_codigo === "BIE" || body.tipo_codigo === "SER") {
      body.fecha_recepcion = null;
      body.pcr = null;
      body.horas = null;
      body.porcentaje_pcr = null;
      body.garantia_codigo = null;
      body.atencion_reparacion_codigo = null;
      body.tipo_reparacion_codigo = null;
      body.tipo_garantia_codigo = null;
      body.contrato_dias = null;
      body.fecha_requerimiento_cliente = null;
      body.fecha_reprogramada = null;
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.ordenTrabajo.findUnique({
        where: { id: Number(id) },
        select: { version: true, ...AUDIT_OT_SELECT_FIELDS },
      });

      if (!before) {
        return { conflict: false, notFound: true } as const;
      }

      // Concurrencia: si cliente envió version, debe coincidir
      if (clientVersion !== undefined && clientVersion !== before.version) {
        return { conflict: true, currentVersion: before.version } as const;
      }

      // Auto-fill audit fields y bump de version
      const record = await tx.ordenTrabajo.update({
        where: { id: Number(id) },
        data: {
          ...body,
          usuario_actualiza: usuario,
          fecha_actualizacion: new Date(),
          version: { increment: 1 },
        },
        include: {
          cliente: true,
          codigo_reparacion: true,
          fabricante: true,
          ot_status: true,
          recursos_status: true,
          taller_status: true,
        },
      });

      await auditOTChange(tx, record.id, before as unknown as Record<string, unknown>, record as unknown as Record<string, unknown>, usuario);

      return { conflict: false, record } as const;
    });

    if ("notFound" in result && result.notFound) {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    }
    if (result.conflict) {
      return NextResponse.json(
        { error: "Conflicto de versión: la OT fue modificada por otro usuario.", currentVersion: result.currentVersion },
        { status: 409 },
      );
    }

    return NextResponse.json({ data: result.record });
  } catch (error) {
    console.error("PUT /api/ordenes-trabajo/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar OT" }, { status: 500 });
  }
}

// PATCH — activar / desactivar (soft-delete reversible). Solo admin.
// Body: { activo: boolean }. Desactivar oculta la OT de los listados y libera
// su número (el correlativo ignora las inactivas); los datos se conservan.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo un administrador puede desactivar/reactivar OTs" }, { status: 403 });
    }
    const { id } = await params;
    const otId = Number(id);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.activo !== "boolean") {
      return NextResponse.json({ error: "Falta 'activo' (boolean)" }, { status: 400 });
    }
    const existing = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, select: { id: true, ot: true, activo: true } });
    if (!existing) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

    const usuario = (await getAuditUser(req)) ?? "sistema";
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.ordenTrabajo.update({
        where: { id: otId },
        data: { activo: body.activo as boolean, usuario_actualiza: usuario, fecha_actualizacion: new Date() },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "EDICION",
          descripcion: body.activo ? "OT reactivada" : "OT desactivada (anulada) — número liberado",
          usuario,
        },
      });
      return u;
    });
    return NextResponse.json({ data: updated, message: body.activo ? "OT reactivada" : "OT desactivada" });
  } catch (error) {
    console.error("PATCH /api/ordenes-trabajo/[id] error:", error);
    return NextResponse.json({ error: "Error al cambiar estado de la OT" }, { status: 500 });
  }
}

// DELETE — eliminar OT en cascada (hard delete). Solo admin. Borra TODO lo
// relacionado: evaluaciones, planificación (+capturas/sesiones), repuestos,
// adjuntos e historial salen por cascada de la DB. Compras (OC) + sus detalles
// + los repuestos que las referencian se borran explícitamente en transacción
// (la FK Compra→OT es Restrict). Los préstamos de herramienta se desvinculan
// (SetNull). Best-effort: borra los archivos de R2 (adjuntos + informes).
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo un administrador puede eliminar OTs" }, { status: 403 });
    }
    const { id } = await params;
    const otId = Number(id);
    const existing = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

    // Keys de R2 a limpiar después (los registros se borran en la transacción).
    const [adjuntos, evaluaciones, compras] = await Promise.all([
      prisma.otAdjunto.findMany({ where: { orden_trabajo_id: otId }, select: { r2_key: true } }),
      prisma.evaluacionTecnica.findMany({ where: { ot_id: otId, informe_key: { not: null } }, select: { informe_key: true } }),
      prisma.compra.findMany({ where: { ot_id: otId }, select: { id: true } }),
    ]);
    const compraIds = compras.map((c) => c.id);

    await prisma.$transaction(async (tx) => {
      if (compraIds.length > 0) {
        await tx.compraDetalle.deleteMany({ where: { compra_id: { in: compraIds } } });
      }
      // Los repuestos referencian a las OC vía po_id; hay que borrarlos antes de la OC.
      await tx.oTRepuesto.deleteMany({ where: { ot_id: otId } });
      await tx.compra.deleteMany({ where: { ot_id: otId } });
      // El resto (evaluaciones, planificación+hijos, adjuntos, historial) cae por
      // cascada de la DB al borrar la OT. Préstamos de herramienta → SetNull.
      await tx.ordenTrabajo.delete({ where: { id: otId } });
    });

    // Limpieza de R2 best-effort (fuera de la transacción; no debe fallar el borrado).
    const keys = [
      ...adjuntos.map((a) => a.r2_key),
      ...evaluaciones.map((e) => e.informe_key).filter((k): k is string => !!k),
    ];
    await Promise.all(keys.map((k) => deleteObject(k).catch((e) => console.warn("R2 huérfano al borrar OT:", k, e))));

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/ordenes-trabajo/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar la OT" }, { status: 500 });
  }
}

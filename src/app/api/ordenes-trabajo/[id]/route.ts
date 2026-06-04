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
        // Compras DIRECTAS (Compra.ot_id = this.id) — solo lo mínimo para
        // mostrar el N° OC en la hoja de evaluación y en el Word.
        compras: { select: { id: true, numero_po: true, status_oc_codigo: true } },
        // Compras INDIRECTAS (vía requerimientos agrupados en una OC).
        // Tomamos solo 1 fila por compra distinta gracias a `distinct`.
        repuestos: {
          where: { po_id: { not: null } },
          select: { compra: { select: { id: true, numero_po: true, status_oc_codigo: true } } },
          distinct: ["po_id"],
        },
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

    // Si el tipo cambia, nulificamos los campos que no aplican al nuevo tipo
    // para no arrastrar valores fantasma del flujo anterior. BIE conserva
    // Atención Reparación y Fecha Requerimiento Cliente — solo SER las pierde.
    if (body.tipo_codigo === "BIE" || body.tipo_codigo === "SER") {
      body.fecha_recepcion = null;
      body.pcr = null;
      body.horas = null;
      body.porcentaje_pcr = null;
      body.garantia_codigo = null;
      body.tipo_reparacion_codigo = null;
      body.tipo_garantia_codigo = null;
      body.contrato_dias = null;
      body.fecha_reprogramada = null;
      body.plaqueteo = null;
      body.wo_cliente = null;
      body.po_item = null;
      body.id_viajero = null;
      body.guia_remision = null;
      body.empresa_entrega = null;
      body.base_metalica_codigo = null;
    }
    if (body.tipo_codigo === "SER") {
      // SER no tiene cliente final con condiciones — sin atención ni fecha
      // requerimiento.
      body.atencion_reparacion_codigo = null;
      body.fecha_requerimiento_cliente = null;
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

      // OT cerrada — solo se permite reabrir (cambiar ot_status_codigo).
      // Cualquier otro cambio queda bloqueado para preservar la trazabilidad
      // del cierre. Si el body intenta tocar otros campos junto con el cambio
      // de status, también bloqueamos (queremos que reabra primero, edite después).
      const beforeRecord = before as { ot_status_codigo?: string | null };
      if (beforeRecord.ot_status_codigo === "Cerrada") {
        const cambiaStatusAOtraCosa =
          body.ot_status_codigo !== undefined && body.ot_status_codigo !== "Cerrada";
        const otrasClavesQueEditan = Object.keys(body).filter(
          (k) => k !== "ot_status_codigo" && k !== "version",
        );
        if (!cambiaStatusAOtraCosa || otrasClavesQueEditan.length > 0) {
          return { conflict: false, closed: true } as const;
        }
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
    if ("closed" in result && result.closed) {
      return NextResponse.json(
        { error: "La OT está Cerrada. Reabrila primero (cambiar OT Status) antes de editar otros campos." },
        { status: 403 },
      );
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

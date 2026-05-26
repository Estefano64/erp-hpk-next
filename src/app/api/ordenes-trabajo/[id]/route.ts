import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditOTChange, AUDIT_OT_SELECT_FIELDS, getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

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

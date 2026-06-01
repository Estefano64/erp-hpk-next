import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/anular
// Permiso: cualquier usuario autenticado (consistente con aprobar/desaprobar).
// No se puede anular si ya tiene OC asociada.
export async function POST(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    // Motivo opcional al anular.
    const motivo = typeof body.motivo === "string" ? (body.motivo.trim() || null) : null;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: {
        status_requerimiento_codigo: true,
        status_cotizacion_codigo: true,
        po_id: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        nro_req: true,
        observaciones: true,
      },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.po_id != null) {
      return NextResponse.json({
        error: "No se puede anular: el requerimiento ya tiene OC. Gestiona la anulación desde la OC.",
      }, { status: 409 });
    }
    if (current.status_requerimiento_codigo === "ANULADO") {
      return NextResponse.json({ error: "Ya está anulado." }, { status: 409 });
    }

    // Si la cotización está en proceso (PEND_COT/PEND_APROB), anularla también.
    const cotizacionPendiente =
      current.status_cotizacion_codigo === "PEND_COT" ||
      current.status_cotizacion_codigo === "PEND_APROB";

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "ANULADO",
          ...(cotizacionPendiente ? { status_cotizacion_codigo: "ANULADO" } : {}),
          observaciones: motivo
            ? (current.observaciones ? `${current.observaciones}\n[Anulación] ${motivo}` : `[Anulación] ${motivo}`)
            : current.observaciones,
        },
      });
      // Historial polimórfico (OT externa o interna).
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
          orden_trabajo_interna_id: current.orden_trabajo_interna_id,
          tipo_operacion: "Otro",
          descripcion: `Requerimiento ${current.nro_req ?? id} anulado${motivo ? ` — ${motivo}` : ""}`,
          usuario,
        },
      });
      return r;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST anular error:", error);
    return NextResponse.json({ error: "Error al anular" }, { status: 500 });
  }
}

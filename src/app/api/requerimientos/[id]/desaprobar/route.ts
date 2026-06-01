import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/desaprobar
// La vía principal hoy es /desaprobar-lote. Este queda para callers legacy.
// Permiso: cualquier usuario autenticado.
export async function POST(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    // Motivo opcional. Si viene se anexa a observaciones y al historial.
    const motivo = typeof body.motivo === "string" ? (body.motivo.trim() || null) : null;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: { status_requerimiento_codigo: true, po_id: true, ot_id: true, orden_trabajo_interna_id: true, nro_req: true, observaciones: true },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.status_requerimiento_codigo !== "SIN_APROBACION") {
      return NextResponse.json({
        error: `Solo se puede desaprobar desde SIN_APROBACION. Estado actual: ${current.status_requerimiento_codigo}`,
      }, { status: 409 });
    }
    if (current.po_id != null) {
      return NextResponse.json({ error: "No se puede desaprobar: ya tiene OC." }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "DESAPROBADO",
          usuario_aprueba: usuario,
          fecha_aprobacion: new Date(),
          observaciones: motivo
            ? (current.observaciones ? `${current.observaciones}\n[Desaprobación] ${motivo}` : `[Desaprobación] ${motivo}`)
            : current.observaciones,
        },
      });
      await tx.oTHistorial.create({
        data: {
          // Si el req es de OT interna, ot_id viene null y se guarda en
          // orden_trabajo_interna_id — antes faltaba este campo y el evento
          // quedaba sin parent FK.
          ot_id: current.ot_id,
          orden_trabajo_interna_id: current.orden_trabajo_interna_id,
          tipo_operacion: "Otro",
          descripcion: `Requerimiento ${current.nro_req ?? id} desaprobado${motivo ? ` — ${motivo}` : ""}`,
          usuario,
        },
      });
      return r;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST desaprobar error:", error);
    return NextResponse.json({ error: "Error al desaprobar" }, { status: 500 });
  }
}

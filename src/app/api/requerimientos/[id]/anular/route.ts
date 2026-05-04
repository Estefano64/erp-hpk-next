import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/anular — solo admin. No se puede anular si ya tiene OC.
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden anular requerimientos." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : null;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: { status_requerimiento_codigo: true, po_id: true, ot_id: true, nro_req: true, observaciones: true },
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

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "ANULADO",
          observaciones: motivo
            ? (current.observaciones ? `${current.observaciones}\n[Anulación] ${motivo}` : `[Anulación] ${motivo}`)
            : current.observaciones,
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
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

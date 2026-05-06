import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/requerimientos/[id]/aprobar — solo admin
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden aprobar requerimientos." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: { status_requerimiento_codigo: true, ot_id: true, nro_req: true },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.status_requerimiento_codigo !== "SIN_APROBACION") {
      return NextResponse.json({
        error: `Solo se puede aprobar desde SIN_APROBACION. Estado actual: ${current.status_requerimiento_codigo}`,
      }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.oTRepuesto.update({
        where: { id: Number(id) },
        data: {
          status_requerimiento_codigo: "APROBADO",
          usuario_aprueba: usuario,
          fecha_aprobacion: new Date(),
          status_cotizacion_codigo: "PEND_COT", // arranca el flujo de cotización
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: current.ot_id,
          tipo_operacion: "Otro",
          descripcion: `Requerimiento ${current.nro_req ?? id} aprobado`,
          usuario,
        },
      });
      return r;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST aprobar error:", error);
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }
}

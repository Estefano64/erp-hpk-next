import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/ordenes-trabajo/[id]/requerimientos/limpiar-pendientes
// Borra los requerimientos en SIN_APROBACION sin OC. Mantiene los aprobados/anulados/con OC.
// Usado al cambiar cod_rep en una OT para descartar lo viejo sin aplicar template nuevo.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.oTRepuesto.findMany({
        where: {
          ot_id: otId,
          status_requerimiento_codigo: { in: ["BORRADOR", "SIN_APROBACION"] },
          po_id: null,
        },
        select: { id: true },
      });
      if (target.length === 0) return { eliminados: 0 };

      const del = await tx.oTRepuesto.deleteMany({
        where: { id: { in: target.map((r) => r.id) } },
      });

      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "Otro",
          descripcion: `Eliminados ${del.count} requerimiento(s) SIN_APROBACION`,
          usuario,
        },
      });

      return { eliminados: del.count };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("DELETE limpiar-pendientes error:", error);
    return NextResponse.json({ error: "Error al limpiar pendientes" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { maybePromoveOTaRecursosSolicitados } from "@/lib/ot-status";

type Ctx = { params: Promise<{ id: string; nro_req: string }> };

// POST /api/ordenes-trabajo/[id]/requerimientos/[nro_req]/enviar
// Envía a aprobación TODOS los items en BORRADOR de un nro_req (un solo requerimiento completo).
// Después, si la OT quedó sin BORRADOR, promueve recursos_status a "Recursos solicitados".
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id, nro_req } = await ctx.params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID de OT inválido" }, { status: 400 });
    }
    const nroReq = decodeURIComponent(nro_req).trim();
    if (!nroReq) {
      return NextResponse.json({ error: "nro_req requerido" }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const items = await tx.oTRepuesto.findMany({
        where: { ot_id: otId, nro_req: nroReq },
        select: { id: true, status_requerimiento_codigo: true },
      });
      if (items.length === 0) {
        throw new Error("NOT_FOUND");
      }
      const borradores = items.filter((i) => i.status_requerimiento_codigo === "BORRADOR");
      if (borradores.length === 0) {
        throw new Error("NO_BORRADORES");
      }
      await tx.oTRepuesto.updateMany({
        where: { id: { in: borradores.map((b) => b.id) } },
        data: {
          status_requerimiento_codigo: "SIN_APROBACION",
          fecha_envio_aprobacion: new Date(),
          usuario_envia: usuario,
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "REQUERIMIENTO",
          descripcion: `Requerimiento ${nroReq} enviado a aprobación (${borradores.length} item(s)).`,
          usuario,
        },
      });
      const promovido = await maybePromoveOTaRecursosSolicitados(tx, otId, usuario);
      return { enviados: borradores.length, total: items.length, promovido };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Requerimiento no encontrado en esta OT." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "NO_BORRADORES") {
      return NextResponse.json({ error: "No hay items en BORRADOR para enviar." }, { status: 409 });
    }
    console.error("POST enviar grupo error:", error);
    return NextResponse.json({ error: "Error al enviar requerimiento" }, { status: 500 });
  }
}

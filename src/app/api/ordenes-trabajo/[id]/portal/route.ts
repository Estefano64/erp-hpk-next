// POST /api/ordenes-trabajo/[id]/portal — publica u oculta la OT en el
// portal de clientes. Body: { visible: boolean }.
//
// Permiso: cae bajo la regla de escritura de /api/ordenes-trabajo del
// middleware (admin/planner/produccion/logistica) — los publicadores que
// definió el usuario. Queda traza en el historial de la OT.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (typeof body?.visible !== "boolean") {
      return NextResponse.json({ error: "Se requiere { visible: boolean }" }, { status: 400 });
    }
    const visible: boolean = body.visible;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      select: { id: true, ot: true, id_cliente: true, visible_portal: true },
    });
    if (!ot) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    if (visible && !ot.id_cliente) {
      return NextResponse.json({ error: "La OT no tiene cliente asignado — no se puede publicar en el portal" }, { status: 400 });
    }
    if (ot.visible_portal === visible) {
      return NextResponse.json({ data: { visible_portal: visible }, message: "Sin cambios" });
    }

    await prisma.$transaction([
      prisma.ordenTrabajo.update({ where: { id: otId }, data: { visible_portal: visible } }),
      prisma.oTHistorial.create({
        data: {
          ot_id: otId,
          tipo_operacion: "PORTAL",
          descripcion: visible
            ? `OT ${ot.ot ?? otId} PUBLICADA en el portal de clientes`
            : `OT ${ot.ot ?? otId} OCULTADA del portal de clientes`,
          usuario,
        },
      }),
    ]);

    return NextResponse.json({ data: { visible_portal: visible } });
  } catch (e) {
    console.error("POST /api/ordenes-trabajo/[id]/portal error:", e);
    return NextResponse.json({ error: "Error al actualizar visibilidad" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/ordenes-trabajo/[id]/historial — historial de cambios de la OT, ordenado por fecha desc
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const records = await prisma.oTHistorial.findMany({
      where: { ot_id: otId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
    return NextResponse.json({ data: records });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/[id]/historial error:", error);
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 500 });
  }
}

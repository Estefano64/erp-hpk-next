import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ otId: string }> };

// GET — obtener la evaluacion mas reciente de una OT
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { otId } = await params;
    const record = await prisma.evaluacionTecnica.findFirst({
      where: { ot_id: Number(otId) },
      orderBy: { updatedAt: "desc" },
    });
    if (!record) {
      return NextResponse.json({ error: "No hay evaluacion para esta OT" }, { status: 404 });
    }
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("GET /api/evaluaciones/ot/[otId] error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

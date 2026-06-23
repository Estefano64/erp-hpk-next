// GET /api/ordenes-trabajo/[id]/costos
// Devuelve el desglose de costos de la OT externa (ejecutado vs proyectado).
// La lógica vive en src/lib/costos-ot.ts y se comparte con el endpoint de
// OT interna.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularCostosOT } from "@/lib/costos-ot";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const data = await calcularCostosOT(prisma, { otId });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("GET /api/ordenes-trabajo/[id]/costos error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al calcular costos" },
      { status: 500 },
    );
  }
}

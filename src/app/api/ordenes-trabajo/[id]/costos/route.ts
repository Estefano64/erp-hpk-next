// GET /api/ordenes-trabajo/[id]/costos
// Devuelve el desglose de costos de la OT externa (ejecutado vs proyectado).
// La lógica vive en src/lib/costos-ot.ts y se comparte con el endpoint de
// OT interna.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { calcularCostosOT } from "@/lib/costos-ot";
import { puedeVerCostosOT } from "@/lib/acceso-rutas";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    // Costos de OT: solo admin (y no sin_costos). Mismo criterio que la
    // pestaña Costos del frontend — esto evita verlos pegándole a la URL.
    const token = await getToken({ req });
    if (!puedeVerCostosOT((token?.roles as string[] | undefined) ?? [])) {
      return NextResponse.json({ error: "Tu rol no tiene permiso para ver costos" }, { status: 403 });
    }
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

// GET /api/ordenes-trabajo-internas/[id]/costos
// Devuelve el desglose de costos de la OT INTERNA. Misma estructura que el
// endpoint de externas — la lógica vive en src/lib/costos-ot.ts.
//
// Diferencias respecto a externa:
//   - No hay HH (PlanificacionOT solo se vincula a OT externa hoy).
//   - OCs se buscan vía OTRepuesto.orden_trabajo_interna_id → po_id.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularCostosOT } from "@/lib/costos-ot";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const otInternaId = parseInt4Safe(id) ?? 0;
    if (otInternaId == null || otInternaId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const data = await calcularCostosOT(prisma, { otInternaId });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("GET /api/ordenes-trabajo-internas/[id]/costos error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al calcular costos" },
      { status: 500 },
    );
  }
}

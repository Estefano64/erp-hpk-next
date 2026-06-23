import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cascadeEmergencia } from "@/lib/emergencia-cascade";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

// POST /api/planificacion/[id]/emergencia
// Marca la tarea como CORRECTIVA (emergencia) y reacomoda las tareas del mismo
// día y operario(s) que arrancan en/después de ella. Ver lib/emergencia-cascade.
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = parseInt4Safe(id) ?? 0;
    const result = await prisma.$transaction((tx) => cascadeEmergencia(tx, planId));
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/planificacion/[id]/emergencia error:", error);
    return NextResponse.json({ error: "Error al marcar emergencia" }, { status: 500 });
  }
}

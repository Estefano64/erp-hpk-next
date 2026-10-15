// GET /api/ordenes-trabajo/[id]/medidas-cromado
// Medidas de vástago de la evaluación de la OT (Ø B1-B3 y longitud de cromo)
// para que el formulario de requerimientos las muestre en observaciones al
// elegir un SER de cromado, ANTES de guardar (pedido 2026-10-15, OT 414126).
// Al guardar, el servidor igual escribe/actualiza la línea.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { medidasCromadoPorOt } from "@/lib/medidas-cromado-server";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    const m = (await medidasCromadoPorOt([otId])).get(otId) ?? null;
    return NextResponse.json({ data: m });
  } catch (error) {
    console.error("GET medidas-cromado error:", error);
    return NextResponse.json({ error: "Error al obtener medidas" }, { status: 500 });
  }
}

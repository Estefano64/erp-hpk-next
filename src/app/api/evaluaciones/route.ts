import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar evaluaciones (opcional filtro por ot_id)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const otId = searchParams.get("ot_id");

    const where = otId ? { ot_id: Number(otId) } : {};
    const records = await prisma.evaluacionTecnica.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        orden_trabajo: {
          select: { id: true, ot: true, descripcion: true, tipo: true, estrategia: true },
        },
      },
    });
    return NextResponse.json({ data: records });
  } catch (error) {
    console.error("GET /api/evaluaciones error:", error);
    return NextResponse.json({ error: "Error al obtener evaluaciones" }, { status: 500 });
  }
}

// POST — crear o actualizar (upsert por ot_id)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ot_id,
      modelo_evaluacion,
      sistema_medicion,
      fecha_evaluacion,
      evaluado_por,
      datos_formulario,
      resultado_general,
      recomendaciones_general,
      estado,
    } = body;

    if (!ot_id || !modelo_evaluacion) {
      return NextResponse.json(
        { error: "ot_id y modelo_evaluacion son obligatorios" },
        { status: 400 }
      );
    }

    // Buscar evaluacion existente para esta OT
    const existing = await prisma.evaluacionTecnica.findFirst({
      where: { ot_id: Number(ot_id) },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      ot_id: Number(ot_id),
      modelo_evaluacion,
      sistema_medicion: sistema_medicion || "Metrico",
      fecha_evaluacion: fecha_evaluacion ? new Date(fecha_evaluacion) : null,
      evaluado_por: evaluado_por || null,
      datos_formulario: datos_formulario ?? {},
      resultado_general: resultado_general || null,
      recomendaciones_general: recomendaciones_general || null,
      estado: estado || "BORRADOR",
    };

    const record = existing
      ? await prisma.evaluacionTecnica.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.evaluacionTecnica.create({ data });

    return NextResponse.json({ data: record }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/evaluaciones error:", error);
    return NextResponse.json({ error: "Error al guardar evaluacion" }, { status: 500 });
  }
}

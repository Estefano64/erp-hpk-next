import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ESTADOS_VALIDOS = ["BORRADOR", "COMPLETADA", "PENDIENTE_APROBACION", "APROBADA", "RECHAZADA"] as const;

// GET — listar evaluaciones (filtro por ot_id + paginación)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const otId = searchParams.get("ot_id");
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 100)));

    const where = otId ? { ot_id: Number(otId) } : {};
    const [records, total] = await Promise.all([
      prisma.evaluacionTecnica.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          orden_trabajo: {
            select: { id: true, ot: true, descripcion: true, tipo: true, estrategia: true },
          },
        },
      }),
      prisma.evaluacionTecnica.count({ where }),
    ]);
    return NextResponse.json({ data: records, total, page });
  } catch (error) {
    console.error("GET /api/evaluaciones error:", error);
    return NextResponse.json({ error: "Error al obtener evaluaciones" }, { status: 500 });
  }
}

const UpsertSchema = z.object({
  ot_id: z.coerce.number().int().positive(),
  modelo_evaluacion: z.string().trim().min(1),
  sistema_medicion: z.string().trim().optional().nullable(),
  fecha_evaluacion: z.string().optional().nullable(),
  evaluado_por: z.string().trim().optional().nullable(),
  datos_formulario: z.record(z.string(), z.unknown()).optional().nullable(),
  resultado_general: z.string().optional().nullable(),
  recomendaciones_general: z.string().optional().nullable(),
  estado: z.enum(ESTADOS_VALIDOS).optional(),
});

// POST — crear o actualizar (upsert por ot_id)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // Buscar evaluacion existente para esta OT
    const existing = await prisma.evaluacionTecnica.findFirst({
      where: { ot_id: d.ot_id },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      ot_id: d.ot_id,
      modelo_evaluacion: d.modelo_evaluacion,
      sistema_medicion: d.sistema_medicion || "Metrico",
      fecha_evaluacion: d.fecha_evaluacion ? new Date(d.fecha_evaluacion) : null,
      evaluado_por: d.evaluado_por || null,
      datos_formulario: (d.datos_formulario ?? {}) as Prisma.InputJsonValue,
      resultado_general: d.resultado_general || null,
      recomendaciones_general: d.recomendaciones_general || null,
      estado: d.estado ?? "BORRADOR",
    };

    const record = existing
      ? await prisma.evaluacionTecnica.update({ where: { id: existing.id }, data })
      : await prisma.evaluacionTecnica.create({ data });

    return NextResponse.json({ data: record }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/evaluaciones error:", error);
    return NextResponse.json({ error: "Error al guardar evaluacion" }, { status: 500 });
  }
}

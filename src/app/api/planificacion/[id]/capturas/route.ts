import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const TipoCapturaEnum = z.enum(["MEDIDA_NUMERICA", "CHECKLIST_BMN", "FOTO", "TEXTO", "TOLERANCIA", "BOOLEAN"]);

const CapturaSchema = z.object({
  campo_key: z.string().trim().min(1).max(100),
  tipo_captura: TipoCapturaEnum,
  valor_numero: z.coerce.number().optional().nullable(),
  valor_texto: z.string().optional().nullable(),
  valor_booleano: z.boolean().optional().nullable(),
  valor_url: z.string().trim().optional().nullable(),
  unidad: z.string().trim().optional().nullable(),
});

// GET — listar capturas de una planificación
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const planId = parseInt4Safe(id) ?? 0;
  const data = await prisma.planificacionOTCaptura.findMany({
    where: { planificacion_ot_id: planId },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ data });
}

// POST — agregar una captura. Si ya existe (campo_key, planificacion_ot_id), actualiza.
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = parseInt4Safe(id) ?? 0;
    const body = await req.json();
    const parsed = CapturaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Existe ya?
    const existing = await prisma.planificacionOTCaptura.findFirst({
      where: { planificacion_ot_id: planId, campo_key: d.campo_key },
    });

    const upserted = existing
      ? await prisma.planificacionOTCaptura.update({
          where: { id: existing.id },
          data: {
            tipo_captura: d.tipo_captura,
            valor_numero: d.valor_numero ?? null,
            valor_texto: d.valor_texto ?? null,
            valor_booleano: d.valor_booleano ?? null,
            valor_url: d.valor_url ?? null,
            unidad: d.unidad ?? null,
          },
        })
      : await prisma.planificacionOTCaptura.create({
          data: {
            planificacion_ot_id: planId,
            campo_key: d.campo_key,
            tipo_captura: d.tipo_captura,
            valor_numero: d.valor_numero ?? null,
            valor_texto: d.valor_texto ?? null,
            valor_booleano: d.valor_booleano ?? null,
            valor_url: d.valor_url ?? null,
            unidad: d.unidad ?? null,
          },
        });

    return NextResponse.json({ data: upserted }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/planificacion/[id]/capturas error:", error);
    return NextResponse.json({ error: "Error al guardar captura" }, { status: 500 });
  }
}

// DELETE — borrar una captura por campo_key (querystring: ?campo_key=X)
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const planId = parseInt4Safe(id) ?? 0;
    const campoKey = req.nextUrl.searchParams.get("campo_key");
    if (!campoKey) {
      return NextResponse.json({ error: "Falta ?campo_key=..." }, { status: 400 });
    }
    const r = await prisma.planificacionOTCaptura.deleteMany({
      where: { planificacion_ot_id: planId, campo_key: campoKey },
    });
    return NextResponse.json({ success: true, deleted: r.count });
  } catch (error) {
    console.error("DELETE /api/planificacion/[id]/capturas error:", error);
    return NextResponse.json({ error: "Error al borrar captura" }, { status: 500 });
  }
}

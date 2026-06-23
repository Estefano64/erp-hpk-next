import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizarNombreRecurso } from "@/lib/recursos";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  // Sin coma: rompería el separador de multi-recurso "|" (ver @/lib/recursos).
  nombre: z.string().trim().min(1).max(200).transform(normalizarNombreRecurso).optional(),
  dni: z.string().trim().optional().nullable(),
  area: z.string().trim().min(1).max(50).optional(),
  puesto: z.string().trim().min(1).max(100).optional(),
  equipo_codigo: z.string().trim().optional().nullable(),
  costo_hora_hombre: z.coerce.number().min(0).optional().nullable(),
  costo_hora_extra: z.coerce.number().min(0).optional().nullable(),
  activo: z.boolean().optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const updated = await prisma.trabajador.update({
      where: { trabajador_id: (parseInt4Safe(id) ?? 0) },
      data: parsed.data,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/trabajadores/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar trabajador" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    // Soft delete: marca inactivo (preserva referencias en planificacion_ot)
    await prisma.trabajador.update({
      where: { trabajador_id: (parseInt4Safe(id) ?? 0) },
      data: { activo: false },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/trabajadores/[id] error:", error);
    return NextResponse.json({ error: "Error al desactivar trabajador" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  actividad_codigo: z.string().trim().min(1).optional(),
  tipo_codigo: z.string().trim().min(1).optional(),
  material_codigo: z.string().trim().optional().nullable(),
  fabricante_codigo: z.string().trim().optional().nullable(),
  servicio_codigo: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().min(1).optional(),
  ref_descripcion: z.string().trim().optional().nullable(),
  np: z.string().trim().optional().nullable(),
  np_cod1: z.string().trim().optional().nullable(),
  np_cod2: z.string().trim().optional().nullable(),
  id_tubo: z.string().trim().optional().nullable(),
  od_vas: z.string().trim().optional().nullable(),
  texto: z.string().trim().optional().nullable(),
  requerimiento: z.coerce.number().min(0).optional(),
  precio: z.coerce.number().min(0).optional().nullable(),
  item_numero: z.coerce.number().int().min(0).optional(),
});

// PUT /api/tareas/[id] — editar item del template (admin)
export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden modificar templates." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const updated = await prisma.tarea.update({
      where: { tarea_id: (parseInt4Safe(id) ?? 0) },
      data: parsed.data,
      include: { material: true, tipo: true, fabricante: true },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      if (error.code === "P2003") return NextResponse.json({ error: "Referencia inválida (material/tipo)." }, { status: 400 });
    }
    console.error("PUT /api/tareas/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE /api/tareas/[id] — borrar item del template (admin)
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden modificar templates." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    await prisma.tarea.delete({ where: { tarea_id: (parseInt4Safe(id) ?? 0) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("DELETE /api/tareas/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

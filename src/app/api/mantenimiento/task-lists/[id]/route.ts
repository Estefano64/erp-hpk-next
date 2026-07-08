import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// PUT — update parcial de una tarea (TaskList). El grupo (máquina + PM)
// típicamente no se cambia; si se cambia, la tarea "salta" al otro grupo.
const UpdateSchema = z.object({
  maquina_taller: z.string().trim().min(1).max(150).optional(),
  actividad_codigo: z.string().trim().min(1).max(20).optional(),
  descripcion: z.string().trim().min(1).optional(),
  usuario_responsable: z.string().trim().max(100).optional().nullable(),
  equipo_codigo: z.string().trim().max(50).optional().nullable(),
  activo: z.boolean().optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const updated = await prisma.taskList.update({
      where: { id: idNum },
      data: {
        ...parsed.data,
        usuario_actualiza: usuario,
      },
      include: {
        items: {
          orderBy: { item: "asc" },
          include: { material: { select: { codigo: true, descripcion: true, np: true } } },
        },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

// DELETE — borra la tarea. Los TaskListItem hijos se borran en cascada
// (definido en el schema Prisma con onDelete: Cascade).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    await prisma.taskList.delete({ where: { id: idNum } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      if (e.code === "P2003") {
        return NextResponse.json(
          { error: "No se puede eliminar: hay referencias a esta tarea." },
          { status: 409 },
        );
      }
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ itemId: string }> };

// PUT — update parcial de un TaskListItem.
const UpdateSchema = z.object({
  tipo: z.enum(["MAC", "CAD", "SER"]).optional(),
  material_codigo: z.string().trim().max(50).optional().nullable(),
  ref_descripcion: z.string().trim().optional().nullable(),
  np: z.string().trim().max(150).optional().nullable(),
  requerimiento: z.coerce.number().optional().nullable(),
  um: z.string().trim().max(20).optional().nullable(),
  texto: z.string().trim().optional().nullable(),
  precio: z.coerce.number().optional().nullable(),
  item: z.coerce.number().int().min(0).optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { itemId } = await ctx.params;
    const idNum = Number(itemId);
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
    const d = parsed.data;

    // Convertimos Decimal solo si vienen presentes en el patch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = { ...d };
    if ("requerimiento" in d) {
      data.requerimiento = d.requerimiento != null ? new Prisma.Decimal(d.requerimiento) : null;
    }
    if ("precio" in d) {
      data.precio = d.precio != null ? new Prisma.Decimal(d.precio) : null;
    }

    const updated = await prisma.taskListItem.update({
      where: { id: idNum },
      data,
      include: {
        material: { select: { codigo: true, descripcion: true, np: true } },
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { itemId } = await ctx.params;
    const idNum = Number(itemId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    await prisma.taskListItem.delete({ where: { id: idNum } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

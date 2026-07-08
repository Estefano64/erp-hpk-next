import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// POST — crea un nuevo item (TaskListItem) para la tarea [id].
// El `item` (nro de orden) se autocalcula como max+1 dentro de la tarea, en
// una transacción Serializable para evitar colisión en escrituras paralelas.
const CreateSchema = z.object({
  tipo: z.enum(["MAC", "CAD", "SER"]),
  material_codigo: z.string().trim().max(50).optional().nullable(),
  ref_descripcion: z.string().trim().optional().nullable(),
  np: z.string().trim().max(150).optional().nullable(),
  requerimiento: z.coerce.number().optional().nullable(),
  um: z.string().trim().max(20).optional().nullable(),
  texto: z.string().trim().optional().nullable(),
  precio: z.coerce.number().optional().nullable(),
  item: z.coerce.number().int().min(0).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const taskListId = Number(id);
    if (!Number.isFinite(taskListId) || taskListId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      let item = d.item;
      if (item == null) {
        const maxAgg = await tx.taskListItem.aggregate({
          where: { task_list_id: taskListId },
          _max: { item: true },
        });
        item = (maxAgg._max.item ?? 0) + 1;
      }
      return tx.taskListItem.create({
        data: {
          task_list_id: taskListId,
          tipo: d.tipo,
          material_codigo: d.material_codigo ?? null,
          ref_descripcion: d.ref_descripcion ?? null,
          np: d.np ?? null,
          requerimiento: d.requerimiento != null ? new Prisma.Decimal(d.requerimiento) : null,
          um: d.um ?? null,
          texto: d.texto ?? null,
          precio: d.precio != null ? new Prisma.Decimal(d.precio) : null,
          item,
        },
        include: {
          material: { select: { codigo: true, descripcion: true, np: true } },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json(
        { error: "Referencia inválida (task_list o material)." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

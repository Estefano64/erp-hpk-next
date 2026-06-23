import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  codigo: z.string().trim().min(1).max(20).optional(),
  nombre: z.string().trim().min(1).max(100).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  asignadas: z.coerce.number().int().min(0).optional(),
  estado: z.enum(["Disponible", "Mantenimiento", "Inactiva", "Reservada"]).optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const r = await prisma.herramienta.findUnique({ where: { id: (parseInt4Safe(id) ?? 0) } });
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: r });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const r = await prisma.herramienta.update({ where: { id: (parseInt4Safe(id) ?? 0) }, data: parsed.data });
    return NextResponse.json({ data: r });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err?.code === "P2002") return NextResponse.json({ error: "Código ya existe" }, { status: 409 });
    console.error("PUT /api/herramientas/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.herramienta.delete({ where: { id: (parseInt4Safe(id) ?? 0) } });
    return NextResponse.json({ message: "Eliminada" });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err?.code === "P2003") return NextResponse.json({ error: "No se puede eliminar: tiene préstamos asociados" }, { status: 409 });
    console.error("DELETE /api/herramientas/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

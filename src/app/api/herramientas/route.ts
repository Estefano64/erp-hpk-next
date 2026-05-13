import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(1).max(100),
  stock: z.coerce.number().int().min(0).default(0),
  asignadas: z.coerce.number().int().min(0).default(0),
  estado: z.enum(["Disponible", "Mantenimiento", "Inactiva", "Reservada"]).default("Disponible"),
});

// GET /api/herramientas — listado
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search")?.trim();
    const limit = Math.min(10000, Math.max(1, Number(sp.get("limit") ?? 200)));

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { nombre: { contains: search, mode: "insensitive" } },
      ];
    }

    const data = await prisma.herramienta.findMany({
      where,
      orderBy: { codigo: "asc" },
      take: limit,
    });
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("GET /api/herramientas error:", error);
    return NextResponse.json({ error: "Error al obtener herramientas" }, { status: 500 });
  }
}

// POST /api/herramientas — crear
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const r = await prisma.herramienta.create({ data: parsed.data });
    return NextResponse.json({ data: r }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") return NextResponse.json({ error: "Código ya existe" }, { status: 409 });
    console.error("POST /api/herramientas error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

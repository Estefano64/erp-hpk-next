import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 200)));
    const search = searchParams.get("search")?.trim();
    const area = searchParams.get("area")?.trim();
    const activos = searchParams.get("activos") !== "false";

    const where: Record<string, unknown> = {};
    if (activos) where.activo = true;
    if (area) where.area = area;
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: "insensitive" } },
        { dni: { contains: search } },
        { puesto: { contains: search, mode: "insensitive" } },
      ];
    }

    const data = await prisma.trabajador.findMany({
      where,
      orderBy: [{ area: "asc" }, { nombre: "asc" }],
      take: limit,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/trabajadores error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

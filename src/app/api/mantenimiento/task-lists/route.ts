import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — lista de task lists con filtros y paginación.
// Filtros:
//   - search: matchea descripción, máquina_taller, usuario_responsable
//   - maquina_taller: exacto
//   - actividad_codigo: exacto (MP1..MP4)
//   - incluirInactivos=1: incluir activo=false (default solo activos)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 500)));
    const search = searchParams.get("search")?.trim() ?? "";
    const maquina = searchParams.get("maquina_taller") ?? "";
    const actividad = searchParams.get("actividad_codigo") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (search) {
      where.OR = [
        { descripcion: { contains: search, mode: "insensitive" } },
        { maquina_taller: { contains: search, mode: "insensitive" } },
        { usuario_responsable: { contains: search, mode: "insensitive" } },
      ];
    }
    if (maquina) where.maquina_taller = maquina;
    if (actividad) where.actividad_codigo = actividad;
    if (searchParams.get("incluirInactivos") !== "1") where.activo = true;

    const [data, total] = await Promise.all([
      prisma.taskList.findMany({
        where,
        include: {
          items: {
            orderBy: { item: "asc" },
            include: {
              material: { select: { codigo: true, descripcion: true, np: true } },
            },
          },
        },
        orderBy: [
          { maquina_taller: "asc" },
          { actividad_codigo: "asc" },
          { id: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.taskList.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

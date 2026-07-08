import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

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

// POST — crea una nueva tarea (TaskList) dentro de un grupo (máquina + PM).
// Mismo patrón que /api/operaciones-cod-rep: el caller manda la clave del
// grupo (máquina + actividad) y el body con los datos de la nueva tarea.
const CreateSchema = z.object({
  maquina_taller: z.string().trim().min(1).max(150),
  actividad_codigo: z.string().trim().min(1).max(20),
  descripcion: z.string().trim().min(1),
  usuario_responsable: z.string().trim().max(100).optional().nullable(),
  equipo_codigo: z.string().trim().max(50).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const created = await prisma.taskList.create({
      data: {
        maquina_taller: d.maquina_taller,
        actividad_codigo: d.actividad_codigo,
        descripcion: d.descripcion,
        usuario_responsable: d.usuario_responsable ?? null,
        equipo_codigo: d.equipo_codigo ?? null,
        usuario_crea: usuario,
        usuario_actualiza: usuario,
        activo: true,
      },
      include: {
        items: { orderBy: { item: "asc" } },
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

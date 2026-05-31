import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizarNombreRecurso } from "@/lib/recursos";

// Los selectores de operario / evaluador / supervisor filtran ahora por el ROL
// del Usuario vinculado al Trabajador (no por su puesto). Esto significa que:
//   - Un técnico SIN cuenta de usuario NO aparece en selectores (debe tener
//     cuenta — el iniciar/finalizar tareas igual lo requiere).
//   - El rol "tecnico" decide si aparece como operario.
//   - El rol "evaluador" decide si aparece en "Evaluado por" de la hoja.
//   - El rol "aprobador_evaluacion" decide si aparece en "Supervisor" de la hoja.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 200)));
    const search = searchParams.get("search")?.trim();
    const area = searchParams.get("area")?.trim();
    const activos = searchParams.get("activos") !== "false";
    // Filtros por rol del Usuario vinculado al Trabajador:
    const soloOperarios = searchParams.get("soloOperarios") === "1";       // rol "tecnico"
    const paraEvaluacion = searchParams.get("paraEvaluacion") === "1";     // rol "evaluador"
    const paraSupervisor = searchParams.get("paraSupervisor") === "1";     // rol "aprobador_evaluacion"

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

    // Filtro por rol del Usuario asociado. Usamos `usuario.is.roles.has` que
    // mapea a SQL `roles @> ARRAY['rol']` (el trabajador debe tener cuenta
    // vinculada Y esa cuenta debe contener el rol pedido).
    let rolRequerido: string | null = null;
    if (soloOperarios) rolRequerido = "tecnico";
    else if (paraSupervisor) rolRequerido = "aprobador_evaluacion";
    else if (paraEvaluacion) rolRequerido = "evaluador";

    if (rolRequerido) {
      where.usuario = {
        is: {
          activo: true,
          roles: { has: rolRequerido },
        },
      };
    }

    const data = await prisma.trabajador.findMany({
      where,
      include: {
        equipo: { select: { codigo: true, descripcion: true } },
      },
      orderBy: [{ area: "asc" }, { nombre: "asc" }],
      take: limit,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/trabajadores error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  // Sin coma: rompería el separador de multi-recurso "|" (ver @/lib/recursos).
  nombre: z.string().trim().min(1).max(200).transform(normalizarNombreRecurso),
  dni: z.string().trim().optional().nullable(),
  area: z.string().trim().min(1).max(50),
  puesto: z.string().trim().min(1).max(100),
  equipo_codigo: z.string().trim().optional().nullable(),
  costo_hora_hombre: z.coerce.number().min(0).optional().nullable(),
  costo_hora_extra: z.coerce.number().min(0).optional().nullable(),
  activo: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const created = await prisma.trabajador.create({
      data: {
        nombre: d.nombre,
        dni: d.dni ?? null,
        area: d.area,
        puesto: d.puesto,
        equipo_codigo: d.equipo_codigo ?? null,
        costo_hora_hombre: d.costo_hora_hombre ?? null,
        costo_hora_extra: d.costo_hora_extra ?? null,
        activo: d.activo ?? true,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/trabajadores error:", error);
    return NextResponse.json({ error: "Error al crear trabajador" }, { status: 500 });
  }
}

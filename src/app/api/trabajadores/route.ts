import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Whitelist de puestos técnicos que pueden tomar tareas en planificación.
// Confirmado 2026-05-27: solo estos 6 puestos aparecen en el selector de
// operario; cualquier otro (jefes, administrativos, sin puesto, etc.) queda
// fuera. Si el día de mañana se suma un técnico nuevo, hay que asignarle uno
// de estos puestos (o agregar el suyo a esta lista).
const PUESTOS_TECNICOS = [
  "Evaluación / Armado",
  "Fresa",
  "Mandrino",
  "Practicante",
  "Soldador",
  "Torno",
];

// Áreas cuyos trabajadores NO pueden firmar como evaluador técnico. Logística
// se excluye además de limpieza/seguridad (los técnicos de mantenimiento sí
// pueden evaluar, los de logística no).
const AREAS_NO_EVALUADORES = ["LIMPIEZA", "SEGURIDAD", "LOGISTICA"];
const PUESTOS_NO_OPERATIVOS = ["COMPRAS"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 200)));
    const search = searchParams.get("search")?.trim();
    const area = searchParams.get("area")?.trim();
    const activos = searchParams.get("activos") !== "false";
    // ?soloOperarios=1 excluye limpieza, seguridad, compras y jefes (cualquier puesto que arranque con "JEFE").
    // Usado por los selectores de operario en OTTareasTab y operaciones/planificacion.
    const soloOperarios = searchParams.get("soloOperarios") === "1";
    // ?paraEvaluacion=1 excluye además logística (los selectores "Evaluado por"
    // / "Supervisor" de la hoja de evaluación no deberían incluirlos).
    const paraEvaluacion = searchParams.get("paraEvaluacion") === "1";

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
    if (soloOperarios) {
      // Solo trabajadores cuyo puesto está en la whitelist técnica.
      where.puesto = { in: PUESTOS_TECNICOS };
    } else if (paraEvaluacion) {
      where.AND = [
        { area: { notIn: AREAS_NO_EVALUADORES } },
        { puesto: { notIn: PUESTOS_NO_OPERATIVOS } },
      ];
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
  nombre: z.string().trim().min(1).max(200),
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

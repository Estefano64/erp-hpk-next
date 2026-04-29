import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET /api/operaciones-cod-rep?cod_rep_codigo=CR-0001[&has_hours=false]
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const codRepCodigo = searchParams.get("cod_rep_codigo")?.trim();
    const hasHours = searchParams.get("has_hours");
    const where: Record<string, unknown> = { activo: true };
    if (codRepCodigo) where.cod_rep_codigo = codRepCodigo;
    if (hasHours === "false") where.horas = null;
    if (hasHours === "true") where.horas = { not: null };

    const data = await prisma.operacionCodRep.findMany({
      where,
      include: {
        componente: { select: { codigo: true, nombre: true } },
        operacion_reparacion: { select: { codigo: true, nombre: true } },
        codigo_reparacion: { select: { codigo: true, descripcion: true } },
      },
      orderBy: [{ cod_rep_codigo: "asc" }, { orden: "asc" }],
      take: codRepCodigo ? 500 : 100,
    });
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("GET /api/operaciones-cod-rep error:", error);
    return NextResponse.json({ error: "Error al obtener operaciones" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  cod_rep_codigo: z.string().trim().min(1),
  componente_codigo: z.string().trim().min(1),
  trabajo: z.string().trim().min(1).max(200),
  operacion_reparacion_codigo: z.string().trim().optional().nullable(),
  qty: z.coerce.number().int().min(1).default(1),
  horas: z.coerce.number().min(0).optional().nullable(),
  hh: z.coerce.number().min(0).optional().nullable(),
  orden: z.coerce.number().int().min(0).optional(),
});

// POST /api/operaciones-cod-rep — agregar una nueva operación a la plantilla de un cod_rep
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Si no especifican orden, usar el máximo + 1 dentro del cod_rep
    let orden = d.orden;
    if (orden == null) {
      const maxAgg = await prisma.operacionCodRep.aggregate({
        where: { cod_rep_codigo: d.cod_rep_codigo },
        _max: { orden: true },
      });
      orden = (maxAgg._max.orden ?? 0) + 1;
    }

    const created = await prisma.operacionCodRep.create({
      data: {
        cod_rep_codigo: d.cod_rep_codigo,
        componente_codigo: d.componente_codigo,
        trabajo: d.trabajo,
        operacion_reparacion_codigo: d.operacion_reparacion_codigo ?? null,
        qty: d.qty,
        horas: d.horas ?? null,
        hh: d.hh ?? null,
        orden,
        activo: true,
      },
      include: {
        componente: { select: { codigo: true, nombre: true } },
        operacion_reparacion: { select: { codigo: true, nombre: true } },
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Componente, cod_rep o código de operación no existen." }, { status: 400 });
    }
    console.error("POST /api/operaciones-cod-rep error:", error);
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 });
  }
}

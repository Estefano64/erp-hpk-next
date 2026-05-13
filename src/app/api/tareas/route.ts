import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";

// GET /api/tareas — lista de items con paginación.
// Query: cod_rep_codigo, tipo, page, limit
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const codRep = searchParams.get("cod_rep_codigo")?.trim();
    const tipo = searchParams.get("tipo")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 200)));
    const where: Record<string, unknown> = {};
    if (codRep) where.cod_rep_codigo = codRep;
    if (tipo) where.tipo_codigo = tipo;

    const [data, total] = await Promise.all([
      prisma.tarea.findMany({
        where,
        include: {
          material: { select: { codigo: true, descripcion: true, fabricante_codigo: true, unidad_medida_codigo: true, precio: true, moneda_codigo: true } },
          tipo: { select: { codigo: true, nombre: true } },
          fabricante: { select: { codigo: true, nombre: true } },
        },
        orderBy: [{ cod_rep_codigo: "asc" }, { item_numero: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tarea.count({ where }),
    ]);
    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/tareas error:", error);
    return NextResponse.json({ error: "Error al obtener template" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  cod_rep_codigo: z.string().trim().min(1).optional().nullable(),
  estrategia_id: z.coerce.number().int().positive().optional().nullable(),
  actividad_codigo: z.string().trim().min(1),
  tipo_codigo: z.string().trim().min(1),
  material_codigo: z.string().trim().optional().nullable(),
  fabricante_codigo: z.string().trim().optional().nullable(),
  servicio_codigo: z.string().trim().optional().nullable(),
  np_cod1: z.string().trim().optional().nullable(),
  np_cod2: z.string().trim().optional().nullable(),
  id_tubo: z.string().trim().optional().nullable(),
  od_vas: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().min(1),
  ref_descripcion: z.string().trim().optional().nullable(),
  np: z.string().trim().optional().nullable(),
  texto: z.string().trim().optional().nullable(),
  requerimiento: z.coerce.number().min(0),
  precio: z.coerce.number().min(0).optional().nullable(),
  item_numero: z.coerce.number().int().min(0).optional(),
});

// POST /api/tareas — agregar item al template (admin)
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Solo administradores pueden modificar templates." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    if (!d.cod_rep_codigo && !d.estrategia_id) {
      return NextResponse.json({ error: "Se requiere cod_rep_codigo o estrategia_id." }, { status: 400 });
    }

    // Auto-numerar item_numero si no viene
    let item_numero = d.item_numero;
    if (item_numero == null) {
      const where: Record<string, unknown> = {};
      if (d.cod_rep_codigo) where.cod_rep_codigo = d.cod_rep_codigo;
      if (d.estrategia_id) where.estrategia_id = d.estrategia_id;
      const max = await prisma.tarea.aggregate({ where, _max: { item_numero: true } });
      item_numero = (max._max.item_numero ?? 0) + 1;
    }

    const created = await prisma.tarea.create({
      data: {
        cod_rep_codigo: d.cod_rep_codigo ?? null,
        estrategia_id: d.estrategia_id ?? null,
        actividad_codigo: d.actividad_codigo,
        tipo_codigo: d.tipo_codigo,
        material_codigo: d.material_codigo ?? null,
        fabricante_codigo: d.fabricante_codigo ?? null,
        servicio_codigo: d.servicio_codigo ?? null,
        np_cod1: d.np_cod1 ?? null,
        np_cod2: d.np_cod2 ?? null,
        id_tubo: d.id_tubo ?? null,
        od_vas: d.od_vas ?? null,
        descripcion: d.descripcion,
        ref_descripcion: d.ref_descripcion ?? null,
        np: d.np ?? null,
        texto: d.texto ?? null,
        requerimiento: d.requerimiento,
        precio: d.precio ?? null,
        item_numero,
      },
      include: { material: true, tipo: true, fabricante: true },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "Material, cod_rep o tipo no existen." }, { status: 400 });
    }
    console.error("POST /api/tareas error:", error);
    return NextResponse.json({ error: "Error al crear item del template" }, { status: 500 });
  }
}

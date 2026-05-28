import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// GET /api/planificacion — lista global con filtros + joins
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 100)));
    const search = searchParams.get("search")?.trim() ?? "";
    const semana = searchParams.get("semana")?.trim();
    const estado = searchParams.get("estado")?.trim();
    const tecnico = searchParams.get("tecnico")?.trim();
    const maquina = searchParams.get("maquina")?.trim();
    const otId = searchParams.get("ot_id");

    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    const where: Record<string, unknown> = {};
    if (semana) where.semana_plan = semana;
    if (estado) where.estado = estado;
    if (tecnico) where.tecnico = tecnico;
    if (maquina) where.maquina = maquina;
    if (otId) where.ot_id = Number(otId);
    // Filtro por OVERLAP: tareas cuyo intervalo [fecha_inicio, fecha_fin] toca el rango pedido.
    // Esto incluye tareas que arrancan antes de "desde" y siguen hasta "hasta", y vice versa.
    if (desde || hasta) {
      const conds: Record<string, unknown>[] = [];
      if (hasta) conds.push({ fecha_inicio: { lte: new Date(hasta) } });
      if (desde) conds.push({
        OR: [
          { fecha_fin: { gte: new Date(desde) } },
          { AND: [{ fecha_fin: null }, { fecha_inicio: { gte: new Date(desde) } }] },
        ],
      });
      if (conds.length) where.AND = conds;
    }
    if (search) {
      const otNum = /^\d+$/.test(search) ? Number(search) : null;
      where.OR = [
        { descripcion: { contains: search, mode: "insensitive" } },
        { operacion_codigo: { contains: search, mode: "insensitive" } },
        ...(otNum != null ? [{ orden_trabajo: { ot: otNum } }] : []),
      ];
    }

    const [data, total] = await Promise.all([
      prisma.planificacionOT.findMany({
        where,
        include: {
          orden_trabajo: {
            select: {
              id: true,
              ot: true,
              descripcion: true,
              fecha_recepcion: true,
              fecha_requerimiento_cliente: true,
              taller_status_codigo: true,
              taller_status: { select: { codigo: true, nombre: true } },
              prioridad_atencion: { select: { codigo: true, nombre: true } },
              cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
              codigo_reparacion: {
                select: {
                  codigo: true,
                  flota: { select: { codigo: true, nombre: true } },
                },
              },
            },
          },
        },
        orderBy: [{ ot_id: "desc" }, { orden: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.planificacionOT.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/planificacion error:", error);
    return NextResponse.json({ error: "Error al obtener planificación" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  ot_id: z.number().int().positive(),
  componente_codigo: z.string().trim().min(1),
  operacion_reparacion_codigo: z.string().trim().optional().nullable(),
  trabajo: z.string().trim().optional(),
  qty: z.coerce.number().int().min(1).default(1),
  tipo_reparacion: z.string().trim().optional().nullable(),
  maquina: z.string().trim().optional().nullable(),
  tecnico: z.string().trim().optional().nullable(),
  orden: z.coerce.number().int().min(0).optional(),
  horas_estimadas: z.coerce.number().min(0).optional().nullable(),
});

// POST /api/planificacion — crear una fila PlanificacionOT individual
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Si viene operacion_reparacion_codigo, leer su nombre para el campo trabajo
    let trabajo = d.trabajo;
    let operacionCodigo: string = "";
    if (d.operacion_reparacion_codigo) {
      const op = await prisma.operacionReparacion.findUnique({
        where: { codigo: d.operacion_reparacion_codigo },
      });
      if (!op) {
        return NextResponse.json({ error: `Operación ${d.operacion_reparacion_codigo} no existe` }, { status: 400 });
      }
      trabajo = trabajo ?? op.nombre;
      operacionCodigo = op.codigo;
    } else {
      operacionCodigo = (trabajo ?? "CUSTOM").slice(0, 20);
    }
    if (!trabajo) trabajo = "Tarea manual";

    // Si no especifican orden, usar el máximo + 1
    let orden = d.orden;
    if (orden == null) {
      const maxAgg = await prisma.planificacionOT.aggregate({
        where: { ot_id: d.ot_id },
        _max: { orden: true },
      });
      orden = (maxAgg._max.orden ?? 0) + 1;
    }

    const created = await prisma.planificacionOT.create({
      data: {
        ot_id: d.ot_id,
        componente: d.componente_codigo,
        operacion_codigo: operacionCodigo,
        descripcion: trabajo,
        tipo_reparacion: d.tipo_reparacion ?? null,
        orden,
        horas_estimadas: d.horas_estimadas ?? null,
        maquina: d.maquina ?? null,
        tecnico: d.tecnico ?? null,
        estado: "abierto",
      },
      include: {
        operacion_cod_rep: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/planificacion error:", error);
    return NextResponse.json({ error: "Error al crear tarea" }, { status: 500 });
  }
}

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
    // Acumulamos las condiciones que deben combinarse con AND (cada una puede
    // ser a su vez un OR). Así evitamos pisar `where.OR` entre filtros distintos.
    const and: Record<string, unknown>[] = [];

    // Una tarea puede tener varios operarios/equipos en un único string separado
    // por "|" (p.ej. "A | B" cuando qty_personal > 1). NO se usa coma como
    // separador porque los nombres de operario la contienen ("APELLIDO, NOMBRE").
    // El filtro reconoce el valor buscado como UN token completo dentro del
    // string, igual que splitRecursos en el front. Un valor simple (sin "|"),
    // como un nombre con coma, matchea por igualdad exacta.
    const tokenMatch = (field: "tecnico" | "maquina", val: string): Record<string, unknown> => {
      const ors: Record<string, unknown>[] = [{ [field]: val }];
      for (const sep of [" | ", "|"]) {
        ors.push({ [field]: { startsWith: `${val}${sep}` } });
        ors.push({ [field]: { endsWith: `${sep}${val}` } });
        ors.push({ [field]: { contains: `${sep}${val}${sep}` } });
      }
      return { OR: ors };
    };

    if (semana) where.semana_plan = semana;
    if (estado) where.estado = estado;
    if (tecnico) and.push(tokenMatch("tecnico", tecnico));
    if (maquina) and.push(tokenMatch("maquina", maquina));
    if (otId) where.ot_id = Number(otId);
    // Filtro por OVERLAP: tareas cuyo intervalo [fecha_inicio, fecha_fin] toca el rango pedido.
    // Esto incluye tareas que arrancan antes de "desde" y siguen hasta "hasta", y vice versa.
    if (hasta) and.push({ fecha_inicio: { lte: new Date(hasta) } });
    if (desde) and.push({
      OR: [
        { fecha_fin: { gte: new Date(desde) } },
        { AND: [{ fecha_fin: null }, { fecha_inicio: { gte: new Date(desde) } }] },
      ],
    });
    if (search) {
      const otNum = /^\d+$/.test(search) ? Number(search) : null;
      and.push({
        OR: [
          { descripcion: { contains: search, mode: "insensitive" } },
          { operacion_codigo: { contains: search, mode: "insensitive" } },
          ...(otNum != null ? [{ orden_trabajo: { ot: otNum } }] : []),
        ],
      });
    }
    if (and.length) where.AND = and;

    const [data, total] = await Promise.all([
      prisma.planificacionOT.findMany({
        where,
        include: {
          orden_trabajo: {
            select: {
              id: true,
              ot: true,
              np: true,
              descripcion: true,
              cod_rep_flota: true,
              fecha_recepcion: true,
              fecha_requerimiento_cliente: true,
              taller_status_codigo: true,
              taller_status: { select: { codigo: true, nombre: true } },
              prioridad_atencion: { select: { codigo: true, nombre: true, nivel: true } },
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
  // null = tarea de APOYO/general sin OT (se crea desde Planificación).
  ot_id: z.number().int().positive().nullable().optional(),
  componente_codigo: z.string().trim().optional(),
  operacion_reparacion_codigo: z.string().trim().optional().nullable(),
  trabajo: z.string().trim().optional(),
  qty: z.coerce.number().int().min(1).default(1),
  tipo_reparacion: z.string().trim().optional().nullable(),
  maquina: z.string().trim().optional().nullable(),
  tecnico: z.string().trim().optional().nullable(),
  orden: z.coerce.number().int().min(0).optional(),
  horas_estimadas: z.coerce.number().min(0).optional().nullable(),
  comentario: z.string().trim().optional().nullable(),
  // Semana de planificación (ej. "2026W23"). Opcional — desde el form de
  // Planificación se puede asignar al crear; si no, queda en el pool.
  semana_plan: z.string().trim().optional().nullable(),
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
        where: { ot_id: d.ot_id ?? null },
        _max: { orden: true },
      });
      orden = (maxAgg._max.orden ?? 0) + 1;
    }

    const created = await prisma.planificacionOT.create({
      data: {
        ot_id: d.ot_id ?? null,
        componente: d.componente_codigo || "General",
        operacion_codigo: operacionCodigo,
        descripcion: trabajo,
        tipo_reparacion: d.tipo_reparacion ?? null,
        orden,
        horas_estimadas: d.horas_estimadas ?? null,
        maquina: d.maquina ?? null,
        tecnico: d.tecnico ?? null,
        comentario: d.comentario ?? null,
        semana_plan: d.semana_plan ?? null,
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

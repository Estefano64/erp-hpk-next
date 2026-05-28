// GET /api/mi-trabajo/historico — TODAS las tareas (PlanificacionOT) del
// técnico autenticado, paginadas y con filtros. Alimenta la página "Mis Tareas".
//
// El técnico se identifica igual que en /api/mi-trabajo: por el nombre del
// trabajador enlazado a su usuario, comparado contra el campo `tecnico` de la
// tarea (que puede listar varios operarios separados por coma).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    const userId = Number((session.user as { id?: string }).id);

    const me = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { trabajador: { select: { nombre: true } } },
    });
    if (!me?.trabajador) {
      return NextResponse.json({ error: "Tu usuario no está enlazado a un trabajador" }, { status: 403 });
    }
    const tecnico = me.trabajador.nombre;

    const { searchParams } = req.nextUrl;
    const estado = searchParams.get("estado")?.trim();
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 50)));

    const and: Record<string, unknown>[] = [
      { tecnico: { contains: tecnico, mode: "insensitive" } },
    ];
    if (estado) and.push({ estado });
    if (search) {
      // `ot` es INTEGER (migración 2026-05-28): no se puede usar `contains`.
      // Si el término es numérico, lo matcheamos como nro de OT exacto.
      const or: Record<string, unknown>[] = [
        { descripcion: { contains: search, mode: "insensitive" } },
        { componente: { contains: search, mode: "insensitive" } },
        { operacion_codigo: { contains: search, mode: "insensitive" } },
      ];
      const otNum = Number(search);
      if (search.trim() !== "" && Number.isInteger(otNum)) {
        or.push({ orden_trabajo: { is: { ot: otNum } } });
      }
      and.push({ OR: or });
    }
    const where = { AND: and };

    const [data, total] = await Promise.all([
      prisma.planificacionOT.findMany({
        where,
        orderBy: [{ fecha_fin_real: { sort: "desc", nulls: "last" } }, { fecha_inicio: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, ot_id: true, componente: true, operacion_codigo: true, descripcion: true,
          horas_estimadas: true, horas_reales: true,
          fecha_inicio: true, fecha_fin: true, fecha_inicio_real: true, fecha_fin_real: true,
          estado: true, tecnico: true,
          status_tarea: { select: { codigo: true, nombre: true } },
          orden_trabajo: { select: { ot: true, descripcion: true } },
        },
      }),
      prisma.planificacionOT.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error) {
    console.error("GET /api/mi-trabajo/historico error:", error);
    return NextResponse.json({ error: "Error obteniendo tareas" }, { status: 500 });
  }
}

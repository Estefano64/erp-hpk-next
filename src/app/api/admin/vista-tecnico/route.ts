import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permisos";

// GET /api/admin/vista-tecnico?dni=XXXX[&page=1&limit=50&estado=...&search=...&fecha_desde=...&fecha_hasta=...]
// Vista de gerente: dado un DNI (o trabajadorId), devuelve la información que
// vería ese técnico en /mis-tareas — sin impersonar la sesión. La consulta es
// read-only; el admin no puede ejecutar acciones a nombre del técnico.
//
// El matching de tareas usa el mismo criterio que /api/mi-trabajo/historico:
// el campo `tecnico` de PlanificacionOT contiene nombres separados por coma y
// se compara case-insensitive con el nombre del trabajador.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!hasRole(session, "admin")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const dni = searchParams.get("dni")?.trim();
    const trabajadorIdRaw = searchParams.get("trabajadorId");
    if (!dni && !trabajadorIdRaw) {
      return NextResponse.json({ error: "Indicá un DNI o trabajadorId" }, { status: 400 });
    }

    const trabajador = trabajadorIdRaw
      ? await prisma.trabajador.findUnique({
        where: { trabajador_id: Number(trabajadorIdRaw) },
        select: {
          trabajador_id: true, nombre: true, dni: true, area: true,
          puesto: true, activo: true,
          equipo: { select: { codigo: true, descripcion: true } },
        },
      })
      : await prisma.trabajador.findFirst({
        where: { dni },
        select: {
          trabajador_id: true, nombre: true, dni: true, area: true,
          puesto: true, activo: true,
          equipo: { select: { codigo: true, descripcion: true } },
        },
      });

    if (!trabajador) {
      return NextResponse.json(
        { error: dni ? `No hay trabajador con DNI ${dni}` : "Trabajador no encontrado" },
        { status: 404 },
      );
    }

    // Cuenta de usuario asociada (puede no existir).
    const usuario = await prisma.usuario.findFirst({
      where: { trabajadorId: trabajador.trabajador_id },
      select: {
        id: true, codigoEmpleado: true, email: true, roles: true, activo: true,
      },
    });

    // Filtros para el listado de tareas.
    const estado = searchParams.get("estado")?.trim();
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 50)));

    const and: Record<string, unknown>[] = [
      { tecnico: { contains: trabajador.nombre, mode: "insensitive" } },
    ];
    if (estado) and.push({ estado });
    const fDesde = searchParams.get("fecha_desde");
    const fHasta = searchParams.get("fecha_hasta");
    if (fDesde || fHasta) {
      const rango: Record<string, Date> = {};
      if (fDesde) rango.gte = new Date(fDesde);
      if (fHasta) rango.lte = new Date(fHasta);
      and.push({ fecha_inicio: rango });
    }
    if (search) {
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

    const [tareas, total, agregadoEstados] = await Promise.all([
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
      // Agregado por estado SOBRE TODAS las tareas del trabajador (sin paginar
      // ni aplicar el filtro de estado/búsqueda) — para mostrar un breakdown
      // estable arriba del listado.
      prisma.planificacionOT.groupBy({
        by: ["estado"],
        where: { tecnico: { contains: trabajador.nombre, mode: "insensitive" } },
        _count: { _all: true },
        _sum: { horas_estimadas: true, horas_reales: true },
      }),
    ]);

    type Bucket = { estado: string | null; count: number; horas_est: number; horas_real: number };
    const breakdown: Bucket[] = agregadoEstados.map((g) => ({
      estado: g.estado,
      count: g._count._all,
      horas_est: Number(g._sum.horas_estimadas ?? 0),
      horas_real: Number(g._sum.horas_reales ?? 0),
    }));
    const totalTareas = breakdown.reduce((a, b) => a + b.count, 0);
    const totalHorasReales = Math.round(breakdown.reduce((a, b) => a + b.horas_real, 0) * 10) / 10;
    const totalHorasEstimadas = Math.round(breakdown.reduce((a, b) => a + b.horas_est, 0) * 10) / 10;
    const realizadas = breakdown.find((b) => b.estado === "realizado")?.count ?? 0;

    return NextResponse.json({
      trabajador,
      usuario,
      tareas,
      total,
      page,
      limit,
      resumen: {
        totalTareas,
        realizadas,
        totalHorasReales,
        totalHorasEstimadas,
        breakdown,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/vista-tecnico error:", error);
    return NextResponse.json({ error: "Error obteniendo vista" }, { status: 500 });
  }
}

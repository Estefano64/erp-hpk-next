// GET /api/ordenes-trabajo-internas/por-semana?desde=YYYY-Www&hasta=YYYY-Www
//
// Devuelve las OT internas agrupadas por `semana_revision` (formato ISO
// YYYY-Www). Si vienen `desde` y `hasta`, filtra entre esas semanas
// inclusive. Si no, devuelve todas las que tengan semana asignada.
//
// Pensado para la vista "Programación semanal internas" — espejo del
// calendario semanal de OT externas pero usando el campo semana_revision
// que ya existe en OrdenTrabajoInterna (sin tocar PlanificacionOT).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");

    const where: Record<string, unknown> = { activo: true };
    // Si no se pasan filtros, solo las que tengan semana cargada para evitar
    // llenar la vista con OTs sin programar.
    if (desde && hasta) {
      where.semana_revision = { gte: desde, lte: hasta };
    } else if (desde) {
      where.semana_revision = desde;
    } else {
      where.semana_revision = { not: null };
    }

    const rows = await prisma.ordenTrabajoInterna.findMany({
      where,
      select: {
        id: true,
        ot: true,
        anio: true,
        descripcion: true,
        semana_revision: true,
        prioridad_atencion_codigo: true,
        ot_status_codigo: true,
        recursos_status_codigo: true,
        aprobacion_status_codigo: true,
        asignado_a: true,
        area_taller: true,
        fecha_inicio_plan: true,
        fecha_fin_plan: true,
        fecha_cierre: true,
        equipo: { select: { codigo: true, descripcion: true } },
        estrategia: { select: { codigo: true, descripcion: true } },
        tipo_ot_interna: { select: { codigo: true, nombre: true } },
        ot_status: { select: { codigo: true, nombre: true } },
        prioridad_atencion: { select: { codigo: true, nombre: true } },
      },
      orderBy: [{ semana_revision: "asc" }, { prioridad_atencion_codigo: "asc" }, { id: "asc" }],
    });

    // Agrupa por semana_revision. Devolvemos también `sin_semana` aparte si
    // hay OTs sin asignar (solo cuando se piden todas, no en rangos).
    const porSemana = new Map<string, typeof rows>();
    for (const r of rows) {
      const sem = r.semana_revision ?? "(sin semana)";
      const arr = porSemana.get(sem) ?? [];
      arr.push(r);
      porSemana.set(sem, arr);
    }

    const data = Array.from(porSemana.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semana, items]) => ({ semana, count: items.length, items }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo-internas/por-semana error:", error);
    return NextResponse.json({ error: "Error al cargar semanas" }, { status: 500 });
  }
}

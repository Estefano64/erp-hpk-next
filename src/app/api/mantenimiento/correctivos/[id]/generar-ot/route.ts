import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { nextNumeroOTInterna } from "@/lib/ot-numero";

import { parseInt4Safe } from "@/lib/ot-formato";
// POST — desde un reporte correctivo, genera la OT interna correctiva y la
// vincula. Sólo permitido si el reporte está en REPORTADO (no tiene OT aún).
//
// Body opcional:
//   - area_taller          (código jerárquico ej "1.3.4")
//   - prioridad_atencion_codigo
//   - asignado_a           (operario)
//   - descripcion          (override; default: detalle_falla del reporte)
//   - planta_codigo
//   - fecha_inicio_plan / fecha_fin_plan
//   - comentarios
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id) ?? 0;
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const reporte = await prisma.reporteCorrectivo.findUnique({
      where: { id: idNum },
      select: {
        id: true,
        activo: true,
        estado: true,
        equipo_codigo: true,
        detalle_falla: true,
        orden_trabajo_interna_id: true,
      },
    });
    if (!reporte) {
      return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
    }
    if (!reporte.activo) {
      return NextResponse.json({ error: "Reporte anulado" }, { status: 409 });
    }
    if (reporte.orden_trabajo_interna_id) {
      return NextResponse.json(
        { error: "Este reporte ya tiene una OT interna asociada" },
        { status: 409 },
      );
    }

    // Resolver el código del tipo de OT interna "Correctiva". Buscamos por
    // nombre para no depender de un código fijo (cada deploy puede tener
    // un código distinto). Si no existe, devolvemos error claro.
    // El tipo "correctivo" se renombró a "No estratégica" en el catálogo.
    // Buscamos primero por el código actual (NO_ESTRATEGICA), después por los
    // viejos (CORRECTIVA / CORR) por compat con deploys que no migraron.
    const tipoCorrectiva = await prisma.tipoOTInterna.findFirst({
      where: {
        activo: true,
        OR: [
          { codigo: { equals: "NO_ESTRATEGICA", mode: "insensitive" } },
          { codigo: { equals: "CORRECTIVA", mode: "insensitive" } },
          { codigo: { equals: "CORR", mode: "insensitive" } },
          { nombre: { contains: "no estrat", mode: "insensitive" } },
          { nombre: { contains: "correctiv", mode: "insensitive" } },
        ],
      },
      select: { codigo: true },
    });
    if (!tipoCorrectiva) {
      return NextResponse.json(
        { error: "No se encontró el tipo de OT interna 'No estratégica' (antes 'Correctiva') en el catálogo" },
        { status: 500 },
      );
    }

    const descripcionOt: string =
      (body.descripcion && String(body.descripcion).trim()) ||
      reporte.detalle_falla?.trim() ||
      "Mantenimiento correctivo";

    // Generamos OT interna + vinculamos en la misma transacción.
    const result = await prisma.$transaction(async (tx) => {
      const ot = await nextNumeroOTInterna(tx);
      const otInterna = await tx.ordenTrabajoInterna.create({
        data: {
          ot,
          anio: ot % 100,
          tipo_ot_interna_codigo: tipoCorrectiva.codigo,
          equipo_codigo: reporte.equipo_codigo,
          descripcion: descripcionOt,
          planta_codigo: body.planta_codigo || null,
          area_taller: body.area_taller || null,
          prioridad_atencion_codigo: body.prioridad_atencion_codigo || null,
          asignado_a: body.asignado_a || null,
          fecha_inicio_plan: body.fecha_inicio_plan ? new Date(body.fecha_inicio_plan) : null,
          fecha_fin_plan: body.fecha_fin_plan ? new Date(body.fecha_fin_plan) : null,
          comentarios: body.comentarios || null,
          user_status_codigo: "PLANIFICADO",
          ot_status_codigo: "Abierta",
          recursos_status_codigo: "En revision procesos",
          usuario_crea: usuario,
        },
        select: {
          id: true,
          ot: true,
          ot_status: { select: { nombre: true } },
        },
      });

      const reporteActualizado = await tx.reporteCorrectivo.update({
        where: { id: idNum },
        data: {
          orden_trabajo_interna_id: otInterna.id,
          estado: "EN_PROCESO",
          usuario_actualiza: usuario,
        },
        include: {
          equipo: { select: { codigo: true, descripcion: true } },
          area: { select: { codigo: true, nombre: true } },
          ot_interna: { select: { id: true, ot: true, ot_status: { select: { nombre: true } } } },
        },
      });

      return { reporte: reporteActualizado, ot: otInterna };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

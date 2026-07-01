// GET /api/ordenes-trabajo-internas/[id]/reporte-correctivo/pdf
//
// Descarga el PDF en formato HPK-M-F-07 (Reporte de Mantenimiento Correctivo)
// a partir de una OT interna. Si la OT tiene un ReporteCorrectivo vinculado
// (relación reporte_correctivo.orden_trabajo_interna_id = OT.id), se prefiere
// esa fuente de datos porque contiene la información específica del reporte.
// Si no hay ReporteCorrectivo, se cae a los datos generales de la OT.
//
// Los adjuntos se listan solo POR NOMBRE (sin descargar) dentro del PDF, en
// un bloque titulado "Adjuntos".

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReporteCorrectivoPDF, fmtFechaPDF } from "@/lib/pdf/reporte-correctivo";
import { formatReporteCorrectivoCodigo, parseInt4Safe, formatOtInternaCodigo } from "@/lib/ot-formato";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      include: {
        equipo: { select: { codigo: true, descripcion: true, area_codigo: true, area: { select: { nombre: true } } } },
        planta: { select: { codigo: true, nombre: true } },
        adjuntos: {
          select: { nombre_archivo: true, etapa_codigo: true },
          orderBy: { fecha_subida: "asc" },
        },
      },
    });
    if (!ot) {
      return NextResponse.json({ error: "OT interna no encontrada" }, { status: 404 });
    }

    // Buscar ReporteCorrectivo vinculado (si existe). Preferimos esa fuente.
    const reporte = await prisma.reporteCorrectivo.findFirst({
      where: { orden_trabajo_interna_id: otId, activo: true },
      include: {
        area: { select: { codigo: true, nombre: true } },
        equipo: { select: { codigo: true, descripcion: true } },
      },
      orderBy: { id: "desc" },
    });

    // Datos preferidos: reporte, con fallback a la OT.
    const areaNombre = reporte?.area?.nombre
      ?? ot.equipo?.area?.nombre
      ?? ot.area_taller
      ?? null;
    const equipoNombre = reporte?.equipo?.descripcion ?? ot.equipo?.descripcion ?? null;
    const equipoCodigo = reporte?.equipo?.codigo ?? ot.equipo?.codigo ?? ot.equipo_codigo ?? null;

    // Fecha del reporte: la del ReporteCorrectivo o la fecha de creación de la OT.
    const fechaBase = reporte?.fecha ?? ot.fecha_creacion ?? null;

    const detalleFalla = reporte?.detalle_falla ?? null;
    // Si no hay reporte, la descripción de la OT vive en el bloque de
    // Descripción del Correctivo (es lo que el técnico tipeó al abrir la OT).
    const descripcionCorr = reporte?.descripcion_correctivo ?? ot.descripcion ?? null;

    const realizadoPor = reporte?.realizado_por ?? ot.asignado_a ?? ot.usuario_crea ?? null;
    const fechaRealizado = reporte?.fecha_correctivo ?? ot.fecha_fin_real ?? null;

    // OT interna no guarda "responsable_area" propio → cae al aprobador de la
    // OT si existe; si no, queda vacío para firmar a mano.
    const responsableArea = reporte?.responsable_area ?? ot.usuario_aprueba ?? null;
    const fechaResponsable = reporte?.fecha_correctivo ?? ot.fecha_cierre ?? ot.fecha_aprobacion ?? null;

    const pdf = await buildReporteCorrectivoPDF({
      reporte_numero: reporte
        ? formatReporteCorrectivoCodigo(reporte.numero, reporte.anio)
        : `OT Interna ${formatOtInternaCodigo(Number(ot.ot))}`,
      area_nombre: areaNombre,
      equipo_nombre: equipoNombre,
      equipo_codigo: equipoCodigo,
      fecha: fmtFechaPDF(fechaBase),
      detalle_falla: detalleFalla,
      descripcion_correctivo: descripcionCorr,
      realizado_por: realizadoPor,
      fecha_realizado: fmtFechaPDF(fechaRealizado),
      responsable_area: responsableArea,
      fecha_responsable: fmtFechaPDF(fechaResponsable),
      adjuntos: ot.adjuntos,
    });

    const filename = `Reporte-Correctivo-${formatOtInternaCodigo(Number(ot.ot)).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

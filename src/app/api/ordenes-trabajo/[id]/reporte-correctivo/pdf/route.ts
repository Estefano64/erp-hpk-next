// GET /api/ordenes-trabajo/[id]/reporte-correctivo/pdf
//
// Descarga el PDF en formato HPK-M-F-07 a partir de una OT externa. Las OTs
// externas NO tienen un ReporteCorrectivo asociado (esa tabla apunta solo a
// OT internas), por lo que el PDF se genera 100% con datos de la OT:
//   - Área    → planta.nombre / area_taller / equipo.area.nombre
//   - Equipo  → equipo (código + descripción)
//   - Fecha   → fecha_recepcion / fecha_creacion
//   - Detalle → observaciones o descripcion
//   - Descripción del correctivo → descripcion
//   - Realizado por → usuario_crea
//   - Fecha realizado → fecha_facturacion / fecha_entrega
//   - Responsable de Área → usuario_actualiza
//
// Los adjuntos se listan solo POR NOMBRE dentro del PDF.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReporteCorrectivoPDF, fmtFechaPDF } from "@/lib/pdf/reporte-correctivo";
import { parseInt4Safe, formatOtCodigo } from "@/lib/ot-formato";

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

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      include: {
        cliente: { select: { razon_social: true, nombre_comercial: true } },
        codigo_reparacion: { select: { codigo: true, descripcion: true } },
        material: { select: { codigo: true, descripcion: true } },
        adjuntos: {
          select: { nombre_archivo: true, etapa_codigo: true },
          orderBy: { fecha_subida: "asc" },
        },
      },
    });
    if (!ot) {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    }

    // OT externa no tiene equipo del taller — tiene el reparable del cliente.
    // "Área" = cliente (es facturable); "Nombre equipo" y "Código" salen del
    // código de reparación o del material vinculado.
    const clienteNombre = ot.cliente?.nombre_comercial ?? ot.cliente?.razon_social ?? null;
    const equipoNombre = ot.codigo_reparacion?.descripcion ?? ot.material?.descripcion ?? null;
    const equipoCodigo = ot.codigo_reparacion?.codigo ?? ot.material?.codigo ?? ot.equipo_codigo ?? null;

    const pdf = await buildReporteCorrectivoPDF({
      reporte_numero: `OT ${formatOtCodigo(Number(ot.ot), ot.tipo_codigo)}`,
      area_nombre: clienteNombre,
      equipo_nombre: equipoNombre,
      equipo_codigo: equipoCodigo,
      fecha: fmtFechaPDF(ot.fecha_recepcion ?? ot.fecha_creacion),
      // Para OTs externas no hay un "detalle de falla" separado — usamos
      // comentarios si existe; si no, dejamos vacío para llenar a mano.
      detalle_falla: ot.comentarios ?? null,
      descripcion_correctivo: ot.descripcion ?? null,
      realizado_por: ot.usuario_crea ?? null,
      fecha_realizado: fmtFechaPDF(ot.fecha_facturacion ?? ot.fecha_entrega),
      responsable_area: ot.usuario_actualiza ?? null,
      fecha_responsable: fmtFechaPDF(ot.fecha_actualizacion),
      adjuntos: ot.adjuntos,
    });

    const filename = `Reporte-Correctivo-${formatOtCodigo(Number(ot.ot), ot.tipo_codigo).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
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

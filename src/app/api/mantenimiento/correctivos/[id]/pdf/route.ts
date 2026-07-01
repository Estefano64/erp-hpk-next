import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReporteCorrectivoPDF, fmtFechaPDF } from "@/lib/pdf/reporte-correctivo";
import { formatReporteCorrectivoCodigo, parseInt4Safe } from "@/lib/ot-formato";

// pdfkit requiere APIs de Node (Buffer, fs, etc.) — fuerza el runtime Node.
export const runtime = "nodejs";

// GET — devuelve el reporte como PDF según formato HPK-M-F-07.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id) ?? 0;
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    const rep = await prisma.reporteCorrectivo.findUnique({
      where: { id: idNum },
      include: {
        equipo: { select: { codigo: true, descripcion: true } },
        area: { select: { codigo: true, nombre: true } },
      },
    });
    if (!rep) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const pdf = await buildReporteCorrectivoPDF({
      reporte_numero: formatReporteCorrectivoCodigo(rep.numero, rep.anio),
      area_nombre: rep.area?.nombre ?? null,
      equipo_nombre: rep.equipo?.descripcion ?? null,
      equipo_codigo: rep.equipo?.codigo ?? null,
      fecha: fmtFechaPDF(rep.fecha),
      detalle_falla: rep.detalle_falla,
      descripcion_correctivo: rep.descripcion_correctivo,
      realizado_por: rep.realizado_por,
      fecha_realizado: fmtFechaPDF(rep.fecha_correctivo),
      responsable_area: rep.responsable_area,
      fecha_responsable: fmtFechaPDF(rep.fecha_correctivo ?? rep.fecha),
    });

    const filename = `Correctivo-${formatReporteCorrectivoCodigo(rep.numero, rep.anio).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPdfBuffer,
  drawHPKHeader,
  drawLabelValueRow,
  drawTextBlock,
} from "@/lib/pdf/hpk-header";
import { formatReporteCorrectivoCodigo } from "@/lib/ot-formato";

// pdfkit requiere APIs de Node (Buffer, fs, etc.) — fuerza el runtime Node.
export const runtime = "nodejs";

// GET — devuelve el reporte como PDF según formato HPK-M-F-07.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
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

    const fmtFecha = (d: Date | null | undefined) =>
      d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

    const pdf = await buildPdfBuffer((doc) => {
      const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      drawHPKHeader(doc, {
        titulo: "REPORTE DE MANTENIMIENTO CORRECTIVO",
        codigoFormato: "HPK-M-F-07",
        version: "01",
        revision: "01",
        fechaAprobacion: "21/02/2019",
      });

      // Número del reporte
      drawLabelValueRow(
        doc,
        "Reporte N°:",
        formatReporteCorrectivoCodigo(rep.numero, rep.anio),
        totalW,
      );

      // Cabecera de campos (Área / Nombre equipo / Código / Fecha)
      drawLabelValueRow(doc, "Área:", rep.area?.nombre ?? "", totalW);
      drawLabelValueRow(doc, "Nombre equipo:", rep.equipo?.descripcion ?? "", totalW);
      drawLabelValueRow(doc, "Código:", rep.equipo?.codigo ?? "", totalW);
      drawLabelValueRow(doc, "Fecha:", fmtFecha(rep.fecha), totalW);

      doc.y += 6;

      // Detalle de Falla (bloque grande)
      drawTextBlock(doc, "Detalle de Falla", rep.detalle_falla, totalW, 140);

      doc.y += 6;

      // Descripción del correctivo (bloque grande)
      drawTextBlock(doc, "Descripción de Mantenimiento Correctivo", rep.descripcion_correctivo, totalW, 200);

      doc.y += 16;

      // Firmas — 2 columnas con NOMBRE / FECHA / FIRMA
      const x = doc.page.margins.left;
      const yFirma = doc.y;
      const colW = totalW / 2 - 8;

      const drawFirmaCol = (left: number, titulo: string, nombre: string, fecha: string) => {
        const h = 100;
        doc.lineWidth(0.6).strokeColor("#000").rect(left, yFirma, colW, h).stroke();
        doc.font("Helvetica-Bold").fontSize(9)
          .text(titulo, left, yFirma + 4, { width: colW, align: "center" });

        const rowH = (h - 16) / 3;
        for (let i = 0; i < 3; i++) {
          const yy = yFirma + 16 + i * rowH;
          doc.moveTo(left, yy).lineTo(left + colW, yy).strokeColor("#000").lineWidth(0.3).stroke();
        }
        const labels = ["NOMBRE", "FECHA", "FIRMA"];
        const values = [nombre, fecha, ""];
        for (let i = 0; i < 3; i++) {
          const yy = yFirma + 16 + i * rowH;
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#000")
            .text(labels[i], left + 4, yy + 4, { width: 60 });
          doc.font("Helvetica").fontSize(8)
            .text(values[i] || "", left + 70, yy + 4, { width: colW - 76 });
        }
      };

      drawFirmaCol(x, "Realizado Por", rep.realizado_por ?? "", fmtFecha(rep.fecha_correctivo));
      drawFirmaCol(x + colW + 16, "Responsable de Área", rep.responsable_area ?? "", fmtFecha(rep.fecha_correctivo ?? rep.fecha));
      doc.y = yFirma + 100;
    });

    const filename = `Correctivo-${formatReporteCorrectivoCodigo(rep.numero, rep.anio).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
    // Convertir Buffer → Uint8Array para que satisfaga BodyInit en Next 16.
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

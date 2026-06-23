import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildPdfBuffer,
  drawHPKHeader,
  drawLabelValueRow,
} from "@/lib/pdf/hpk-header";
import {  formatOtInternaCodigo, parseInt4Safe } from "@/lib/ot-formato";

// pdfkit requiere APIs de Node (Buffer, fs, etc.) — fuerza el runtime Node.
export const runtime = "nodejs";

// GET — devuelve la Ficha Técnica del equipo como PDF.
// El parámetro [id] acepta tanto el `equipo_id` numérico como el `codigo` del
// equipo, para facilitar el linkeo desde distintas vistas. Solo aplicable a
// equipos tipo MAQ (Máquina) o HER (Herramienta).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;

    const equipo = await prisma.equipo.findFirst({
      where: {
        OR: [
          // numérico (equipo_id) — soporta llegar desde el ID interno
          ...(/^\d+$/.test(id) ? [{ equipo_id: (parseInt4Safe(id) ?? 0) }] : []),
          { codigo: id },
        ],
      },
      include: {
        fabricante: { select: { nombre: true } },
        tipo: { select: { codigo: true, nombre: true } },
        area: { select: { nombre: true } },
        ordenes_trabajo_internas: {
          where: { activo: true },
          orderBy: { id: "desc" },
          take: 20,
          select: {
            id: true,
            ot: true,
            fecha_inicio_plan: true,
            fecha_fin_real: true,
            descripcion: true,
            asignado_a: true,
            tipo_ot_interna_codigo: true,
            tipo_ot_interna: { select: { nombre: true } },
            ot_status: { select: { nombre: true } },
          },
        },
      },
    });
    if (!equipo) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }
    // Restringimos a tipos MAQ y HER por requerimiento de negocio.
    if (equipo.tipo_codigo !== "MAQ" && equipo.tipo_codigo !== "HER") {
      return NextResponse.json(
        { error: "La ficha técnica solo aplica a Máquinas y Herramientas" },
        { status: 400 },
      );
    }

    const fmtFecha = (d: Date | null | undefined) =>
      d ? new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

    // Mapeo del tipo de OT interna a la letra del formato:
    //   C = Correctiva, P = Preventiva, Ca = Calibración, V = Verificación, I = Inspección
    const letraTipoMantenimiento = (codigo: string | null, nombre: string | null): string => {
      const k = (codigo || nombre || "").toLowerCase();
      if (k.includes("correctiv")) return "C";
      if (k.includes("preventiv")) return "P";
      if (k.includes("calibrac")) return "Ca";
      if (k.includes("verificac")) return "V";
      if (k.includes("inspec")) return "I";
      return "—";
    };

    const pdf = await buildPdfBuffer((doc) => {
      const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      drawHPKHeader(doc, {
        titulo: "FICHA TÉCNICA DE MANTENIMIENTO",
        codigoFormato: "HPK-M-F-02",
        version: "01",
        revision: "01",
        fechaAprobacion: "21/02/2019",
      });

      // Datos del equipo
      drawLabelValueRow(doc, "Código:", equipo.codigo, totalW);
      drawLabelValueRow(doc, "Descripción:", equipo.descripcion, totalW);
      drawLabelValueRow(doc, "Marca:", equipo.fabricante?.nombre ?? "", totalW);
      drawLabelValueRow(doc, "Modelo:", equipo.modelo ?? "", totalW);
      drawLabelValueRow(doc, "Tipo:", equipo.tipo?.nombre ?? "", totalW);
      drawLabelValueRow(doc, "N° Serie:", equipo.numero_serie ?? "", totalW);
      drawLabelValueRow(doc, "Área:", equipo.area?.nombre ?? "", totalW);
      drawLabelValueRow(doc, "Observaciones:", equipo.observaciones ?? "", totalW, 110, 36);

      doc.y += 10;

      // Encabezado de la sección "REGISTRO DE MANTENIMIENTOS Y REPARACIONES"
      const headerH = 22;
      const x = doc.page.margins.left;
      doc.fillColor("#1C2B5B").rect(x, doc.y, totalW, headerH).fill();
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10)
        .text("REGISTRO DE MANTENIMIENTOS Y REPARACIONES", x, doc.y + 6, {
          width: totalW,
          align: "center",
        });
      doc.fillColor("#000");
      doc.y += headerH;

      // Tabla
      const cols = [
        { key: "n", title: "N°", w: 30 },
        { key: "fPlan", title: "Fecha Programada", w: 90 },
        { key: "fReal", title: "Fecha Ejecutada", w: 90 },
        { key: "tipo", title: "Tipo", w: 50 },
        { key: "resp", title: "Responsable", w: 130 },
        { key: "obs", title: "Observaciones", w: totalW - 30 - 90 - 90 - 50 - 130 },
      ];
      const rowH = 22;
      // Encabezado tabla
      let cx = x;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      doc.lineWidth(0.6).strokeColor("#000");
      doc.rect(x, doc.y, totalW, rowH).stroke();
      for (const c of cols) {
        doc.rect(cx, doc.y, c.w, rowH).stroke();
        doc.text(c.title, cx + 4, doc.y + 6, { width: c.w - 8, align: "center" });
        cx += c.w;
      }
      doc.y += rowH;

      // Filas — 20 (HPK estándar). Llenamos con datos reales y el resto en blanco.
      const filas = 20;
      const oti = equipo.ordenes_trabajo_internas;
      doc.font("Helvetica").fontSize(8);
      for (let i = 0; i < filas; i++) {
        const ot = oti[i];
        cx = x;
        const yy = doc.y;
        doc.rect(x, yy, totalW, rowH).stroke();
        const cells: string[] = [
          String(i + 1),
          ot ? fmtFecha(ot.fecha_inicio_plan) : "",
          ot ? fmtFecha(ot.fecha_fin_real) : "",
          ot ? letraTipoMantenimiento(ot.tipo_ot_interna_codigo, ot.tipo_ot_interna?.nombre ?? null) : "",
          ot ? (ot.asignado_a ?? "") : "",
          ot ? `${formatOtInternaCodigo(ot.ot)} · ${ot.descripcion ?? ""}`.slice(0, 110) : "",
        ];
        for (let j = 0; j < cols.length; j++) {
          const c = cols[j];
          doc.rect(cx, yy, c.w, rowH).stroke();
          doc.text(cells[j], cx + 3, yy + 6, {
            width: c.w - 6,
            align: j === 0 || j === 3 ? "center" : "left",
            ellipsis: true,
          });
          cx += c.w;
        }
        doc.y += rowH;

        // Si la página se llena, agregar una nueva con encabezado simple.
        if (doc.y > doc.page.height - doc.page.margins.bottom - 50 && i < filas - 1) {
          doc.addPage();
        }
      }

      doc.y += 8;
      doc.font("Helvetica").fontSize(8).fillColor("#000")
        .text(
          "Tipo de Mantenimiento: C: Correctivo / P: Preventivo / Ca: Calibración / V: Verificación / I: Inspección",
          x,
          doc.y,
          { width: totalW },
        );
    });

    const filename = `FichaTecnica-${equipo.codigo}.pdf`;
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

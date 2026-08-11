import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { esEncargadoSsoma, parseFotoInput, esKeySsoma } from "@/lib/ssoma-server";
import { R2Keys } from "@/lib/r2";

// POST — cierre del reporte de seguridad (APROBADO → CERRADO).
// El cierre EXIGE foto de evidencia + comentario (formato HPK-S-F-03).
// Body: { comentario, foto: { key, nombre_archivo, tipo_mime, tamano } }
// La foto se sube antes vía /api/ssoma/reportes-seguridad/upload-url.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const idNum = parseInt4Safe(id);
    if (idNum == null) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }
    if (!(await esEncargadoSsoma(req))) {
      return NextResponse.json({ error: "Solo el encargado de seguridad puede cerrar" }, { status: 403 });
    }
    const body = await req.json();
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const comentario = typeof body.comentario === "string" ? body.comentario.trim() : "";
    if (!comentario) {
      return NextResponse.json({ error: "El comentario de cierre es obligatorio" }, { status: 400 });
    }
    const foto = parseFotoInput(body.foto);
    if (!foto || !esKeySsoma(foto.key, R2Keys.ssomaReporteSeguridad())) {
      return NextResponse.json({ error: "La foto de cierre es obligatoria" }, { status: 400 });
    }

    const actual = await prisma.reporteSeguridad.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!actual.activo) return NextResponse.json({ error: "Reporte anulado" }, { status: 409 });
    if (actual.estado !== "APROBADO") {
      return NextResponse.json(
        { error: "El reporte debe estar aprobado antes de cerrarse" },
        { status: 409 },
      );
    }

    const updated = await prisma.reporteSeguridad.update({
      where: { id: idNum },
      data: {
        estado: "CERRADO",
        cerrado_por: usuario,
        fecha_cierre: new Date(),
        comentario_cierre: comentario,
        cierre_foto_key: foto.key,
        cierre_foto_nombre: foto.nombre_archivo,
        cierre_foto_mime: foto.tipo_mime,
        cierre_foto_tamano: foto.tamano,
        usuario_actualiza: usuario,
      },
      include: {
        acciones: { orderBy: { orden: "asc" } },
        fotos: { orderBy: { id: "asc" } },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

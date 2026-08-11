import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { parseFotoInput, esKeySsoma } from "@/lib/ssoma-server";
import { R2Keys } from "@/lib/r2";

// POST — cierre de la salida no conforme (ABIERTO → CERRADO).
// A diferencia del reporte de seguridad, acá la foto y el comentario de
// cierre son OPCIONALES (formato HPK-SIG-F-05: se cierra con observaciones).
// Body: { observaciones?, comentario?, foto?: { key, nombre_archivo, tipo_mime, tamano } }
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
    const body = await req.json().catch(() => ({}));
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const actual = await prisma.salidaNoConforme.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!actual.activo) return NextResponse.json({ error: "Registro anulado" }, { status: 409 });
    if (actual.estado !== "ABIERTO") {
      return NextResponse.json({ error: "La salida no conforme ya está cerrada" }, { status: 409 });
    }

    const foto = body.foto ? parseFotoInput(body.foto) : null;
    if (body.foto && (!foto || !esKeySsoma(foto.key, R2Keys.ssomaSalidaNoConforme()))) {
      return NextResponse.json({ error: "Foto de cierre inválida" }, { status: 400 });
    }

    const updated = await prisma.salidaNoConforme.update({
      where: { id: idNum },
      data: {
        estado: "CERRADO",
        cerrado_por: usuario,
        fecha_cierre: new Date(),
        comentario_cierre: body.comentario?.trim() || null,
        ...(body.observaciones !== undefined
          ? { observaciones: body.observaciones?.trim() || null }
          : {}),
        ...(foto
          ? {
              cierre_foto_key: foto.key,
              cierre_foto_nombre: foto.nombre_archivo,
              cierre_foto_mime: foto.tipo_mime,
              cierre_foto_tamano: foto.tamano,
            }
          : {}),
        usuario_actualiza: usuario,
      },
      include: {
        fotos: { orderBy: { id: "asc" } },
        sacs: { select: { id: true, numero: true, anio: true, estado: true, activo: true } },
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

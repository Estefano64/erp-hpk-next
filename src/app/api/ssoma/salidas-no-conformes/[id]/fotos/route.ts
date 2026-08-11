import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseInt4Safe } from "@/lib/ot-formato";
import { parseFotoInput, esKeySsoma } from "@/lib/ssoma-server";
import { R2Keys } from "@/lib/r2";

// POST — registra en BD una foto ya subida a R2 (vía upload-url).
// Body: { key, nombre_archivo, tipo_mime, tamano }
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
    const body = await req.json();
    const foto = parseFotoInput(body);
    if (!foto || !esKeySsoma(foto.key, R2Keys.ssomaSalidaNoConforme())) {
      return NextResponse.json({ error: "Foto inválida" }, { status: 400 });
    }

    const snc = await prisma.salidaNoConforme.findUnique({
      where: { id: idNum },
      select: { id: true, activo: true, estado: true },
    });
    if (!snc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!snc.activo) return NextResponse.json({ error: "Registro anulado" }, { status: 409 });
    if (snc.estado === "CERRADO") {
      return NextResponse.json({ error: "La salida no conforme ya está cerrada" }, { status: 409 });
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";
    const creada = await prisma.salidaNoConformeFoto.create({
      data: {
        salida_no_conforme_id: idNum,
        nombre_archivo: foto.nombre_archivo,
        r2_key: foto.key,
        tipo_mime: foto.tipo_mime,
        tamano: foto.tamano,
        usuario_sube: usuario,
      },
    });
    return NextResponse.json({ data: creada }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

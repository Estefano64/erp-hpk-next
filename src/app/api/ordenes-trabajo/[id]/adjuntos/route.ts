import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ id: string }> };

const ETAPAS_VALIDAS = ["recepcion", "evaluacion", "termino", "despacho"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf", "application/vnd", "application/msword", "text/"];

// GET — listar adjuntos de una OT (opcionalmente filtrados por etapa)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const etapa = req.nextUrl.searchParams.get("etapa");

    const where: Record<string, unknown> = { orden_trabajo_id: Number(id) };
    if (etapa && ETAPAS_VALIDAS.includes(etapa)) {
      where.etapa_codigo = etapa;
    }

    const adjuntos = await prisma.otAdjunto.findMany({
      where,
      orderBy: { fecha_subida: "desc" },
    });

    return NextResponse.json({ data: adjuntos });
  } catch (error) {
    console.error("GET adjuntos error:", error);
    return NextResponse.json({ error: "Error al obtener adjuntos" }, { status: 500 });
  }
}

// POST — subir un archivo adjunto
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const otId = Number(id);

    // Verificar que la OT existe
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: otId }, select: { id: true } });
    if (!ot) {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const etapa = formData.get("etapa") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
    }
    if (!etapa || !ETAPAS_VALIDAS.includes(etapa)) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo excede 20 MB" }, { status: 400 });
    }

    const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));
    if (!mimeOk) {
      return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 });
    }

    // Generar nombre único para evitar colisiones
    const ext = path.extname(file.name) || "";
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueName = `${baseName}_${Date.now()}${ext}`;

    // Guardar en public/uploads/ot/{otId}/{etapa}/
    const relDir = path.join("uploads", "ot", String(otId), etapa);
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const absPath = path.join(absDir, uniqueName);
    await writeFile(absPath, buffer);

    const ruta = `/${relDir.replace(/\\/g, "/")}/${uniqueName}`;

    // Crear registro en DB
    const adjunto = await prisma.otAdjunto.create({
      data: {
        orden_trabajo_id: otId,
        etapa_codigo: etapa,
        nombre_archivo: file.name,
        ruta,
        tipo_mime: file.type,
        tamano: file.size,
      },
    });

    return NextResponse.json({ data: adjunto }, { status: 201 });
  } catch (error) {
    console.error("POST adjuntos error:", error);
    return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
  }
}

// DELETE — eliminar un adjunto por query param ?adjuntoId=X
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const adjuntoId = req.nextUrl.searchParams.get("adjuntoId");

    if (!adjuntoId) {
      return NextResponse.json({ error: "adjuntoId requerido" }, { status: 400 });
    }

    const adjunto = await prisma.otAdjunto.findFirst({
      where: { id: Number(adjuntoId), orden_trabajo_id: Number(id) },
    });

    if (!adjunto) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    // Eliminar archivo físico
    try {
      const absPath = path.join(process.cwd(), "public", adjunto.ruta);
      await unlink(absPath);
    } catch {
      // El archivo puede ya no existir, continuar con la eliminación del registro
    }

    await prisma.otAdjunto.delete({ where: { id: Number(adjuntoId) } });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE adjuntos error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

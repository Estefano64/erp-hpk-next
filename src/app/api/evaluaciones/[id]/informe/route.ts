import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// POST — subir informe
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const evalId = Number(id);

    const existing = await prisma.evaluacionTecnica.findUnique({
      where: { id: evalId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    }
    if (["APROBADA", "PENDIENTE_APROBACION"].includes(existing.estado)) {
      const msg =
        existing.estado === "APROBADA"
          ? "La evaluacion esta APROBADA. Debes reabrirla para cambiar el informe."
          : "La evaluacion esta PENDIENTE DE APROBACION y no se puede modificar.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const formData = await req.formData();
    const file = formData.get("informe") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se envio ningun archivo" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo excede 20 MB" }, { status: 400 });
    }

    // Eliminar archivo anterior si existe
    if (existing.informe_archivo) {
      try {
        const oldPath = path.join(process.cwd(), "public", existing.informe_archivo);
        await unlink(oldPath);
      } catch {
        // OK si no existe
      }
    }

    // Generar nombre unico
    const ext = path.extname(file.name) || "";
    const uniqueName = `informe-eval-${evalId}-${Date.now()}${ext}`;

    const relDir = path.join("uploads", "evaluaciones");
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const absPath = path.join(absDir, uniqueName);
    await writeFile(absPath, buffer);

    const ruta = `/${relDir.replace(/\\/g, "/")}/${uniqueName}`;

    const updated = await prisma.evaluacionTecnica.update({
      where: { id: evalId },
      data: {
        informe_archivo: ruta,
        informe_nombre: file.name,
        informe_fecha_subida: new Date(),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/evaluaciones/[id]/informe error:", error);
    return NextResponse.json({ error: "Error al subir informe" }, { status: 500 });
  }
}

// DELETE — eliminar informe
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const evalId = Number(id);
    const existing = await prisma.evaluacionTecnica.findUnique({ where: { id: evalId } });
    if (!existing || !existing.informe_archivo) {
      return NextResponse.json({ error: "No hay informe" }, { status: 404 });
    }
    if (["APROBADA", "PENDIENTE_APROBACION"].includes(existing.estado)) {
      const msg =
        existing.estado === "APROBADA"
          ? "La evaluacion esta APROBADA. Debes reabrirla para cambiar el informe."
          : "La evaluacion esta PENDIENTE DE APROBACION y no se puede modificar.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    try {
      const absPath = path.join(process.cwd(), "public", existing.informe_archivo);
      await unlink(absPath);
    } catch {}

    const updated = await prisma.evaluacionTecnica.update({
      where: { id: evalId },
      data: { informe_archivo: null, informe_nombre: null, informe_fecha_subida: null },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("DELETE informe error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

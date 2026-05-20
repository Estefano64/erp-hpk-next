import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { validarArchivo, sanitizarNombreArchivo } from "@/lib/file-uploads";

type Params = { params: Promise<{ id: string }> };

// POST — subir guía de remisión o factura
// Query: ?tipo=guia (default) | factura
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const compraId = Number(id);
    const tipo = new URL(req.url).searchParams.get("tipo") === "factura" ? "factura" : "guia";

    const compra = await prisma.compra.findUnique({ where: { id: compraId } });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    // Para facturar primero hay que tener la guía del proveedor cargada.
    // Sin guía no se acepta la factura — evita registrar factura antes de
    // recibir la mercadería.
    if (tipo === "factura" && !compra.guia_archivo) {
      return NextResponse.json({
        error: "No se puede subir factura: primero cargá la guía de remisión del proveedor.",
        falta: "guia",
      }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
    }
    const validacion = validarArchivo(file, "documentos");
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 });
    }

    // Eliminar archivo anterior si existe
    const archivoActual = tipo === "guia" ? compra.guia_archivo : compra.factura_archivo;
    if (archivoActual) {
      try {
        const oldPath = path.join(process.cwd(), "public", archivoActual);
        await unlink(oldPath);
      } catch { /* OK si no existe */ }
    }

    // Generar nombre único (extensión ya validada por validarArchivo).
    const ext = path.extname(file.name).toLowerCase();
    const uniqueName = `${tipo}-compra-${compraId}-${Date.now()}${ext}`;

    const relDir = path.join("uploads", "compras");
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const absPath = path.join(absDir, uniqueName);
    await writeFile(absPath, buffer);

    const ruta = `/${relDir.replace(/\\/g, "/")}/${uniqueName}`;

    const nombreSanitizado = sanitizarNombreArchivo(file.name);
    const dataUpdate =
      tipo === "guia"
        ? {
            guia_archivo: ruta,
            guia_nombre: nombreSanitizado,
            guia_fecha_subida: new Date(),
          }
        : {
            factura_archivo: ruta,
            factura_nombre: nombreSanitizado,
            factura_fecha_subida: new Date(),
          };

    const updated = await prisma.compra.update({
      where: { id: compraId },
      data: dataUpdate,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/compras/[id]/guia error:", error);
    const msg = error instanceof Error ? error.message : "Error al subir archivo";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — eliminar archivo subido
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const compraId = Number(id);
    const tipo = new URL(req.url).searchParams.get("tipo") === "factura" ? "factura" : "guia";

    const compra = await prisma.compra.findUnique({ where: { id: compraId } });
    if (!compra) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const archivoActual = tipo === "guia" ? compra.guia_archivo : compra.factura_archivo;
    if (!archivoActual) {
      return NextResponse.json({ error: `No hay ${tipo} adjunta` }, { status: 404 });
    }

    try {
      const absPath = path.join(process.cwd(), "public", archivoActual);
      await unlink(absPath);
    } catch { /* OK si no existe */ }

    const dataUpdate =
      tipo === "guia"
        ? { guia_archivo: null, guia_nombre: null, guia_fecha_subida: null }
        : { factura_archivo: null, factura_nombre: null, factura_fecha_subida: null };

    const updated = await prisma.compra.update({
      where: { id: compraId },
      data: dataUpdate,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("DELETE /api/compras/[id]/guia error:", error);
    return NextResponse.json({ error: "Error al eliminar archivo" }, { status: 500 });
  }
}

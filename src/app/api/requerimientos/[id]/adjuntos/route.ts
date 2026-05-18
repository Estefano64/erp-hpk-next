import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

type Ctx = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// GET — lista adjuntos de un item de requerimiento (ot_repuesto)
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const itemId = Number(id);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const data = await prisma.oTRepuestoAdjunto.findMany({
      where: { ot_repuesto_id: itemId },
      orderBy: { fecha_subida: "desc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET adjuntos requerimiento error:", error);
    return NextResponse.json({ error: "Error al obtener adjuntos" }, { status: 500 });
  }
}

// POST — subir archivo a un item
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const itemId = Number(id);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const item = await prisma.oTRepuesto.findUnique({ where: { id: itemId }, select: { id: true, ot_id: true } });
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo excede 10 MB" }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const ext = path.extname(file.name) || "";
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueName = `${baseName}_${Date.now()}${ext}`;
    const relDir = path.join("uploads", "requerimientos", String(itemId));
    const absDir = path.join(process.cwd(), "public", relDir);
    await mkdir(absDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const absPath = path.join(absDir, uniqueName);
    await writeFile(absPath, buffer);
    const ruta = `/${relDir.replace(/\\/g, "/")}/${uniqueName}`;

    const created = await prisma.oTRepuestoAdjunto.create({
      data: {
        ot_repuesto_id: itemId,
        nombre_archivo: file.name,
        ruta,
        tipo_mime: file.type || "application/octet-stream",
        tamano: file.size,
        usuario_sube: usuario,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST adjunto requerimiento error:", error);
    return NextResponse.json({ error: "Error al subir adjunto" }, { status: 500 });
  }
}

// DELETE — quitar un adjunto. Body: { adjunto_id }
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const itemId = Number(id);
    const body = await req.json().catch(() => ({}));
    const adjuntoId = Number(body.adjunto_id);
    if (!Number.isFinite(adjuntoId)) {
      return NextResponse.json({ error: "adjunto_id requerido" }, { status: 400 });
    }
    const adj = await prisma.oTRepuestoAdjunto.findUnique({ where: { id: adjuntoId } });
    if (!adj || adj.ot_repuesto_id !== itemId) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }
    try {
      const absPath = path.join(process.cwd(), "public", adj.ruta);
      await unlink(absPath);
    } catch { /* archivo ya borrado, ok */ }
    await prisma.oTRepuestoAdjunto.delete({ where: { id: adjuntoId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE adjunto requerimiento error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

// Adjuntos de items de requerimiento (OTRepuesto) en Cloudflare R2.
// Patrón presigned: ver comentarios en /api/ordenes-trabajo/[id]/adjuntos.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor, otInternaCodigoFor } from "@/lib/r2";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

// GET — lista adjuntos de un item de requerimiento (ot_repuesto)
export async function GET(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const itemId = parseInt4Safe(id) ?? 0;
    if (itemId == null || itemId <= 0) {
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

// POST — registrar adjunto ya subido a R2.
// Body: { key, nombre_archivo, tipo_mime, tamano }
export async function POST(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const itemId = parseInt4Safe(id) ?? 0;
    if (itemId == null || itemId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const item = await prisma.oTRepuesto.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        orden_trabajo: { select: { id: true, ot: true } },
        orden_trabajo_interna: { select: { id: true, ot: true } },
      },
    });
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const { key, nombre_archivo, tipo_mime, tamano } = body as {
      key?: unknown;
      nombre_archivo?: unknown;
      tipo_mime?: unknown;
      tamano?: unknown;
    };

    // Path R2 depende de si el req pertenece a OT externa o interna.
    // Interna usa el código formateado OIXXXXYY como segmento R2 (consistente
    // con el folder de adjuntos directos de la OT interna).
    const expectedPrefix = item.orden_trabajo_interna
      ? R2Keys.otInternaRequerimientoAdjunto(otInternaCodigoFor(item.orden_trabajo_interna), itemId) + "/"
      : item.orden_trabajo
        ? R2Keys.requerimientoAdjunto(otCodigoFor(item.orden_trabajo), itemId) + "/"
        : null;
    if (!expectedPrefix) {
      return NextResponse.json({ error: "Requerimiento sin OT asociada" }, { status: 400 });
    }
    if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "key fuera del namespace del requerimiento" }, { status: 400 });
    }
    if (typeof nombre_archivo !== "string" || nombre_archivo.length === 0) {
      return NextResponse.json({ error: "nombre_archivo requerido" }, { status: 400 });
    }
    if (typeof tipo_mime !== "string" || tipo_mime.length === 0) {
      return NextResponse.json({ error: "tipo_mime requerido" }, { status: 400 });
    }
    if (typeof tamano !== "number" || !Number.isFinite(tamano) || tamano <= 0) {
      return NextResponse.json({ error: "tamano inválido" }, { status: 400 });
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";

    const created = await prisma.oTRepuestoAdjunto.create({
      data: {
        ot_repuesto_id: itemId,
        nombre_archivo,
        r2_key: key,
        tipo_mime,
        tamano,
        usuario_sube: usuario,
      },
    });

    // Auditoría: registrar la subida en el historial de la OT padre (si existe).
    if (item.ot_id) {
      await prisma.oTHistorial.create({
        data: {
          ot_id: item.ot_id,
          tipo_operacion: "ADJUNTO",
          descripcion: `Adjunto subido en requerimiento (item ${itemId}): ${nombre_archivo}`,
          usuario,
        },
      });
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST adjunto requerimiento error:", error);
    return NextResponse.json({ error: "Error al registrar adjunto" }, { status: 500 });
  }
}

// DELETE — quitar un adjunto. Body: { adjunto_id }
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const itemId = parseInt4Safe(id) ?? 0;
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
      await deleteObject(adj.r2_key);
    } catch (error) {
      console.error("DELETE adjunto requerimiento: fallo R2", error);
      return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
    }

    await prisma.oTRepuestoAdjunto.delete({ where: { id: adjuntoId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE adjunto requerimiento error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

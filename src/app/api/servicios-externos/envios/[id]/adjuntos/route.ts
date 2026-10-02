// /api/servicios-externos/envios/[id]/adjuntos
// GET    — lista PDFs del envío.
// POST   — registra un archivo ya subido a R2.
//          Body: { key, nombre_archivo, tipo_mime, tamano, tipo }
//          tipo ∈ GUIA_SALIDA | COTIZACION | GUIA_DEVOLUCION | GUIA_LLEGADA | INFORME | FACTURA
// DELETE — quita un adjunto. Body: { adjunto_id }
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor, otInternaCodigoFor } from "@/lib/r2";
import { parseInt4Safe } from "@/lib/ot-formato";
import { ADJUNTO_TIPOS, ADJUNTO_LABELS, type AdjuntoTipo } from "@/lib/servicios-externos";
import { historialServicio } from "@/lib/servicios-externos-server";

type Ctx = { params: Promise<{ id: string }> };

async function cargarEnvio(envioId: number) {
  return prisma.servicioEnvio.findUnique({
    where: { id: envioId },
    select: {
      id: true,
      ot_repuesto: {
        select: {
          id: true, ot_id: true, orden_trabajo_interna_id: true, descripcion: true,
          orden_trabajo: { select: { id: true, ot: true } },
          orden_trabajo_interna: { select: { id: true, ot: true } },
        },
      },
    },
  });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  try {
    const data = await prisma.servicioEnvioAdjunto.findMany({
      where: { servicio_envio_id: envioId },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET adjuntos servicio-envio error:", error);
    return NextResponse.json({ error: "Error al obtener adjuntos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const envio = await cargarEnvio(envioId);
    if (!envio) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const { key, nombre_archivo, tipo_mime, tamano, tipo } = body as Record<string, unknown>;

    const rep = envio.ot_repuesto;
    const expectedPrefix = rep.orden_trabajo
      ? R2Keys.servicioEnvioAdjunto(otCodigoFor(rep.orden_trabajo), rep.id, envio.id) + "/"
      : rep.orden_trabajo_interna
        ? R2Keys.otInternaServicioEnvioAdjunto(otInternaCodigoFor(rep.orden_trabajo_interna), rep.id, envio.id) + "/"
        : null;
    if (!expectedPrefix) return NextResponse.json({ error: "Requerimiento sin OT asociada" }, { status: 400 });
    if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "key fuera del namespace del envío" }, { status: 400 });
    }
    if (typeof nombre_archivo !== "string" || !nombre_archivo) {
      return NextResponse.json({ error: "nombre_archivo requerido" }, { status: 400 });
    }
    if (typeof tipo_mime !== "string" || !tipo_mime) {
      return NextResponse.json({ error: "tipo_mime requerido" }, { status: 400 });
    }
    if (typeof tamano !== "number" || !Number.isFinite(tamano) || tamano <= 0) {
      return NextResponse.json({ error: "tamano inválido" }, { status: 400 });
    }
    if (typeof tipo !== "string" || !(ADJUNTO_TIPOS as readonly string[]).includes(tipo)) {
      return NextResponse.json({ error: `tipo debe ser uno de: ${ADJUNTO_TIPOS.join(", ")}` }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.servicioEnvioAdjunto.create({
        data: {
          servicio_envio_id: envioId,
          tipo,
          nombre_archivo,
          r2_key: key,
          tipo_mime,
          tamano,
          usuario_sube: usuario,
        },
      });
      await historialServicio(
        tx, rep,
        `${ADJUNTO_LABELS[tipo as AdjuntoTipo]} adjuntada al servicio "${rep.descripcion ?? rep.id}": ${nombre_archivo}`,
        usuario,
      );
      return row;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST adjunto servicio-envio error:", error);
    return NextResponse.json({ error: "Error al registrar adjunto" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  const body = await req.json().catch(() => ({}));
  const adjuntoId = Number(body?.adjunto_id);
  if (envioId <= 0 || !Number.isFinite(adjuntoId)) {
    return NextResponse.json({ error: "adjunto_id requerido" }, { status: 400 });
  }
  try {
    const adj = await prisma.servicioEnvioAdjunto.findFirst({
      where: { id: adjuntoId, servicio_envio_id: envioId },
      select: { id: true, r2_key: true, nombre_archivo: true, servicio_envio: { select: { ot_repuesto: { select: { id: true, ot_id: true, orden_trabajo_interna_id: true, descripcion: true } } } } },
    });
    if (!adj) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.servicioEnvioAdjunto.delete({ where: { id: adj.id } });
      const rep = adj.servicio_envio.ot_repuesto;
      await historialServicio(tx, rep, `Adjunto eliminado del servicio "${rep.descripcion ?? rep.id}": ${adj.nombre_archivo}`, usuario);
    });
    try { await deleteObject(adj.r2_key); } catch (e) { console.warn("R2 delete falló:", adj.r2_key, e); }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE adjunto servicio-envio error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

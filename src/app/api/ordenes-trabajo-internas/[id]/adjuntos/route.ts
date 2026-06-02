// Adjuntos de OT Interna en R2. Mismo flujo que OT externa pero apunta a
// orden_trabajo_interna_id. La etapa siempre es "general" — las internas
// (preventiva/correctiva) no tienen el flujo recepción→despacho.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otInternaCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const ETAPA_INTERNA = "general";

// GET — listar adjuntos de una OT interna.
export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const otId = Number(id);
    if (!Number.isFinite(otId) || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const adjuntos = await prisma.otAdjunto.findMany({
      where: { orden_trabajo_interna_id: otId },
      orderBy: { fecha_subida: "desc" },
    });

    return NextResponse.json({ data: adjuntos });
  } catch (error) {
    console.error("GET adjuntos OT interna error:", error);
    return NextResponse.json({ error: "Error al obtener adjuntos" }, { status: 500 });
  }
}

// POST — registra un adjunto ya subido a R2.
// Body: { key, nombre_archivo, tipo_mime, tamano }
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const otId = Number(id);

    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      select: { id: true, ot: true },
    });
    if (!ot) {
      return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
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

    if (typeof key !== "string" || key.length === 0) {
      return NextResponse.json({ error: "key requerida" }, { status: 400 });
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
    // Defensa en profundidad: el path firmado debe vivir bajo el namespace
    // de ESTA OT interna. Aceptamos tanto el path nuevo (con subcarpeta
    // "general/") como el legacy (sin subcarpeta) para no romper keys subidas
    // antes de la reorganización.
    const expectedPrefixConEtapa = R2Keys.otInternaAdjunto(otInternaCodigoFor(ot), ETAPA_INTERNA) + "/";
    const expectedPrefixLegacy   = R2Keys.otInternaAdjunto(otInternaCodigoFor(ot)) + "/";
    if (!key.startsWith(expectedPrefixConEtapa) && !key.startsWith(expectedPrefixLegacy)) {
      return NextResponse.json({ error: "key fuera del namespace de la OT" }, { status: 400 });
    }

    const usuario = (await getAuditUser(req)) ?? null;

    const adjunto = await prisma.otAdjunto.create({
      data: {
        orden_trabajo_interna_id: otId,
        etapa_codigo: ETAPA_INTERNA,
        nombre_archivo,
        r2_key: key,
        tipo_mime,
        tamano,
        usuario_sube: usuario ?? undefined,
      },
    });

    await prisma.oTHistorial.create({
      data: {
        orden_trabajo_interna_id: otId,
        tipo_operacion: "ADJUNTO",
        descripcion: `Adjunto subido: ${nombre_archivo}`,
        usuario: usuario ?? "sistema",
      },
    });

    return NextResponse.json({ data: adjunto }, { status: 201 });
  } catch (error) {
    console.error("POST adjuntos OT interna error:", error);
    return NextResponse.json({ error: "Error al registrar adjunto" }, { status: 500 });
  }
}

// DELETE — elimina un adjunto por ?adjuntoId=X
export async function DELETE(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const adjuntoId = req.nextUrl.searchParams.get("adjuntoId");
    if (!adjuntoId) {
      return NextResponse.json({ error: "adjuntoId requerido" }, { status: 400 });
    }

    const adjunto = await prisma.otAdjunto.findFirst({
      where: { id: Number(adjuntoId), orden_trabajo_interna_id: Number(id) },
    });
    if (!adjunto) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    try {
      await deleteObject(adjunto.r2_key);
    } catch (error) {
      console.error("DELETE adjuntos OT interna: fallo R2", error);
      return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
    }

    await prisma.otAdjunto.delete({ where: { id: Number(adjuntoId) } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE adjuntos OT interna error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

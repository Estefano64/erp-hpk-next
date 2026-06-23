// Adjuntos de OT Interna en R2. Mismo flujo que OT externa.
//
// 2026-06: ahora soporta las mismas 7 etapas que OT externa (recepcion,
// evaluacion, cotizacion, po_cliente, termino, despacho, facturacion) +
// "general" para archivos legacy ya subidos antes de esta migración. El
// pedido del user fue que el tab de adjuntos se vea igual en ambos modulos.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otInternaCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

const ETAPAS_VALIDAS = ["recepcion", "evaluacion", "cotizacion", "po_cliente", "termino", "despacho", "facturacion", "general"] as const;
type Etapa = (typeof ETAPAS_VALIDAS)[number];

function isEtapa(value: unknown): value is Etapa {
  return typeof value === "string" && (ETAPAS_VALIDAS as readonly string[]).includes(value);
}

// Default cuando no viene etapa en el body — preserva el comportamiento legacy
// (el frontend previo solo subía a "general").
const ETAPA_DEFAULT: Etapa = "general";

// GET — listar adjuntos de una OT interna (opcionalmente filtrados por etapa
// con ?etapa=X). Sin etapa devuelve TODOS los adjuntos de la OT.
export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const etapa = req.nextUrl.searchParams.get("etapa");
    const where: Record<string, unknown> = { orden_trabajo_interna_id: otId };
    if (etapa && isEtapa(etapa)) {
      where.etapa_codigo = etapa;
    }

    const adjuntos = await prisma.otAdjunto.findMany({
      where,
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
    const otId = parseInt4Safe(id) ?? 0;

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
    const { key, nombre_archivo, tipo_mime, tamano, etapa: etapaRaw } = body as {
      key?: unknown;
      nombre_archivo?: unknown;
      tipo_mime?: unknown;
      tamano?: unknown;
      etapa?: unknown;
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
    // Etapa: si viene, debe ser una de las 8 válidas. Si no viene, default
    // a "general" para preservar el flujo legacy.
    const etapa: Etapa = isEtapa(etapaRaw) ? etapaRaw : ETAPA_DEFAULT;
    if (etapaRaw != null && !isEtapa(etapaRaw)) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }
    // Defensa en profundidad: el path firmado debe vivir bajo el namespace
    // de ESTA OT interna. Aceptamos:
    //   - El prefijo nuevo con la etapa específica
    //   - El prefijo legacy "general/" (para keys subidas antes del cambio)
    //   - El prefijo sin etapa (caso edge: si /upload-url legacy no agregó subcarpeta)
    const expectedPrefixConEtapa = R2Keys.otInternaAdjunto(otInternaCodigoFor(ot), etapa) + "/";
    const expectedPrefixLegacyGeneral = R2Keys.otInternaAdjunto(otInternaCodigoFor(ot), "general") + "/";
    const expectedPrefixLegacy = R2Keys.otInternaAdjunto(otInternaCodigoFor(ot)) + "/";
    if (
      !key.startsWith(expectedPrefixConEtapa)
      && !key.startsWith(expectedPrefixLegacyGeneral)
      && !key.startsWith(expectedPrefixLegacy)
    ) {
      return NextResponse.json({ error: "key fuera del namespace de la OT" }, { status: 400 });
    }

    const usuario = (await getAuditUser(req)) ?? null;

    const adjunto = await prisma.otAdjunto.create({
      data: {
        orden_trabajo_interna_id: otId,
        etapa_codigo: etapa,
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
        descripcion: `Adjunto subido (etapa ${etapa}): ${nombre_archivo}`,
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
      where: { id: (parseInt4Safe(adjuntoId) ?? 0), orden_trabajo_interna_id: (parseInt4Safe(id) ?? 0) },
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

    await prisma.otAdjunto.delete({ where: { id: (parseInt4Safe(adjuntoId) ?? 0) } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE adjuntos OT interna error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

// Adjuntos de OT en Cloudflare R2.
//
// Flujo de subida (presigned URL):
//   1. Cliente llama POST /api/r2/upload-url con resource="ot-adjunto" → obtiene { uploadUrl, key }
//   2. Cliente sube el File con PUT a uploadUrl (directo a R2)
//   3. Cliente llama POST aquí con { key, nombre_archivo, tipo_mime, tamano, etapa }
//      para registrar el adjunto en BD.
//
// DELETE: borra primero de R2; si R2 OK, borra de BD. R2 devuelve OK aunque
// la key ya no exista (idempotente), así que esto cubre registros huérfanos.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { deleteObject, copyObjectToFolder } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

const ETAPAS_VALIDAS = ["recepcion", "evaluacion", "cotizacion", "po_cliente", "termino", "despacho", "facturacion"] as const;
type Etapa = (typeof ETAPAS_VALIDAS)[number];

function isEtapa(value: unknown): value is Etapa {
  return typeof value === "string" && (ETAPAS_VALIDAS as readonly string[]).includes(value);
}

// GET — listar adjuntos de una OT (opcionalmente filtrados por etapa)
export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const etapa = req.nextUrl.searchParams.get("etapa");

    const where: Record<string, unknown> = { orden_trabajo_id: (parseInt4Safe(id) ?? 0) };
    if (etapa && isEtapa(etapa)) {
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

// POST — registrar un adjunto ya subido a R2.
// Body: { key, nombre_archivo, tipo_mime, tamano, etapa }
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;

    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: otId },
      select: {
        id: true, ot: true,
        // Fechas del flujo comercial: al subir el primer documento de una etapa
        // se autocompletan si están vacías (ver más abajo).
        fecha_cotizacion: true, fecha_generacion_po: true, fecha_aprobacion: true,
        fecha_despacho: true, fecha_facturacion: true,
      },
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
    const { key, nombre_archivo, tipo_mime, tamano, etapa } = body as {
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
    if (!isEtapa(etapa)) {
      return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
    }
    // La key debe vivir bajo el namespace de ESTA OT (defensa en profundidad
    // contra clientes que firmen para una OT pero registren en otra).
    //
    // 2026-06: ahora cada etapa tiene su propia subcarpeta. La key generada
    // por /upload-url debe matchear el prefijo con etapa. El prefijo SIN
    // etapa también se acepta para tolerar keys legacy (subidas antes del
    // cambio) y para no romper si el cliente se desfasa por caching.
    const expectedPrefixConEtapa = R2Keys.otAdjunto(otCodigoFor(ot), etapa) + "/";
    const expectedPrefixLegacy   = R2Keys.otAdjunto(otCodigoFor(ot)) + "/";
    if (!key.startsWith(expectedPrefixConEtapa) && !key.startsWith(expectedPrefixLegacy)) {
      return NextResponse.json({ error: "key fuera del namespace de la OT" }, { status: 400 });
    }

    const usuario = (await getAuditUser(req)) ?? null;

    const adjunto = await prisma.otAdjunto.create({
      data: {
        orden_trabajo_id: otId,
        etapa_codigo: etapa,
        nombre_archivo,
        r2_key: key,
        tipo_mime,
        tamano,
        usuario_sube: usuario ?? undefined,
      },
    });

    // Auditoría: solo la subida queda en historial (delete y download no).
    await prisma.oTHistorial.create({
      data: {
        ot_id: otId,
        tipo_operacion: "ADJUNTO",
        descripcion: `Adjunto subido (etapa ${etapa}): ${nombre_archivo}`,
        usuario: usuario ?? "sistema",
      },
    });

    // Subir el documento de una etapa comercial AUTOCOMPLETA su fecha en la OT
    // si está vacía — así "Fechas Relevantes" refleja lo que pasa en Adjuntos
    // sin depender de que alguien tipee la fecha a mano. Nunca pisa una fecha
    // ya cargada (se puede ajustar después desde el propio tab o Editar OT).
    // La PO del cliente implica cotización aprobada → completa ambas fechas.
    const FECHAS_POR_ETAPA: Record<string, ("fecha_cotizacion" | "fecha_generacion_po" | "fecha_aprobacion" | "fecha_despacho" | "fecha_facturacion")[]> = {
      cotizacion: ["fecha_cotizacion"],
      po_cliente: ["fecha_generacion_po", "fecha_aprobacion"],
      despacho: ["fecha_despacho"],
      facturacion: ["fecha_facturacion"],
    };
    const fechasData: Record<string, Date> = {};
    for (const campo of FECHAS_POR_ETAPA[etapa] ?? []) {
      if (!ot[campo]) fechasData[campo] = new Date();
    }
    if (Object.keys(fechasData).length > 0) {
      await prisma.ordenTrabajo.update({ where: { id: otId }, data: fechasData });
    }

    // Sincronización con el informe de la hoja de evaluación.
    // Si esta etapa es "evaluacion" y la OT tiene una hoja de evaluación
    // editable SIN informe cargado, copiamos este adjunto al slot de informe
    // (carpeta evaluaciones/) y lo registramos. Es "rellenar el hueco": NUNCA
    // pisa un informe ya existente ni una hoja bloqueada (APROBADA/PENDIENTE).
    // Best-effort: si falla, no rompe la subida del adjunto.
    if (etapa === "evaluacion") {
      try {
        const evalSheet = await prisma.evaluacionTecnica.findFirst({
          where: { ot_id: otId },
          orderBy: { id: "desc" },
          select: { id: true, informe_key: true, estado: true },
        });
        if (
          evalSheet && !evalSheet.informe_key &&
          evalSheet.estado !== "APROBADA" && evalSheet.estado !== "PENDIENTE_APROBACION"
        ) {
          const destKey = await copyObjectToFolder({
            sourceKey: key,
            folderPrefix: R2Keys.otEvaluacion(otCodigoFor(ot)),
            fileName: nombre_archivo,
          });
          await prisma.evaluacionTecnica.update({
            where: { id: evalSheet.id },
            data: {
              informe_key: destKey,
              informe_nombre: nombre_archivo,
              informe_mime: tipo_mime,
              informe_tamano: tamano,
              informe_fecha_subida: new Date(),
            },
          });
        }
      } catch (e) {
        console.warn("Sync adjunto->informe evaluación falló:", e);
      }
    }

    return NextResponse.json({ data: adjunto }, { status: 201 });
  } catch (error) {
    console.error("POST adjuntos error:", error);
    return NextResponse.json({ error: "Error al registrar adjunto" }, { status: 500 });
  }
}

// DELETE — eliminar un adjunto por query param ?adjuntoId=X
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
      where: { id: (parseInt4Safe(adjuntoId) ?? 0), orden_trabajo_id: (parseInt4Safe(id) ?? 0) },
    });
    if (!adjunto) {
      return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
    }

    // R2 primero. Si falla, no tocamos BD para no dejar archivos huérfanos.
    try {
      await deleteObject(adjunto.r2_key);
    } catch (error) {
      console.error("DELETE adjuntos: fallo R2", error);
      return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
    }

    await prisma.otAdjunto.delete({ where: { id: (parseInt4Safe(adjuntoId) ?? 0) } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE adjuntos error:", error);
    return NextResponse.json({ error: "Error al eliminar adjunto" }, { status: 500 });
  }
}

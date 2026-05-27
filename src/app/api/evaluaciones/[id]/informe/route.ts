// Informe de Evaluación Técnica en Cloudflare R2.
//
// POST body: { key, nombre_archivo, tipo_mime, tamano }
// El cliente subió antes a R2 via /api/r2/upload-url con resource="evaluacion-informe".
//
// Reglas de negocio preservadas: no se puede modificar/eliminar el informe si la
// evaluación está APROBADA o PENDIENTE_APROBACION.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sanitizarNombreArchivo } from "@/lib/file-uploads";
import { deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const ESTADOS_BLOQUEADOS = ["APROBADA", "PENDIENTE_APROBACION"];

function errorEstadoBloqueado(estado: string): string {
  return estado === "APROBADA"
    ? "La evaluacion esta APROBADA. Debes reabrirla para cambiar el informe."
    : "La evaluacion esta PENDIENTE DE APROBACION y no se puede modificar.";
}

// POST — registra un informe ya subido a R2.
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const evalId = Number(id);

    const existing = await prisma.evaluacionTecnica.findUnique({
      where: { id: evalId },
      include: { orden_trabajo: { select: { id: true, ot: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    }
    if (ESTADOS_BLOQUEADOS.includes(existing.estado)) {
      return NextResponse.json({ error: errorEstadoBloqueado(existing.estado) }, { status: 409 });
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

    const expectedPrefix = R2Keys.otEvaluacion(otCodigoFor(existing.orden_trabajo)) + "/";
    if (typeof key !== "string" || !key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "key fuera del namespace de la OT" }, { status: 400 });
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

    // Eliminar archivo anterior en R2 si existe.
    if (existing.informe_key && existing.informe_key !== key) {
      try {
        await deleteObject(existing.informe_key);
      } catch (error) {
        console.warn("No se pudo eliminar informe anterior de R2:", error);
      }
    }

    const nombreSanitizado = sanitizarNombreArchivo(nombre_archivo);
    const updated = await prisma.evaluacionTecnica.update({
      where: { id: evalId },
      data: {
        informe_key: key,
        informe_nombre: nombreSanitizado,
        informe_mime: tipo_mime,
        informe_tamano: tamano,
        informe_fecha_subida: new Date(),
      },
    });

    // Auditoría: registrar la subida en el historial de la OT padre.
    const usuario = (await getAuditUser(req)) ?? "sistema";
    await prisma.oTHistorial.create({
      data: {
        ot_id: existing.orden_trabajo.id,
        tipo_operacion: "ADJUNTO",
        descripcion: `Informe de evaluación subido: ${nombreSanitizado}`,
        usuario,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/evaluaciones/[id]/informe error:", error);
    return NextResponse.json({ error: "Error al registrar informe" }, { status: 500 });
  }
}

// DELETE — eliminar informe (R2 + BD)
export async function DELETE(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const evalId = Number(id);

    const existing = await prisma.evaluacionTecnica.findUnique({ where: { id: evalId } });
    if (!existing || !existing.informe_key) {
      return NextResponse.json({ error: "No hay informe" }, { status: 404 });
    }
    if (ESTADOS_BLOQUEADOS.includes(existing.estado)) {
      return NextResponse.json({ error: errorEstadoBloqueado(existing.estado) }, { status: 409 });
    }

    try {
      await deleteObject(existing.informe_key);
    } catch (error) {
      console.error("DELETE informe: fallo R2", error);
      return NextResponse.json({ error: "No se pudo eliminar el archivo de R2" }, { status: 500 });
    }

    const updated = await prisma.evaluacionTecnica.update({
      where: { id: evalId },
      data: {
        informe_key: null,
        informe_nombre: null,
        informe_mime: null,
        informe_tamano: null,
        informe_fecha_subida: null,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("DELETE informe error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

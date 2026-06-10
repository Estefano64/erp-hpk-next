import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// POST — ejecuta accion sobre la evaluacion
// body: { accion: "solicitar" | "aprobar" | "rechazar", comentarios? }
// El nombre del usuario (solicitante / aprobador) NO se acepta del body: se toma
// SIEMPRE del usuario logueado (token), para que nadie firme con un nombre ajeno.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { accion, comentarios } = body;

    if (!accion) {
      return NextResponse.json({ error: "Falta accion" }, { status: 400 });
    }
    const usuario = await getAuditUser(req);
    if (!usuario) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    // Comentario opcional. Si viene se guarda en `comentarios_revision`.
    const comentarioTrim = typeof comentarios === "string" ? comentarios.trim() : "";

    const evalActual = await prisma.evaluacionTecnica.findUnique({ where: { id: Number(id) } });
    if (!evalActual) {
      return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    // Espejo a la cabecera de la OT (campos de solo lectura en "Editar OT").
    // Se completa progresivamente: al enviar a revisión ya se sabe quién
    // evaluó; al aprobar ya se sabe quién aprobó.
    let otSync: Record<string, unknown> | null = null;
    const now = new Date();

    switch (accion) {
      case "solicitar":
        if (!["BORRADOR", "RECHAZADA"].includes(evalActual.estado)) {
          return NextResponse.json(
            { error: `No se puede solicitar revision desde estado ${evalActual.estado}` },
            { status: 400 }
          );
        }
        // El evaluador es obligatorio para mandar la hoja a revisión.
        if (!evalActual.evaluado_por?.trim()) {
          return NextResponse.json(
            { error: "Falta el evaluador: completá 'Evaluado por' en la hoja antes de enviarla a revisión." },
            { status: 400 }
          );
        }
        data.estado = "PENDIENTE_APROBACION";
        data.solicitado_revision_por = usuario;
        data.fecha_solicitud_revision = now;
        data.comentarios_revision = comentarioTrim || null;
        break;

      case "aprobar":
        if (evalActual.estado !== "PENDIENTE_APROBACION") {
          return NextResponse.json(
            { error: "Solo se pueden aprobar evaluaciones en estado PENDIENTE_APROBACION" },
            { status: 400 }
          );
        }
        data.estado = "APROBADA";
        data.revisado_por = usuario;
        data.fecha_revision = now;
        data.comentarios_revision = comentarioTrim || null;
        // La evaluación queda FINALIZADA al aprobarse → espejar a la cabecera de
        // la OT los 4 campos de una vez: quién evaluó + su fecha (de la hoja) y
        // quién aprobó + la fecha de aprobación (ahora).
        otSync = {
          evaluador: evalActual.evaluado_por,
          fecha_evaluacion: evalActual.fecha_evaluacion ?? now,
          evaluacion_aprobado_por: usuario,
          fecha_aprobacion_evaluacion: now,
        };
        break;

      case "rechazar":
        if (evalActual.estado !== "PENDIENTE_APROBACION") {
          return NextResponse.json(
            { error: "Solo se pueden rechazar evaluaciones en estado PENDIENTE_APROBACION" },
            { status: 400 }
          );
        }
        data.estado = "RECHAZADA";
        data.revisado_por = usuario;
        data.fecha_revision = now;
        data.comentarios_revision = comentarioTrim || null;
        break;

      case "reabrir":
        // Volver a borrador (para editar despues de rechazada)
        if (!["RECHAZADA", "APROBADA"].includes(evalActual.estado)) {
          return NextResponse.json(
            { error: `No se puede reabrir desde estado ${evalActual.estado}` },
            { status: 400 }
          );
        }
        data.estado = "BORRADOR";
        data.comentarios_revision = comentarioTrim || null;
        break;

      default:
        return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.evaluacionTecnica.update({
        where: { id: Number(id) },
        data,
      });
      // Espejo a la cabecera de la OT (Evaluador/Aprobado por + fechas). Estos
      // campos son de solo lectura en "Editar OT": la hoja es la fuente de verdad.
      if (otSync) {
        await tx.ordenTrabajo.update({ where: { id: evalActual.ot_id }, data: otSync });
      }
      return u;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/evaluaciones/[id]/revision error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

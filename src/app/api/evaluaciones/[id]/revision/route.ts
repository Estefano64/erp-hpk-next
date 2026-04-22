import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// POST — ejecuta accion sobre la evaluacion
// body: { accion: "solicitar" | "aprobar" | "rechazar", usuario, comentarios? }
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { accion, usuario, comentarios } = body;

    if (!accion || !usuario) {
      return NextResponse.json({ error: "Falta accion o usuario" }, { status: 400 });
    }

    const evalActual = await prisma.evaluacionTecnica.findUnique({ where: { id: Number(id) } });
    if (!evalActual) {
      return NextResponse.json({ error: "Evaluacion no encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const now = new Date();

    switch (accion) {
      case "solicitar":
        if (!["BORRADOR", "COMPLETADA", "RECHAZADA"].includes(evalActual.estado)) {
          return NextResponse.json(
            { error: `No se puede solicitar revision desde estado ${evalActual.estado}` },
            { status: 400 }
          );
        }
        data.estado = "PENDIENTE_APROBACION";
        data.solicitado_revision_por = usuario;
        data.fecha_solicitud_revision = now;
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
        if (comentarios) data.comentarios_revision = comentarios;
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
        if (comentarios) data.comentarios_revision = comentarios;
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
        break;

      default:
        return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
    }

    const updated = await prisma.evaluacionTecnica.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST /api/evaluaciones/[id]/revision error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

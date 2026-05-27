import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { deleteObject } from "@/lib/r2-helpers";

type Params = { params: Promise<{ id: string }> };

const ESTADOS_VALIDOS = ["ABIERTO", "EN_PROCESO", "RESUELTO", "CERRADO"] as const;

// GET — detalle de un ticket
export async function GET(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const ticket = await prisma.ticket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    return NextResponse.json({ data: ticket });
  } catch (error) {
    console.error("GET /api/tickets/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener ticket" }, { status: 500 });
  }
}

// PUT — actualizar estado, asignación y/o notas de resolución.
// Body acepta: { estado, asignado_a, notas_resolucion }. Si pasa a RESUELTO,
// se setea resuelto_por + fecha_resolucion automáticamente.
export async function PUT(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const ticketId = Number(id);
    const existing = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof body.estado === "string") {
      if (!(ESTADOS_VALIDOS as readonly string[]).includes(body.estado)) {
        return NextResponse.json({ error: "estado inválido" }, { status: 400 });
      }
      data.estado = body.estado;
    }
    if (body.asignado_a === null || typeof body.asignado_a === "string") {
      data.asignado_a = body.asignado_a;
    }
    if (body.notas_resolucion === null || typeof body.notas_resolucion === "string") {
      data.notas_resolucion = body.notas_resolucion;
    }

    // Marcar resolución automática cuando el estado pasa a RESUELTO por primera vez.
    if (data.estado === "RESUELTO" && existing.estado !== "RESUELTO") {
      data.resuelto_por = (await getAuditUser(req)) ?? "sistema";
      data.fecha_resolucion = new Date();
    }
    // Si pasa de RESUELTO a otro estado (reapertura), limpiar.
    if (data.estado && data.estado !== "RESUELTO" && existing.estado === "RESUELTO") {
      data.resuelto_por = null;
      data.fecha_resolucion = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No hay campos a actualizar" }, { status: 400 });
    }

    const updated = await prisma.ticket.update({ where: { id: ticketId }, data });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/tickets/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar ticket" }, { status: 500 });
  }
}

// DELETE — eliminar ticket (y su captura en R2 si tiene).
export async function DELETE(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const ticketId = Number(id);
    const existing = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    // R2 primero (idempotente, no falla si la key ya no existe).
    if (existing.captura_key) {
      try {
        await deleteObject(existing.captura_key);
      } catch (error) {
        console.warn("DELETE /api/tickets/[id]: fallo borrar captura en R2:", error);
        // Continuamos: deja el archivo huérfano pero permite borrar el ticket.
      }
    }
    await prisma.ticket.delete({ where: { id: ticketId } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/tickets/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar ticket" }, { status: 500 });
  }
}

// Aprobación manual de OT interna.
//
// PATCH /api/ordenes-trabajo-internas/[id]/aprobacion
//   body: { accion: "enviar" | "aprobar" | "rechazar" | "reabrir", comentario?: string }
//
// Estados (aprobacion_status_codigo):
//   BORRADOR        → estado inicial. Acciones permitidas: "enviar".
//   SIN_APROBACION  → enviada. Acciones permitidas: "aprobar", "rechazar".
//   APROBADA        → cerrada (verde). Acciones permitidas: "reabrir" (vuelve a BORRADOR).
//   RECHAZADA       → rechazada. Acciones permitidas: "enviar" (re-envía tras corregir).
//
// Cada transición se asienta en OTHistorial con la acción y el comentario.
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };
type Accion = "enviar" | "aprobar" | "rechazar" | "reabrir";

const TRANSICIONES: Record<string, Accion[]> = {
  BORRADOR: ["enviar"],
  SIN_APROBACION: ["aprobar", "rechazar"],
  APROBADA: ["reabrir"],
  RECHAZADA: ["enviar"],
};

export async function PATCH(req: NextRequest, { params }: Params) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { id } = await params;
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null || otId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    let body: { accion?: Accion; comentario?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const accion = body.accion;
    if (accion !== "enviar" && accion !== "aprobar" && accion !== "rechazar" && accion !== "reabrir") {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    const comentario = (body.comentario ?? "").trim().slice(0, 500);
    if (accion === "rechazar" && !comentario) {
      return NextResponse.json({ error: "Comentario obligatorio para rechazar" }, { status: 400 });
    }

    const ot = await prisma.ordenTrabajoInterna.findUnique({
      where: { id: otId },
      select: {
        id: true,
        aprobacion_status_codigo: true,
        usuario_envia_aprobacion: true,
        usuario_crea: true,
      },
    });
    if (!ot) {
      return NextResponse.json({ error: "OT interna no encontrada" }, { status: 404 });
    }

    const estadoActual = ot.aprobacion_status_codigo ?? "BORRADOR";
    const permitidas = TRANSICIONES[estadoActual] ?? [];
    if (!permitidas.includes(accion)) {
      return NextResponse.json(
        { error: `No se puede '${accion}' desde estado '${estadoActual}'` },
        { status: 409 },
      );
    }

    const usuario = (await getAuditUser(req)) ?? "sistema";

    // Quien aprueba/rechaza no puede ser el mismo que envió a aprobación.
    // Regla habitual de control interno (cuatro ojos). El creador SÍ puede
    // reabrir su propia OT (volver a borrador).
    if ((accion === "aprobar" || accion === "rechazar") && ot.usuario_envia_aprobacion === usuario) {
      return NextResponse.json(
        { error: "El usuario que envió la OT a aprobación no puede aprobarla/rechazarla" },
        { status: 403 },
      );
    }

    const ahora = new Date();
    const data: Record<string, unknown> = {};
    let descripcion = "";

    if (accion === "enviar") {
      data.aprobacion_status_codigo = "SIN_APROBACION";
      data.fecha_envio_aprobacion = ahora;
      data.usuario_envia_aprobacion = usuario;
      // Limpiar marcas de decisión previa si re-envía tras un rechazo.
      data.fecha_aprobacion = null;
      data.usuario_aprueba = null;
      data.comentario_aprobacion = null;
      descripcion = `OT enviada a aprobación${comentario ? ` — ${comentario}` : ""}`;
    } else if (accion === "aprobar") {
      data.aprobacion_status_codigo = "APROBADA";
      data.fecha_aprobacion = ahora;
      data.usuario_aprueba = usuario;
      data.comentario_aprobacion = comentario || null;
      descripcion = `OT aprobada${comentario ? ` — ${comentario}` : ""}`;
    } else if (accion === "rechazar") {
      data.aprobacion_status_codigo = "RECHAZADA";
      data.fecha_aprobacion = ahora;
      data.usuario_aprueba = usuario;
      data.comentario_aprobacion = comentario;
      descripcion = `OT rechazada — ${comentario}`;
    } else {
      // reabrir
      data.aprobacion_status_codigo = "BORRADOR";
      data.fecha_envio_aprobacion = null;
      data.usuario_envia_aprobacion = null;
      data.fecha_aprobacion = null;
      data.usuario_aprueba = null;
      data.comentario_aprobacion = null;
      descripcion = `OT reabierta a BORRADOR${comentario ? ` — ${comentario}` : ""}`;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.ordenTrabajoInterna.update({
        where: { id: otId },
        data,
      });
      await tx.oTHistorial.create({
        data: {
          orden_trabajo_interna_id: otId,
          tipo_operacion: "APROBACION",
          descripcion,
          usuario,
        },
      });
      return row;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/ordenes-trabajo-internas/[id]/aprobacion error:", error);
    const msg = error instanceof Error ? error.message : "Error en transición de aprobación";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

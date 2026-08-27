import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { crearNotificaciones, getUsuarioIdSesion } from "@/lib/notificaciones-server";
import { resetLiberaciones } from "@/lib/liberacion";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  // Motivo OBLIGATORIO: el punto de esta acción es que el error rebote con
  // explicación, no que el req muera en silencio.
  motivo: z.string().trim().min(5, "El motivo es obligatorio (mínimo 5 caracteres)").max(500),
});

// POST /api/requerimientos/[id]/observar — "Devolver a revisión" (2026-08-27).
//
// Caso: un req APROBADO llega a la cola de compras pero está mal pedido
// (código errado, cantidad absurda, duplicado). Antes logística no tenía cómo
// sacarlo de la cola — quedaba aprobado para siempre sin comprarse. Con esto:
//   APROBADO (sin OC)  →  OBSERVADO
// El req sale de "Listos para OC", se notifica al solicitante Y al aprobador
// (con el motivo), y para volver al circuito hay que corregirlo y reenviarlo
// a aprobación (enviar-a-aprobacion acepta OBSERVADO → SIN_APROBACION).
//
// Rol: logística/admin (matriz de escritura en acceso-rutas.ts).
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const repId = parseInt4Safe(id) ?? 0;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      const primero = parsed.error.issues[0]?.message ?? "Validación";
      return NextResponse.json({ error: primero }, { status: 400 });
    }
    const motivo = parsed.data.motivo;
    const usuario = (await getAuditUser(req)) ?? "Logistica";

    const rep = await prisma.oTRepuesto.findUnique({ where: { id: repId } });
    if (!rep) return NextResponse.json({ error: "Requerimiento no encontrado" }, { status: 404 });
    if (rep.status_requerimiento_codigo !== "APROBADO") {
      return NextResponse.json({
        error: `Solo se puede devolver a revisión un requerimiento APROBADO. Estado actual: ${rep.status_requerimiento_codigo ?? "—"}.`,
      }, { status: 409 });
    }
    if (rep.po_id != null || rep.nro_oc) {
      return NextResponse.json({
        error: "El requerimiento ya está asignado a una OC — desvinculalo de la OC antes de devolverlo a revisión.",
      }, { status: 409 });
    }

    const ref = `${rep.nro_req ?? rep.id}/${rep.item_req ?? "—"}`;
    const fechaStr = new Date().toLocaleDateString("es-PE");
    const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.oTRepuesto.update({
        where: { id: rep.id },
        data: {
          status_requerimiento_codigo: "OBSERVADO",
          // usuario_aprueba/fecha_aprobacion se conservan como historial de la
          // aprobación fallida; el próximo aprobar los pisa con la firma nueva.
          observaciones: `${obsPrev}DEVUELTO A REVISIÓN el ${fechaStr} por ${usuario} — ${motivo}`,
        },
      });
      await tx.oTHistorial.create({
        data: {
          ot_id: rep.ot_id,
          orden_trabajo_interna_id: rep.orden_trabajo_interna_id,
          tipo_operacion: "Otro",
          descripcion: `Requerimiento ${ref} devuelto a revisión por ${usuario} — ${motivo}`,
          usuario,
          datos_adicionales: JSON.stringify({
            accion: "OBSERVAR_REQ",
            requerimiento_id: rep.id,
            motivo,
            aprobador_previo: rep.usuario_aprueba ?? null,
          }),
        },
      });
      // Resetear las firmas de liberación A/B: la aprobación fue rebatida,
      // así que las firmas viejas dejan de valer — el reenvío exige firmas
      // NUEVAS. Sin esto, un req >$5,000 devuelto conservaba sus firmas y el
      // "re-aprobar" pasaba sin que nadie firmara de verdad (mismo criterio
      // que desaprobar/anular).
      await resetLiberaciones(tx, { otRepuestoId: rep.id });
      await recalcularRecursosStatusDesdeRep(tx, rep);
      return u;
    });

    // Notificaciones FUERA de la transacción (no voltean el guardado):
    // al solicitante y al aprobador previo, resolviendo nombre → cuenta.
    try {
      const nombres = [rep.usuario_solicita, rep.usuario_aprueba]
        .map((n) => n?.trim().toLowerCase())
        .filter((n): n is string => !!n);
      if (nombres.length > 0) {
        const cuentas = await prisma.usuario.findMany({
          where: { activo: true },
          select: { id: true, nombre: true },
        });
        const ids = [...new Set(
          cuentas
            .filter((c) => nombres.includes(c.nombre.trim().toLowerCase()))
            .map((c) => c.id),
        )];
        await crearNotificaciones(
          ids.map((usuario_id) => ({
            usuario_id,
            tipo: "req_observado",
            titulo: `Req ${ref} devuelto a revisión`,
            mensaje: `${usuario}: ${motivo}`,
            url: rep.nro_req ? `/requerimientos/detalle?nro_req=${encodeURIComponent(rep.nro_req)}` : "/requerimientos/detalle",
          })),
          { creadaPor: usuario, omitirUsuarioId: await getUsuarioIdSesion(req) },
        );
      }
    } catch (e) {
      console.error("observar: error notificando", e);
    }

    return NextResponse.json({
      data: updated,
      message: `Requerimiento ${ref} devuelto a revisión — se notificó al solicitante y al aprobador.`,
    });
  } catch (e) {
    console.error("POST /api/requerimientos/[id]/observar error:", e);
    return NextResponse.json({ error: "Error al devolver a revisión" }, { status: 500 });
  }
}

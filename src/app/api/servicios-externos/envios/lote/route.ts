// PATCH /api/servicios-externos/envios/lote
// Envío conjunto: aplica la misma etapa a varios envíos de un lote (varios SER
// que salieron juntos al mismo proveedor), en una sola transacción.
//
// Body: { lote_id, accion, ...campos comunes, lineas: [{ envio_id, ... }] }
//   accion = "cotizacion"  comunes: fecha_cotizacion?, nro_cotizacion?, moneda_cotizacion?
//                          por línea: resultado (ACEPTADA|RECHAZADA), monto_cotizacion?
//                          → el proveedor puede aceptar unos servicios y
//                            rechazar otros (los rechazados siguen a devolución
//                            y quedan libres para enviarse a otro proveedor).
//   accion = "devolucion"  comunes: fecha_devolucion, guia_devolucion?
//   accion = "llegada"     comunes: fecha_llegada, guia_llegada?, recibido_por?, nro_factura?
//   accion = "factura"     comunes: nro_factura
// Las líneas de devolución/llegada/factura solo llevan envio_id (pueden ser
// un subconjunto: p.ej. llega primero uno de los dos servicios aceptados).
// Las reglas por envío son las mismas que PATCH /envios/[id].
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuditUser } from "@/lib/audit";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { prisma } from "@/lib/servicios-externos-server";
import {
  AccionDevolucion, AccionFactura, AccionLlegada, aplicarAccionEnvio, errorAccion, type AccionEnvio,
} from "@/lib/servicios-externos-acciones";

const Linea = z.object({ envio_id: z.coerce.number().int().positive() });
const Lote = z.object({ lote_id: z.string().trim().min(1).max(36) });

const Schema = z.discriminatedUnion("accion", [
  Lote.extend({
    accion: z.literal("cotizacion"),
    fecha_cotizacion: z.string().optional().nullable(),
    nro_cotizacion: z.string().trim().max(100).optional().nullable(),
    moneda_cotizacion: z.string().trim().max(10).optional().nullable(),
    lineas: z.array(Linea.extend({
      resultado: z.enum(["ACEPTADA", "RECHAZADA"]),
      monto_cotizacion: z.coerce.number().min(0).optional().nullable(),
    })).min(1).max(100),
  }),
  Lote.extend(AccionDevolucion.shape).extend({ lineas: z.array(Linea).min(1).max(100) }),
  Lote.extend(AccionLlegada.shape).extend({ lineas: z.array(Linea).min(1).max(100) }),
  Lote.extend(AccionFactura.shape).extend({ lineas: z.array(Linea).min(1).max(100) }),
]);

export async function PATCH(req: NextRequest) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const ids = [...new Set(d.lineas.map((l) => l.envio_id))];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const delLote = await tx.servicioEnvio.findMany({ where: { id: { in: ids } }, select: { id: true, lote_id: true } });
      if (delLote.length !== ids.length || delLote.some((e) => e.lote_id !== d.lote_id)) {
        throw errorAccion("BAD_REQ", "Hay envíos que no pertenecen a este envío conjunto.");
      }

      const out = [];
      const ots = new Map<string, { ot_id: number | null; orden_trabajo_interna_id: number | null }>();
      for (const l of d.lineas) {
        let accion: AccionEnvio;
        switch (d.accion) {
          case "cotizacion": {
            const lc = l as (typeof d.lineas)[number];
            accion = {
              accion: "cotizacion",
              resultado: lc.resultado,
              monto_cotizacion: lc.monto_cotizacion ?? null,
              fecha_cotizacion: d.fecha_cotizacion,
              nro_cotizacion: d.nro_cotizacion,
              moneda_cotizacion: d.moneda_cotizacion,
            };
            break;
          }
          case "devolucion":
            accion = { accion: "devolucion", fecha_devolucion: d.fecha_devolucion, guia_devolucion: d.guia_devolucion };
            break;
          case "llegada":
            accion = {
              accion: "llegada", fecha_llegada: d.fecha_llegada, guia_llegada: d.guia_llegada,
              recibido_por: d.recibido_por, nro_factura: d.nro_factura,
            };
            break;
          case "factura":
            accion = { accion: "factura", nro_factura: d.nro_factura };
            break;
        }
        const { envio, ser } = await aplicarAccionEnvio(tx, l.envio_id, accion, usuario);
        ots.set(`${ser.ot_id}|${ser.orden_trabajo_interna_id}`, { ot_id: ser.ot_id, orden_trabajo_interna_id: ser.orden_trabajo_interna_id });
        out.push(envio);
      }
      if (d.accion === "llegada") {
        for (const ot of ots.values()) await recalcularRecursosStatusDesdeRep(tx, ot);
      }
      return out;
    });

    return NextResponse.json({ data: result, actualizados: result.length });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "NOT_FOUND") return NextResponse.json({ error: e.message }, { status: 404 });
    if (e.code === "BAD_REQ" || e.code === "BAD_STATE") return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PATCH /api/servicios-externos/envios/lote error:", error);
    return NextResponse.json({ error: "Error al actualizar el envío conjunto" }, { status: 500 });
  }
}

// /api/servicios-externos/envios/[id]
//
// PATCH — avanza o corrige un envío. Body: { accion, ...campos }
//   accion = "cotizacion"  { resultado: ACEPTADA|RECHAZADA, fecha_cotizacion?,
//                            nro_cotizacion?, monto_cotizacion?, moneda_cotizacion? }
//            Si ACEPTADA y el SER no tiene OC todavía: prellena proveedor y
//            precio unitario del requerimiento (monto / cantidad) para que la
//            OC salga con esos datos. monto_cotizacion = TOTAL cotizado para
//            la cantidad del requerimiento.
//   accion = "devolucion"  { fecha_devolucion, guia_devolucion? }
//            Solo con cotización RECHAZADA. Cierra el intento → el SER vuelve
//            a estar disponible para un envío nuevo.
//   accion = "llegada"     { fecha_llegada, guia_llegada?, recibido_por?, nro_factura? }
//            Solo con cotización ACEPTADA. ES la recepción del servicio: marca
//            el SER (y sus ítems asociados) como recibidos aunque no exista
//            OC. Recalcula recursos_status de la OT.
//   accion = "factura"     { nro_factura }
//   accion = "editar"      { guia_salida?, guia_devolucion?, guia_llegada?,
//                            nro_cotizacion?, nro_factura?, recibido_por?,
//                            observaciones?, fecha_salida? }  (no cambia etapa)
//
// DELETE — elimina el envío (y sus PDFs en R2). Solo si todavía no se
// registró la llegada; un servicio recibido no se deshace por acá.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";
import { deleteObject } from "@/lib/r2-helpers";
import { parseInt4Safe } from "@/lib/ot-formato";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { prisma, cargarSer, historialServicio, serializarEnvio, SELECT_ENVIO } from "@/lib/servicios-externos-server";

type Ctx = { params: Promise<{ id: string }> };

const Cotizacion = z.object({
  accion: z.literal("cotizacion"),
  resultado: z.enum(["ACEPTADA", "RECHAZADA"]),
  fecha_cotizacion: z.string().optional().nullable(),
  nro_cotizacion: z.string().trim().max(100).optional().nullable(),
  monto_cotizacion: z.coerce.number().min(0).optional().nullable(),
  moneda_cotizacion: z.string().trim().max(10).optional().nullable(),
});
const Devolucion = z.object({
  accion: z.literal("devolucion"),
  fecha_devolucion: z.string().min(8),
  guia_devolucion: z.string().trim().max(100).optional().nullable(),
});
const Llegada = z.object({
  accion: z.literal("llegada"),
  fecha_llegada: z.string().min(8),
  guia_llegada: z.string().trim().max(100).optional().nullable(),
  recibido_por: z.string().trim().max(150).optional().nullable(),
  nro_factura: z.string().trim().max(100).optional().nullable(),
});
const Factura = z.object({
  accion: z.literal("factura"),
  nro_factura: z.string().trim().max(100).optional().nullable(),
});
const Editar = z.object({
  accion: z.literal("editar"),
  fecha_salida: z.string().optional().nullable(),
  guia_salida: z.string().trim().max(100).optional().nullable(),
  guia_devolucion: z.string().trim().max(100).optional().nullable(),
  guia_llegada: z.string().trim().max(100).optional().nullable(),
  nro_cotizacion: z.string().trim().max(100).optional().nullable(),
  nro_factura: z.string().trim().max(100).optional().nullable(),
  recibido_por: z.string().trim().max(150).optional().nullable(),
  observaciones: z.string().trim().max(2000).optional().nullable(),
});
const Schema = z.discriminatedUnion("accion", [Cotizacion, Devolucion, Llegada, Factura, Editar]);

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const envio = await tx.servicioEnvio.findUnique({
        where: { id: envioId },
        select: { ...SELECT_ENVIO, ot_repuesto: { select: { id: true } } },
      });
      if (!envio) throw Object.assign(new Error("Envío no encontrado"), { code: "NOT_FOUND" });
      const ser = await cargarSer(tx, envio.ot_repuesto_id);
      if (!ser) throw Object.assign(new Error("Requerimiento del envío no es un servicio"), { code: "BAD_REQ" });
      const ultimo = ser.servicio_envios.reduce((a, b) => (b.id > a.id ? b : a));
      const esUltimo = ultimo.id === envio.id;
      const desc = ser.descripcion ?? `Item ${ser.id}`;
      const bad = (m: string) => Object.assign(new Error(m), { code: "BAD_STATE" });

      let data: Prisma.ServicioEnvioUpdateInput = { usuario_actualiza: usuario };
      let hist: string | null = null;

      switch (d.accion) {
        case "cotizacion": {
          if (envio.fecha_llegada) throw bad("El servicio ya fue recibido; no se puede cambiar la cotización.");
          if (envio.fecha_devolucion) throw bad("El envío ya fue devuelto; registrá un envío nuevo.");
          if (!esUltimo) throw bad("Solo se puede cotizar el último envío del servicio.");
          const monto = d.monto_cotizacion ?? null;
          data = {
            ...data,
            cotizacion_resultado: d.resultado,
            fecha_cotizacion: parseDateOnly(d.fecha_cotizacion ?? null) ?? new Date(),
            nro_cotizacion: d.nro_cotizacion || null,
            monto_cotizacion: monto != null ? new Prisma.Decimal(monto) : null,
            moneda_cotizacion: d.moneda_cotizacion || ser.moneda || "USD",
          };
          // Prellenado para la OC: proveedor + precio unitario (si aún no hay OC).
          if (d.resultado === "ACEPTADA" && ser.po_id == null) {
            const cant = Number(ser.cantidad) > 0 ? Number(ser.cantidad) : 1;
            await tx.oTRepuesto.update({
              where: { id: ser.id },
              data: {
                proveedor_id: envio.proveedor_id ?? undefined,
                ...(monto != null
                  ? { precio_unitario: new Prisma.Decimal(monto / cant), moneda: d.moneda_cotizacion || ser.moneda || "USD" }
                  : {}),
              },
            });
          }
          hist = d.resultado === "ACEPTADA"
            ? `Cotización ACEPTADA para "${desc}" (${envio.proveedor?.razon_social ?? "proveedor"}` +
              (monto != null ? `, ${d.moneda_cotizacion || ser.moneda || "USD"} ${monto}` : "") + ")"
            : `Cotización RECHAZADA para "${desc}" (${envio.proveedor?.razon_social ?? "proveedor"})`;
          break;
        }
        case "devolucion": {
          if (envio.cotizacion_resultado !== "RECHAZADA") throw bad("La devolución solo aplica a una cotización rechazada.");
          if (envio.fecha_devolucion) throw bad("La devolución ya está registrada.");
          const f = parseDateOnly(d.fecha_devolucion);
          if (!f) throw bad("fecha_devolucion inválida");
          data = { ...data, fecha_devolucion: f, guia_devolucion: d.guia_devolucion || null };
          hist = `Componente devuelto por ${envio.proveedor?.razon_social ?? "proveedor"} ("${desc}")` +
            (d.guia_devolucion ? ` — guía ${d.guia_devolucion}` : "");
          break;
        }
        case "llegada": {
          if (envio.cotizacion_resultado !== "ACEPTADA") throw bad("La llegada solo aplica a una cotización aceptada.");
          if (envio.fecha_llegada) throw bad("La llegada ya está registrada.");
          const f = parseDateOnly(d.fecha_llegada);
          if (!f) throw bad("fecha_llegada inválida");
          data = {
            ...data,
            fecha_llegada: f,
            guia_llegada: d.guia_llegada || null,
            recibido_por: d.recibido_por || null,
            ...(d.nro_factura ? { nro_factura: d.nro_factura } : {}),
          };
          // Recepción del servicio: SER + ítems asociados quedan recibidos
          // (sin zona de almacén: llegan instalados en el componente).
          await tx.oTRepuesto.update({
            where: { id: ser.id },
            data: {
              cantidad_recibida: ser.cantidad,
              fecha_entrega_real: f,
              persona_recibe: d.recibido_por || null,
            },
          });
          for (const it of ser.servicio_items) {
            await tx.oTRepuesto.update({
              where: { id: it.id },
              data: { cantidad_recibida: it.cantidad, fecha_entrega_real: f, persona_recibe: d.recibido_por || null },
            });
          }
          hist = `Servicio "${desc}" recibido de ${envio.proveedor?.razon_social ?? "proveedor"}` +
            (d.guia_llegada ? ` — guía ${d.guia_llegada}` : "") +
            (ser.po_id == null ? " (sin OC todavía)" : "");
          break;
        }
        case "factura": {
          data = { ...data, nro_factura: d.nro_factura || null };
          break;
        }
        case "editar": {
          const f = d.fecha_salida ? parseDateOnly(d.fecha_salida) : null;
          data = {
            ...data,
            ...(f ? { fecha_salida: f } : {}),
            ...(d.guia_salida !== undefined ? { guia_salida: d.guia_salida || null } : {}),
            ...(d.guia_devolucion !== undefined ? { guia_devolucion: d.guia_devolucion || null } : {}),
            ...(d.guia_llegada !== undefined ? { guia_llegada: d.guia_llegada || null } : {}),
            ...(d.nro_cotizacion !== undefined ? { nro_cotizacion: d.nro_cotizacion || null } : {}),
            ...(d.nro_factura !== undefined ? { nro_factura: d.nro_factura || null } : {}),
            ...(d.recibido_por !== undefined ? { recibido_por: d.recibido_por || null } : {}),
            ...(d.observaciones !== undefined ? { observaciones: d.observaciones || null } : {}),
          };
          break;
        }
      }

      const updated = await tx.servicioEnvio.update({ where: { id: envioId }, data, select: SELECT_ENVIO });
      if (hist) await historialServicio(tx, ser, hist, usuario);
      if (d.accion === "llegada") await recalcularRecursosStatusDesdeRep(tx, ser);
      return serializarEnvio(updated);
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "NOT_FOUND") return NextResponse.json({ error: e.message }, { status: 404 });
    if (e.code === "BAD_REQ" || e.code === "BAD_STATE") return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PATCH /api/servicios-externos/envios/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar envío" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const usuario = await getAuditUser(req);
  if (!usuario) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const envioId = parseInt4Safe(id) ?? 0;
  if (envioId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    const envio = await prisma.servicioEnvio.findUnique({
      where: { id: envioId },
      select: {
        id: true, fecha_llegada: true, guia_salida: true, cotizacion_resultado: true,
        proveedor: { select: { razon_social: true } },
        adjuntos: { select: { r2_key: true } },
        ot_repuesto: { select: { id: true, ot_id: true, orden_trabajo_interna_id: true, descripcion: true, po_id: true, proveedor_id: true } },
      },
    });
    if (!envio) return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 });
    if (envio.fecha_llegada) {
      return NextResponse.json({ error: "El servicio ya fue recibido; no se puede eliminar el envío." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.servicioEnvio.delete({ where: { id: envioId } });
      // Si este envío había prellenado proveedor para la OC y aún no hay OC, limpiarlo.
      const rep = envio.ot_repuesto;
      if (envio.cotizacion_resultado === "ACEPTADA" && rep.po_id == null) {
        await tx.oTRepuesto.update({ where: { id: rep.id }, data: { proveedor_id: null } });
      }
      await historialServicio(
        tx, rep,
        `Envío a ${envio.proveedor?.razon_social ?? "proveedor"} eliminado ("${rep.descripcion ?? rep.id}")` +
          (envio.guia_salida ? ` — guía ${envio.guia_salida}` : ""),
        usuario,
      );
    });

    // R2 fuera de la transacción (best-effort).
    for (const a of envio.adjuntos) {
      try { await deleteObject(a.r2_key); } catch (e) { console.warn("R2 delete falló:", a.r2_key, e); }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/servicios-externos/envios/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar envío" }, { status: 500 });
  }
}

// Acciones del ciclo de un envío de servicio externo (cotización, devolución,
// llegada, factura, edición). Compartido por PATCH /envios/[id] (un envío) y
// PATCH /envios/lote (envío conjunto: la misma acción sobre varios envíos del
// lote, en una sola transacción).
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { parseDateOnly, hoyEnLima } from "./dates";
import { cargarSer, historialServicio, serializarEnvio, SELECT_ENVIO, type SerRow, type TxClient } from "./servicios-externos-server";

export const AccionCotizacion = z.object({
  accion: z.literal("cotizacion"),
  resultado: z.enum(["ACEPTADA", "RECHAZADA"]),
  fecha_cotizacion: z.string().optional().nullable(),
  nro_cotizacion: z.string().trim().max(100).optional().nullable(),
  monto_cotizacion: z.coerce.number().min(0).optional().nullable(),
  moneda_cotizacion: z.string().trim().max(10).optional().nullable(),
});
export const AccionDevolucion = z.object({
  accion: z.literal("devolucion"),
  fecha_devolucion: z.string().min(8),
  guia_devolucion: z.string().trim().max(100).optional().nullable(),
});
export const AccionLlegada = z.object({
  accion: z.literal("llegada"),
  fecha_llegada: z.string().min(8),
  guia_llegada: z.string().trim().max(100).optional().nullable(),
  recibido_por: z.string().trim().max(150).optional().nullable(),
  nro_factura: z.string().trim().max(100).optional().nullable(),
  // Otras líneas de la misma OC (requerimientos de material) que llegaron con
  // el servicio o que el proveedor usó en él: se dan por recibidas sin pasar
  // por almacén. Las que no vengan acá se reciben por Movimientos.
  lineas_oc: z.array(z.coerce.number().int().positive()).max(200).optional(),
});
export const AccionFactura = z.object({
  accion: z.literal("factura"),
  nro_factura: z.string().trim().max(100).optional().nullable(),
});
export const AccionEditar = z.object({
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
export const AccionEnvioSchema = z.discriminatedUnion("accion", [
  AccionCotizacion, AccionDevolucion, AccionLlegada, AccionFactura, AccionEditar,
]);
export type AccionEnvio = z.infer<typeof AccionEnvioSchema>;

export function errorAccion(code: "NOT_FOUND" | "BAD_REQ" | "BAD_STATE", m: string) {
  return Object.assign(new Error(m), { code });
}

// Estados finales de una línea que la recepción no pisa (mismo criterio que
// /api/movimientos/ingreso-po).
const ESTADOS_FINALES_LINEA = ["CONSUMIDO_ALMACEN", "CONSUMIDO_OC_ABIERTA", "ENTREGADO", "COMPLETO", "ANULADO"];

/**
 * La llegada es la ÚNICA recepción de un servicio (Movimientos ya no recibe
 * SER, 2026-10-20). Si las líneas ya tienen OC, se refleja ahí lo mismo que
 * haría la recepción por almacén: líneas → COMPLETO y la OC → ENTREGADO
 * (todo recibido) o INCOMPLETO. Una OC en PEND_OC no se toca: al aceptarla,
 * /compras/[id]/aceptar ya la pasa a ENTREGADO si todo estaba recibido. Si
 * la OC se crea después de la llegada, crear-oc marca las líneas COMPLETO.
 *
 * Ítems libres de la OC (solo_para_oc: los que logística detalla al armar la
 * PO, ej. la barra que el proveedor usó en el cromado): en una OC con
 * servicios son PARTE del servicio, llegan con él. Se dan por recibidos
 * cuando llegaron TODOS los SER de esa OC (no se sabe a cuál pertenece cada
 * uno si la OC agrupa varios).
 *
 * `lineasOC`: requerimientos de material de la misma OC que el usuario marcó
 * en la llegada (los usó el proveedor / llegaron con el servicio). Se reciben
 * sin movimiento de stock: nunca entran al almacén. Devuelve cuántos.
 */
async function reflejarRecepcionEnOC(
  tx: TxClient,
  lineas: { id: number; po_id: number | null }[],
  docs: { guia: string | null; factura: string | null; fecha: Date; recibe: string | null },
  lineasOC: number[] = [],
): Promise<number> {
  const conOC = lineas.filter((l) => l.po_id != null);
  if (!conOC.length) return 0;
  const poIds = [...new Set(conOC.map((l) => l.po_id!))];

  let extra = 0;
  if (lineasOC.length) {
    const reps = await tx.oTRepuesto.findMany({
      where: {
        id: { in: lineasOC }, po_id: { in: poIds },
        OR: [{ tipo_codigo: null }, { tipo_codigo: { not: "SER" } }],
        NOT: { status_oc_codigo: { in: ESTADOS_FINALES_LINEA } },
      },
      select: { id: true, po_id: true, material_id: true, cantidad: true, cantidad_recibida: true },
    });
    for (const r of reps) {
      const pendiente = new Prisma.Decimal(r.cantidad).minus(r.cantidad_recibida ?? 0);
      if (pendiente.lte(0)) continue;
      await tx.oTRepuesto.update({
        where: { id: r.id },
        data: {
          cantidad_recibida: r.cantidad, fecha_entrega_real: docs.fecha, persona_recibe: docs.recibe,
          status_oc_codigo: "COMPLETO",
          ...(docs.guia ? { nro_guia: docs.guia } : {}),
          ...(docs.factura ? { nro_factura_proveedor: docs.factura } : {}),
        },
      });
      // Material de catálogo: la línea de la OC (CompraDetalle) también queda
      // recibida para que la OC pueda cerrarse y no figure en Ingreso de PO.
      if (r.material_id != null) {
        let restante = pendiente;
        const dets = await tx.compraDetalle.findMany({
          where: { compra_id: r.po_id!, material_id: r.material_id },
          select: { id: true, cantidad: true, cantidad_recibida: true },
          orderBy: { id: "asc" },
        });
        for (const det of dets) {
          if (restante.lte(0)) break;
          const pend = new Prisma.Decimal(det.cantidad).minus(det.cantidad_recibida ?? 0);
          if (pend.lte(0)) continue;
          const a = Prisma.Decimal.min(pend, restante);
          await tx.compraDetalle.update({
            where: { id: det.id },
            data: { cantidad_recibida: new Prisma.Decimal(det.cantidad_recibida ?? 0).plus(a) },
          });
          restante = restante.minus(a);
        }
      }
      extra++;
    }
  }

  await tx.oTRepuesto.updateMany({
    where: { id: { in: conOC.map((l) => l.id) }, NOT: { status_oc_codigo: { in: ESTADOS_FINALES_LINEA } } },
    data: {
      status_oc_codigo: "COMPLETO",
      ...(docs.guia ? { nro_guia: docs.guia } : {}),
      ...(docs.factura ? { nro_factura_proveedor: docs.factura } : {}),
    },
  });
  const lineaCompleta = (x: { cantidad: unknown; cantidad_recibida: unknown }) =>
    Number(x.cantidad_recibida ?? 0) >= Number(x.cantidad) - 0.0001;
  for (const poId of poIds) {
    const compra = await tx.compra.findUnique({
      where: { id: poId },
      select: { status_oc_codigo: true, nro_guia: true, nro_factura: true },
    });
    const sers = await tx.oTRepuesto.findMany({
      where: { po_id: poId, tipo_codigo: "SER" },
      select: { cantidad: true, cantidad_recibida: true },
    });
    if (sers.length > 0 && sers.every(lineaCompleta)) {
      await tx.$executeRawUnsafe(
        `UPDATE ot_repuestos
            SET cantidad_recibida = cantidad, fecha_entrega_real = $2, persona_recibe = $3,
                status_oc_codigo = 'COMPLETO'
          WHERE po_id = $1 AND solo_para_oc = true AND (tipo_codigo IS NULL OR tipo_codigo <> 'SER')
            AND (status_oc_codigo IS NULL OR status_oc_codigo NOT IN ('CONSUMIDO_ALMACEN','CONSUMIDO_OC_ABIERTA','ENTREGADO','COMPLETO','ANULADO'))`,
        poId, docs.fecha, docs.recibe,
      );
    }
    if (!compra || !["PROCESO", "INCOMPLETO"].includes(compra.status_oc_codigo ?? "")) continue;
    const [detalles, reqs] = await Promise.all([
      tx.compraDetalle.findMany({ where: { compra_id: poId }, select: { cantidad: true, cantidad_recibida: true } }),
      tx.oTRepuesto.findMany({ where: { po_id: poId }, select: { cantidad: true, cantidad_recibida: true } }),
    ]);
    const todo = detalles.every(lineaCompleta) && reqs.every(lineaCompleta);
    await tx.compra.update({
      where: { id: poId },
      data: {
        status_oc_codigo: todo ? "ENTREGADO" : "INCOMPLETO",
        ...(todo ? { fecha_entrega_real: new Date() } : {}),
        // Guía/factura de la llegada: solo si la OC todavía no tiene una.
        ...(docs.guia && !compra.nro_guia ? { nro_guia: docs.guia } : {}),
        ...(docs.factura && !compra.nro_factura ? { nro_factura: docs.factura } : {}),
      },
    });
  }
  return extra;
}

type CompraParaEnvio = {
  numero_po: string;
  proveedor_id: number | null;
  fecha_aprobacion: Date | null;
  fecha_solicitud: Date | null;
  moneda_codigo: string | null;
} | null;

/** Envío ya aceptado con el proveedor de la OC (el SER nunca salió por el seguimiento, o volvió rechazado). */
async function crearEnvioAceptadoPorOC(
  tx: TxClient,
  ser: SerRow,
  compra: CompraParaEnvio,
  fecha: Date,
  observaciones: string,
  usuario: string,
  loteId: string | null = null,
): Promise<number> {
  const envio = await tx.servicioEnvio.create({
    data: {
      ot_repuesto_id: ser.id,
      proveedor_id: compra?.proveedor_id ?? ser.proveedor_id ?? null,
      lote_id: loteId,
      fecha_salida: compra?.fecha_aprobacion ?? compra?.fecha_solicitud ?? fecha,
      cotizacion_resultado: "ACEPTADA",
      fecha_cotizacion: compra?.fecha_aprobacion ?? compra?.fecha_solicitud ?? fecha,
      moneda_cotizacion: compra?.moneda_codigo ?? ser.moneda ?? "USD",
      observaciones,
      usuario_crea: usuario,
      usuario_actualiza: usuario,
    },
    select: { id: true },
  });
  return envio.id;
}

/**
 * Deja el SER listo para registrar la llegada y devuelve el envío a usar.
 * Si hay OC, la cotización ya fue aceptada (acordado 2026-10-20), así que:
 *  - sin envíos (nunca salió por el seguimiento), o el último fue rechazado
 *    (Devuelto: se le compró a otro proveedor sin registrar envío nuevo) →
 *    crea el envío con el proveedor de la OC y la cotización ACEPTADA;
 *  - último envío todavía en cotización → lo marca ACEPTADA.
 * Sin OC, exige lo de siempre: un envío con cotización aceptada.
 * `loteId`: los SER de la misma OC que se reciben juntos comparten envío
 * conjunto (ver /api/servicios-externos/llegada).
 * Desde 2026-10-23 crear-oc ya alinea el seguimiento (ver
 * alinearSeguimientoConOC); esto queda para OCs anteriores a ese cambio.
 */
export async function prepararEnvioParaLlegada(
  tx: TxClient,
  ser: SerRow,
  fechaLlegada: string,
  usuario: string,
  loteId: string | null = null,
): Promise<number> {
  const desc = ser.descripcion ?? `Item ${ser.id}`;
  const ultimo = ser.servicio_envios.length ? ser.servicio_envios.reduce((a, b) => (b.id > a.id ? b : a)) : null;
  if (ser.po_id == null) {
    if (!ultimo) throw errorAccion("BAD_STATE", `${desc}: no tiene seguimiento (no salió a proveedor).`);
    return ultimo.id;
  }
  const compra = await tx.compra.findUnique({
    where: { id: ser.po_id },
    select: { numero_po: true, proveedor_id: true, fecha_aprobacion: true, fecha_solicitud: true, moneda_codigo: true },
  });
  if (!ultimo || ultimo.cotizacion_resultado === "RECHAZADA") {
    const f = parseDateOnly(fechaLlegada) ?? new Date();
    return crearEnvioAceptadoPorOC(tx, ser, compra, f, ultimo
      ? `Creado al registrar la llegada: la cotización anterior fue rechazada y el servicio se compró con la OC ${compra?.numero_po ?? ""}.`
      : `Creado al registrar la llegada: el servicio ya tenía OC ${compra?.numero_po ?? ""} sin seguimiento previo.`, usuario, loteId);
  }
  if (ultimo.cotizacion_resultado == null && !ultimo.fecha_devolucion && !ultimo.fecha_llegada) {
    await aplicarAccionEnvio(tx, ultimo.id, { accion: "cotizacion", resultado: "ACEPTADA", fecha_cotizacion: fechaLlegada }, usuario);
  }
  return ultimo.id;
}

/**
 * Al GENERAR la OC de un SER (crear-oc). Si existe OC, la cotización ya fue
 * aceptada (acordado 2026-10-23), así que el seguimiento se alinea solo y el
 * servicio queda Incompleto (en trabajo) a la espera de la llegada:
 *  - sin envíos (nunca se generó seguimiento), o último envío rechazado →
 *    crea el envío con el proveedor de la OC y cotización ACEPTADA;
 *  - último envío todavía en cotización → lo marca ACEPTADA;
 *  - ya aceptado o recibido → no hace nada.
 * `loteId`: los envíos creados para los SER de una misma OC comparten lote
 * (un solo seguimiento conjunto, no uno por servicio — fix 2026-10-29).
 * Devuelve qué hizo (para el mensaje al usuario). Deja historial en la OT.
 * NO recalcula recursos_status (lo hace crear-oc por OT).
 */
export async function alinearSeguimientoConOC(
  tx: TxClient,
  serId: number,
  compra: { id: number; numero_po: string },
  usuario: string,
  loteId: string | null = null,
): Promise<"creado" | "aceptado" | null> {
  const ser = await cargarSer(tx, serId);
  if (!ser || ser.po_id !== compra.id) return null;
  const ultimo = ser.servicio_envios.length ? ser.servicio_envios.reduce((a, b) => (b.id > a.id ? b : a)) : null;
  if (ultimo && ultimo.cotizacion_resultado === "ACEPTADA") return null;
  if (ultimo && ultimo.cotizacion_resultado == null && (ultimo.fecha_devolucion || ultimo.fecha_llegada)) return null;
  const datosCompra = await tx.compra.findUnique({
    where: { id: compra.id },
    select: {
      numero_po: true, proveedor_id: true, fecha_aprobacion: true, fecha_solicitud: true, moneda_codigo: true,
      proveedor: { select: { razon_social: true } },
    },
  });
  const desc = ser.descripcion ?? `Item ${ser.id}`;
  const prov = datosCompra?.proveedor?.razon_social ?? "proveedor";
  if (!ultimo || ultimo.cotizacion_resultado === "RECHAZADA") {
    await crearEnvioAceptadoPorOC(tx, ser, datosCompra, hoyEnLima(), ultimo
      ? `Creado al generar la OC ${compra.numero_po}: la cotización anterior fue rechazada y el servicio se compró con esta OC.`
      : `Creado al generar la OC ${compra.numero_po}: el servicio no tenía seguimiento (si hay OC, la cotización ya fue aceptada).`, usuario, loteId);
    await historialServicio(tx, ser, `Seguimiento de "${desc}" creado al generar la OC ${compra.numero_po}: cotización ACEPTADA (${prov})`, usuario);
    return "creado";
  }
  // En cotización → aceptada (la OC es la cotización aceptada).
  await aplicarAccionEnvio(tx, ultimo.id, { accion: "cotizacion", resultado: "ACEPTADA", fecha_cotizacion: null }, usuario);
  await tx.servicioEnvio.update({
    where: { id: ultimo.id },
    data: {
      observaciones: [ultimo.observaciones, `Cotización aceptada al generar la OC ${compra.numero_po}.`].filter(Boolean).join("\n"),
    },
  });
  return "aceptado";
}

/**
 * Aplica una acción a un envío. Valida la etapa, actualiza el envío (y el SER
 * cuando corresponde: prellenado de OC al aceptar, recepción al llegar) y
 * deja historial en la OT. NO recalcula recursos_status: lo hace el llamador
 * (una vez por OT) cuando la acción es "llegada".
 */
export async function aplicarAccionEnvio(
  tx: TxClient,
  envioId: number,
  d: AccionEnvio,
  usuario: string,
): Promise<{ envio: ReturnType<typeof serializarEnvio>; ser: SerRow }> {
  const envio = await tx.servicioEnvio.findUnique({ where: { id: envioId }, select: SELECT_ENVIO });
  if (!envio) throw errorAccion("NOT_FOUND", "Envío no encontrado");
  const ser = await cargarSer(tx, envio.ot_repuesto_id);
  if (!ser) throw errorAccion("BAD_REQ", "Requerimiento del envío no es un servicio");
  const ultimo = ser.servicio_envios.reduce((a, b) => (b.id > a.id ? b : a));
  const esUltimo = ultimo.id === envio.id;
  const desc = ser.descripcion ?? `Item ${ser.id}`;
  const bad = (m: string) => errorAccion("BAD_STATE", `${desc}: ${m}`);

  let data: Prisma.ServicioEnvioUpdateInput = { usuario_actualiza: usuario };
  let hist: string | null = null;

  switch (d.accion) {
    case "cotizacion": {
      if (envio.fecha_llegada) throw bad("el servicio ya fue recibido; no se puede cambiar la cotización.");
      if (envio.fecha_devolucion) throw bad("el envío ya fue devuelto; registrá un envío nuevo.");
      if (!esUltimo) throw bad("solo se puede cotizar el último envío del servicio.");
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
      if (envio.cotizacion_resultado !== "RECHAZADA") throw bad("la devolución solo aplica a una cotización rechazada.");
      if (envio.fecha_devolucion) throw bad("la devolución ya está registrada.");
      const f = parseDateOnly(d.fecha_devolucion);
      if (!f) throw bad("fecha_devolucion inválida");
      data = { ...data, fecha_devolucion: f, guia_devolucion: d.guia_devolucion || null };
      hist = `Componente devuelto por ${envio.proveedor?.razon_social ?? "proveedor"} ("${desc}")` +
        (d.guia_devolucion ? ` — guía ${d.guia_devolucion}` : "");
      break;
    }
    case "llegada": {
      if (envio.cotizacion_resultado !== "ACEPTADA") throw bad("la llegada solo aplica a una cotización aceptada.");
      if (envio.fecha_llegada) throw bad("la llegada ya está registrada.");
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
      const conServicio = await reflejarRecepcionEnOC(tx, [ser, ...ser.servicio_items], {
        guia: d.guia_llegada || null,
        factura: d.nro_factura || null,
        fecha: f,
        recibe: d.recibido_por || null,
      }, d.lineas_oc ?? []);
      hist = `Servicio "${desc}" recibido de ${envio.proveedor?.razon_social ?? "proveedor"}` +
        (d.guia_llegada ? ` — guía ${d.guia_llegada}` : "") +
        (ser.po_id == null ? " (sin OC todavía)" : "") +
        (conServicio > 0 ? ` — ${conServicio} ítem(s) de la OC recibidos con el servicio` : "");
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
  return { envio: serializarEnvio(updated), ser };
}

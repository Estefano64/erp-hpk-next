import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { resolverPrecioSalida } from "@/lib/inventario";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  requerimiento_ids: z.array(z.coerce.number().int().positive()).min(1),
  fecha_despacho: z.string().optional().nullable(),
  persona_recibe: z.string().trim().max(150).optional().nullable(),
  comentarios: z.string().trim().max(500).optional().nullable(),
});

// POST /api/despachos/ot/[id]
// Despacha bulk un conjunto de requerimientos de una OT, descontando de almacén.
// Itera la misma lógica de `consumir-de-almacen` por cada item dentro de una transacción.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const otId = Number(id);
    if (!Number.isFinite(otId)) {
      return NextResponse.json({ error: "OT inválida" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "Logistica";
    // Datos del despacho (default a hoy si no vienen).
    const fechaDespacho = parsed.data.fecha_despacho
      ? new Date(parsed.data.fecha_despacho + "T00:00:00")
      : new Date();
    const personaRecibe = parsed.data.persona_recibe?.trim() || null;
    const comentariosBulk = parsed.data.comentarios?.trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      const ok: number[] = [];
      const errores: { id: number; error: string }[] = [];

      const parciales: number[] = [];

      for (const reqId of parsed.data.requerimiento_ids) {
        const rep = await tx.oTRepuesto.findUnique({ where: { id: reqId } });
        if (!rep) { errores.push({ id: reqId, error: "No encontrado" }); continue; }
        if (rep.ot_id !== otId) { errores.push({ id: reqId, error: "Pertenece a otra OT" }); continue; }
        if (rep.status_requerimiento_codigo !== "APROBADO") { errores.push({ id: reqId, error: "No está APROBADO" }); continue; }

        const cantTotal = new Prisma.Decimal(rep.cantidad);
        const yaDespachado = new Prisma.Decimal(rep.cantidad_recibida ?? 0);
        const pendiente = cantTotal.minus(yaDespachado);
        if (pendiente.lte(0)) { errores.push({ id: reqId, error: "Ya despachado completo" }); continue; }

        // Items FREE (sin material_id): se despachan directo a la OT sin
        // tocar stock ni MovimientoInventario (no hay material catálogo). La
        // cantidad "ya recibida" debe venir desde la OC asociada — si la OC
        // todavía no se recibió, no hay nada para despachar.
        if (!rep.material_id) {
          // El "stock disponible" para un item free es lo que llegó vía OC
          // menos lo ya despachado a la OT. Como reusamos cantidad_recibida
          // para ambas cosas, asumimos que si pendiente > 0 hay para despachar
          // (la OC ya fue recibida total o parcialmente).
          // Si la OC no se recibió, status_oc del rep no sería ENTREGADO o
          // INCOMPLETO y cantidad_recibida=0 → pendiente=cantTotal pero el
          // user en la UI no podría seleccionarlo (el listado lo marca
          // "sin OC recibida"). Acá igual lo procesamos: despachar=pendiente.
          const aDespachar = pendiente;
          const nuevaDespachada = yaDespachado.plus(aDespachar);
          const quedaCompleto = nuevaDespachada.gte(cantTotal);
          const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
          const etiqueta = quedaCompleto ? "completo" : `parcial (${aDespachar} de ${pendiente} pendiente)`;
          await tx.oTRepuesto.update({
            where: { id: rep.id },
            data: {
              status_oc_codigo: quedaCompleto ? "ENTREGADO" : "INCOMPLETO",
              cantidad_recibida: nuevaDespachada,
              fecha_entrega_real: quedaCompleto ? fechaDespacho : rep.fecha_entrega_real,
              fecha_salida_almacen: fechaDespacho,
              observaciones: `${obsPrev}Despacho a OT (item free, sin stock) el ${fechaDespacho.toLocaleDateString("es-PE")} — ${etiqueta} (${usuario})${personaRecibe ? ` — recibe: ${personaRecibe}` : ""}${comentariosBulk ? ` · ${comentariosBulk}` : ""}`,
            },
          });
          if (quedaCompleto) ok.push(rep.id);
          else parciales.push(rep.id);
          continue;
        }

        // ─── Items MAC (con material catálogo): flujo normal ──────────
        const material = await tx.material.findUnique({ where: { material_id: rep.material_id } });
        if (!material) { errores.push({ id: reqId, error: "Material no encontrado" }); continue; }

        const stock = new Prisma.Decimal(material.stock_actual ?? 0);
        if (stock.lte(0)) {
          errores.push({ id: reqId, error: `Sin stock en almacén` });
          continue;
        }
        // Despacho PARCIAL o COMPLETO: lo que se pueda con el stock disponible.
        const aDespachar = Prisma.Decimal.min(pendiente, stock);
        const nuevaDespachada = yaDespachado.plus(aDespachar);
        const quedaCompleto = nuevaDespachada.gte(cantTotal);

        // Snapshot del precio al momento de la salida.
        const { precio: precioSnap, moneda: monedaSnap } = await resolverPrecioSalida(tx, rep.material_id);

        // Observación con cabecera de bulk + detalle item.
        const obsItem = `Despacho a OT — REQ ${rep.nro_req ?? rep.id}/${rep.item_req ?? "-"}${quedaCompleto ? "" : " (parcial)"}`;
        const observacionFinal = comentariosBulk
          ? `${comentariosBulk} · ${obsItem}`
          : obsItem;

        // Movimiento SALIDA
        await tx.movimientoInventario.create({
          data: {
            material_id: rep.material_id,
            tipo_movimiento: "SALIDA",
            cantidad: aDespachar,
            precio_unitario: precioSnap,
            moneda: monedaSnap,
            persona_recibe: personaRecibe,
            fecha_movimiento: fechaDespacho,
            documento_referencia: rep.nro_req ? `REQ-${rep.nro_req}` : `REQ-${rep.id}`,
            observacion: observacionFinal,
            usuario,
          },
        });
        // Decrementar stock
        await tx.material.update({
          where: { material_id: rep.material_id },
          data: { stock_actual: { decrement: aDespachar } },
        });
        // Marcar requerimiento: ENTREGADO si se completó, INCOMPLETO si fue parcial.
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        const etiqueta = quedaCompleto ? "completo" : `parcial (${aDespachar} de ${pendiente} pendiente)`;
        await tx.oTRepuesto.update({
          where: { id: rep.id },
          data: {
            status_oc_codigo: quedaCompleto ? "ENTREGADO" : "INCOMPLETO",
            cantidad_recibida: nuevaDespachada,
            fecha_entrega_real: quedaCompleto ? fechaDespacho : rep.fecha_entrega_real,
            fecha_salida_almacen: fechaDespacho,
            observaciones: `${obsPrev}Despacho desde almacén el ${fechaDespacho.toLocaleDateString("es-PE")} — ${etiqueta} (${usuario})${personaRecibe ? ` — recibe: ${personaRecibe}` : ""}${comentariosBulk ? ` · ${comentariosBulk}` : ""}`,
          },
        });
        if (quedaCompleto) ok.push(rep.id);
        else parciales.push(rep.id);
      }

      // Historial único por la operación
      const totalDespachado = ok.length + parciales.length;
      if (totalDespachado > 0) {
        const descBase = `Despacho desde almacén a la OT: ${ok.length} completo(s), ${parciales.length} parcial(es)`;
        const descExtra = [
          fechaDespacho ? `fecha ${fechaDespacho.toLocaleDateString("es-PE")}` : null,
          personaRecibe ? `recibe ${personaRecibe}` : null,
          comentariosBulk ? `coment.: ${comentariosBulk}` : null,
        ].filter(Boolean).join(" · ");
        await tx.oTHistorial.create({
          data: {
            ot_id: otId,
            tipo_operacion: "DESPACHO_OT",
            descripcion: descExtra ? `${descBase} — ${descExtra}` : descBase,
            usuario,
            datos_adicionales: JSON.stringify({
              completos: ok,
              parciales,
              fecha_despacho: fechaDespacho.toISOString(),
              persona_recibe: personaRecibe,
              comentarios: comentariosBulk,
            }),
          },
        });
      }

      return { ok, parciales, errores };
    });

    const partes: string[] = [];
    if (result.ok.length) partes.push(`${result.ok.length} completo(s)`);
    if (result.parciales.length) partes.push(`${result.parciales.length} parcial(es)`);
    if (result.errores.length) partes.push(`${result.errores.length} error(es)`);
    return NextResponse.json({
      message: `Despacho: ${partes.join(", ") || "sin cambios"}.`,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/despachos/ot/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Error al despachar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

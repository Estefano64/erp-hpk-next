import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { resolverPrecioSalida } from "@/lib/inventario";
import { recalcularRecursosStatusOT } from "@/lib/recursos-ot";

import { parseInt4Safe } from "@/lib/ot-formato";
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
    const otId = parseInt4Safe(id) ?? 0;
    if (otId == null) {
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

        // Items FREE (sin material_id): se despachan directo a la OT sin
        // tocar stock ni MovimientoInventario (no hay material catálogo).
        //
        // Caso especial: ingreso-po ya incrementa cantidad_recibida cuando
        // el item arriba a HPK. Si pendiente=0 pero el item AÚN no se
        // entregó al técnico (status_oc != ENTREGADO), igual lo procesamos:
        // solo cambiamos status_oc a ENTREGADO sin tocar cantidad_recibida
        // (ya está al máximo). Antes el endpoint erraba "Ya despachado
        // completo" y el item nunca se cerraba — quedaba fantasma en PROCESO.
        if (!rep.material_id) {
          const yaEntregadoAlTecnico = rep.status_oc_codigo === "ENTREGADO";
          if (pendiente.lte(0) && yaEntregadoAlTecnico) {
            errores.push({ id: reqId, error: "Ya despachado completo" });
            continue;
          }
          const aDespachar = pendiente.gt(0) ? pendiente : new Prisma.Decimal(0);
          const nuevaDespachada = yaDespachado.plus(aDespachar);
          const quedaCompleto = nuevaDespachada.gte(cantTotal);
          const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
          const etiqueta = aDespachar.gt(0)
            ? (quedaCompleto ? "completo" : `parcial (${aDespachar} de ${pendiente} pendiente)`)
            : "ya recibido en almacén — solo cierre de despacho";
          await tx.oTRepuesto.update({
            where: { id: rep.id },
            data: {
              status_oc_codigo: quedaCompleto ? "ENTREGADO" : "INCOMPLETO",
              cantidad_recibida: nuevaDespachada,
              fecha_entrega_real: quedaCompleto ? fechaDespacho : rep.fecha_entrega_real,
              fecha_salida_almacen: fechaDespacho,
              observaciones: `${obsPrev}Despacho a OT (item free) el ${fechaDespacho.toLocaleDateString("es-PE")} — ${etiqueta} (${usuario})${personaRecibe ? ` — recibe: ${personaRecibe}` : ""}${comentariosBulk ? ` · ${comentariosBulk}` : ""}`,
            },
          });
          if (quedaCompleto) ok.push(rep.id);
          else parciales.push(rep.id);
          continue;
        }

        // De acá en adelante son items MAC. Para items YA CONSUMIDOS
        // (CONSUMIDO_ALMACEN / CONSUMIDO_OC_ABIERTA) NO bloqueamos por
        // pendiente=0 — esos casos legacy se cierran formalmente abajo
        // sin tocar cantidad_recibida. Para items MAC normales sí: si
        // pendiente=0 ya está despachado.
        const esYaConsumido = rep.status_oc_codigo === "CONSUMIDO_ALMACEN" || rep.status_oc_codigo === "CONSUMIDO_OC_ABIERTA";
        if (pendiente.lte(0) && !esYaConsumido) { errores.push({ id: reqId, error: "Ya despachado completo" }); continue; }

        // ─── Items MAC (con material catálogo): flujo normal ──────────
        const material = await tx.material.findUnique({ where: { material_id: rep.material_id } });
        if (!material) { errores.push({ id: reqId, error: "Material no encontrado" }); continue; }

        // Si el item ya fue consumido (CONSUMIDO_ALMACEN o CONSUMIDO_OC_ABIERTA),
        // el "stock" ya salió en su flujo previo:
        //   - CONSUMIDO_ALMACEN     → decremento real de Material.stock_actual
        //                             + movimiento SALIDA registrado.
        //   - CONSUMIDO_OC_ABIERTA  → consumo del stock fijo de la OC abierta
        //                             (CompraDetalle.cantidad_recibida) — no hay
        //                             material en catálogo que tocar.
        // En ambos casos el despacho actual SOLO entrega al técnico: actualiza
        // cantidad_recibida + status_oc del OTRepuesto. No toca stock ni crea
        // movimiento (eso ya pasó).
        const statusPrevio = rep.status_oc_codigo;
        const yaConsumido = statusPrevio === "CONSUMIDO_ALMACEN" || statusPrevio === "CONSUMIDO_OC_ABIERTA";
        if (yaConsumido) {
          // Caso legacy: pendiente=0 pero el item NO fue formalmente entregado
          // (status sigue siendo CONSUMIDO_*, no ENTREGADO). Solo cerramos:
          // ENTREGADO sin tocar cantidad_recibida (ya está al máximo). Antes
          // el endpoint erraba "Ya despachado completo" — ahora lo aceptamos.
          const aDespachar = pendiente.gt(0) ? pendiente : new Prisma.Decimal(0);
          const nuevaDespachada = yaDespachado.plus(aDespachar);
          const quedaCompleto = nuevaDespachada.gte(cantTotal);
          const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
          const etiqueta = aDespachar.gt(0)
            ? (quedaCompleto ? "completo" : `parcial (${aDespachar} de ${pendiente} pendiente)`)
            : "cierre formal — stock ya entregado en consumo previo";
          const fuente = statusPrevio === "CONSUMIDO_OC_ABIERTA" ? "OC abierta" : "almacén";
          await tx.oTRepuesto.update({
            where: { id: rep.id },
            data: {
              // Si quedó completo → ENTREGADO. Si parcial → preserva el status
              // previo (CONSUMIDO_ALMACEN o CONSUMIDO_OC_ABIERTA) para que
              // siga apareciendo en despachos hasta que se complete.
              status_oc_codigo: quedaCompleto ? "ENTREGADO" : statusPrevio,
              cantidad_recibida: nuevaDespachada,
              fecha_entrega_real: quedaCompleto ? fechaDespacho : rep.fecha_entrega_real,
              fecha_salida_almacen: rep.fecha_salida_almacen ?? fechaDespacho,
              observaciones: `${obsPrev}Entregado al técnico desde ${fuente} el ${fechaDespacho.toLocaleDateString("es-PE")} — ${etiqueta} (${usuario})${personaRecibe ? ` — recibe: ${personaRecibe}` : ""}${comentariosBulk ? ` · ${comentariosBulk}` : ""}`,
            },
          });
          if (quedaCompleto) ok.push(rep.id);
          else parciales.push(rep.id);
          continue;
        }

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

      // Auto-update recursos_status de la OT (el despacho es la última
      // etapa logística — todos los items ENTREGADOS = Recursos completos).
      await recalcularRecursosStatusOT(tx, otId);

      return { ok, parciales, errores };
    }, {
      // El despacho bulk puede tocar muchos items (cada uno con findUnique,
      // updates, movimiento, etc.). El timeout default de 5s no alcanza
      // cuando se despachan 8+ items de golpe — Prisma corta la TX y tira
      // "Transaction not found / Transaction ID is invalid". Subimos a 30s
      // con maxWait holgado para no fallar bajo carga.
      maxWait: 10_000,
      timeout: 30_000,
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

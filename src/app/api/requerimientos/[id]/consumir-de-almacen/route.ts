import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { resolverPrecioSalida } from "@/lib/inventario";
import { recalcularRecursosStatusDesdeRep } from "@/lib/recursos-ot";
import { calcularStockReservado } from "@/lib/stock-reservado";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  cantidad: z.coerce.number().positive().optional(),
  usuario: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
  // Zona y posición físicas donde se ubica el material al sacarlo de almacén.
  // OBLIGATORIAS por decisión del usuario — sin esto el req no se puede
  // marcar como consumido (asegura trazabilidad).
  almacen_zona_id: z.coerce.number().int().positive(),
  almacen_posicion_id: z.coerce.number().int().positive().optional().nullable(),
});

// POST /api/requerimientos/[id]/consumir-de-almacen
// Marca el requerimiento como satisfecho desde el stock interno:
//   - Valida que tiene material_id, no está ya en una OC y no está anulado.
//   - Valida que hay stock suficiente.
//   - Crea MovimientoInventario tipo SALIDA con la cantidad.
//   - Decrementa Material.stock_actual.
//   - Marca el OTRepuesto como ENTREGADO (status_oc_codigo) y deja constancia
//     en observaciones para indicar que el flujo fue "consumir de almacén".
//   - Registra entrada en OTHistorial.
// Todo en una transacción.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    // Firma: la persona logueada; el `usuario` del body queda como respaldo.
    const usuario = (await getAuditUser(req)) || parsed.data.usuario || "Logistica";

    // ── Lecturas y validaciones FUERA de la transacción ──────────────────
    // La transacción interactiva tiene timeout (5 s default) y cada query
    // dentro es un viaje a la BD en serie; con ~10 viajes llegaba a P2028 en
    // prod. Las validaciones son de solo lectura y no necesitan la
    // transacción: la consistencia real la garantizan las guardas atómicas
    // de adentro (updateMany condicionales).
    const rep = await prisma.oTRepuesto.findUnique({ where: { id: (parseInt4Safe(id) ?? 0) } });
    if (!rep) {
      throw Object.assign(new Error("Requerimiento no encontrado"), { code: "NOT_FOUND" });
    }
    if (!rep.material_id) {
      throw Object.assign(
        new Error("El requerimiento no tiene material asignado, no se puede consumir de almacén."),
        { code: "NO_MATERIAL" },
      );
    }
    if (rep.po_id || rep.nro_oc) {
      throw Object.assign(
        new Error("El requerimiento ya está asignado a una OC, no se puede consumir de almacén."),
        { code: "HAS_OC" },
      );
    }
    // Bloqueo total: estados donde el req ya esta cerrado. Sin esto, un req
    // consumido completamente (CONSUMIDO_ALMACEN) podia volverse a consumir
    // porque los otros guards no lo cubrian — el operario podia drenar stock
    // varias veces sobre el mismo item.
    const ESTADOS_CERRADOS = new Set([
      "ANULADO",
      "DEVOLUCION",
      "CONSUMIDO_ALMACEN",
      "CONSUMIDO_OC_ABIERTA",
      "ENTREGADO",
      "COMPLETO",
    ]);
    if (rep.status_oc_codigo && ESTADOS_CERRADOS.has(rep.status_oc_codigo)) {
      throw Object.assign(
        new Error(`Este requerimiento ya fue procesado (estado: ${rep.status_oc_codigo}). No se puede consumir de almacén otra vez.`),
        { code: "INVALID_STATE" },
      );
    }
    // Ademas, un req solo puede consumirse si esta APROBADO. Bloquea sacar
    // stock por items en BORRADOR / SIN_APROBACION / DESAPROBADO (consistente
    // con la nueva regla del catalogo).
    const sr = rep.status_requerimiento_codigo;
    if (sr !== "APROBADO") {
      throw Object.assign(
        new Error(`No se puede consumir de almacén: el requerimiento está en estado ${sr ?? "sin aprobación"} y debe estar APROBADO.`),
        { code: "NOT_APPROVED" },
      );
    }
    // Copia local ya narrowed a number (el check de arriba no sobrevive al closure de la tx).
    const materialId = rep.material_id;

    const material = await prisma.material.findUnique({ where: { material_id: materialId } });
    if (!material) {
      throw Object.assign(new Error("Material no encontrado"), { code: "MATERIAL_NOT_FOUND" });
    }

    // Cantidad a consumir: por defecto la pedida; si el cliente envía una menor, se permite parcial.
    const cantPedida = new Prisma.Decimal(rep.cantidad);
    const cantidad = parsed.data.cantidad != null
      ? new Prisma.Decimal(parsed.data.cantidad)
      : cantPedida;

    if (cantidad.lte(0)) {
      throw Object.assign(new Error("La cantidad debe ser mayor a 0"), { code: "BAD_QTY" });
    }
    if (cantidad.gt(cantPedida)) {
      throw Object.assign(
        new Error(`La cantidad (${cantidad}) excede la pedida (${cantPedida}).`),
        { code: "OVER_QTY" },
      );
    }

    const stockActual = new Prisma.Decimal(material.stock_actual ?? 0);
    // El stock físico incluye material que ya llegó de una OC y espera en
    // almacén asignado a otra OT (recibido, pendiente de despacho al
    // técnico). Ese saldo NO se puede tomar acá: consumirlo dejaba a la OT
    // dueña sin su repuesto. Ver src/lib/stock-reservado.ts.
    const reserva = (await calcularStockReservado(prisma, [materialId])).get(materialId);
    const reservado = new Prisma.Decimal(reserva?.cantidad ?? 0);
    const libre = Prisma.Decimal.max(0, stockActual.minus(reservado));
    if (libre.lt(cantidad)) {
      const detalle = reservado.gt(0)
        ? ` Hay ${stockActual} en almacén pero ${reservado} están reservados a ${reserva?.ots?.length ? reserva.ots.join(", ") : "otras OTs"}.`
        : "";
      throw Object.assign(
        new Error(`Stock libre insuficiente. Disponible: ${libre}, requerido: ${cantidad}.${detalle}`),
        { code: "NO_STOCK" },
      );
    }

    // Snapshot del precio al momento de la salida (cascada catálogo → última OC).
    const { precio: precioSnap, moneda: monedaSnap } = await resolverPrecioSalida(prisma, materialId);

    const result = await prisma.$transaction(async (tx) => {
      // Guarda atómica 1: descontar stock SOLO si sigue alcanzando. Si otro
      // consumo simultáneo lo bajó entre la validación y acá, count = 0 y se
      // aborta (antes ese caso podía descontar de más).
      // El piso incluye el reservado: el stock no puede bajar de lo que ya
      // tiene dueño, aunque físicamente esté en el almacén.
      const minimoRequerido = cantidad.plus(reservado);
      const decremento = await tx.material.updateMany({
        where: { material_id: materialId, stock_actual: { gte: minimoRequerido } },
        data: { stock_actual: { decrement: cantidad } },
      });
      if (decremento.count === 0) {
        throw Object.assign(
          new Error(`Stock libre insuficiente. Requerido: ${cantidad}${reservado.gt(0) ? ` (${reservado} reservados a otras OTs)` : ""}.`),
          { code: "NO_STOCK" },
        );
      }

      // 1) Crear movimiento SALIDA.
      await tx.movimientoInventario.create({
        data: {
          material_id: materialId,
          tipo_movimiento: "SALIDA",
          cantidad,
          precio_unitario: precioSnap,
          moneda: monedaSnap,
          documento_referencia: rep.nro_req ? `REQ-${rep.nro_req}` : `REQ-${rep.id}`,
          observacion:
            parsed.data.observacion
            || `Consumo de almacén — REQ ${rep.nro_req ?? rep.id} item ${rep.item_req ?? ""}`,
          usuario,
        },
      });

      // 2) El decremento de stock ya se hizo arriba (guarda atómica).

      // 3) Marcar el requerimiento. Si fue completo, status pasa a
      //    CONSUMIDO_ALMACEN (estado intermedio: stock ya salió pero aún no
      //    se entregó al técnico). El despacho final al técnico se hace en
      //    /despachos y ahí pasa a ENTREGADO. Por eso NO incrementamos
      //    `cantidad_recibida` ni seteamos `fecha_entrega_real` acá — eso
      //    lo hace el módulo Despachos cuando se confirma la entrega al técnico.
      //    Si fue parcial, decrementar la cantidad y dejar el resto pendiente.
      //    En AMBOS casos se persiste la zona/posición física del consumo.
      let nuevoEstado: string;
      const updateData: Prisma.OTRepuestoUncheckedUpdateInput = {
        almacen_zona_id: parsed.data.almacen_zona_id,
        almacen_posicion_id: parsed.data.almacen_posicion_id ?? null,
      };
      if (cantidad.equals(cantPedida)) {
        nuevoEstado = "CONSUMIDO_ALMACEN";
        updateData.status_oc_codigo = nuevoEstado;
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        updateData.observaciones = `${obsPrev}Consumido de almacén el ${new Date().toLocaleDateString("es-PE")} (${usuario}) — pendiente despacho al técnico`;
      } else {
        // Consumo parcial: reducir la cantidad pedida y mantener el item pendiente para otro destino.
        nuevoEstado = rep.status_oc_codigo ?? "PEND_OC";
        updateData.cantidad = cantPedida.minus(cantidad);
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        updateData.observaciones = `${obsPrev}Consumo parcial de almacén: ${cantidad} u. el ${new Date().toLocaleDateString("es-PE")} (${usuario}) — pendiente despacho al técnico`;
      }
      // Guarda atómica 2: aplicar SOLO si el req sigue como lo leímos (sin OC
      // y en el mismo estado) — corta el doble-click / doble consumo.
      const repUpd = await tx.oTRepuesto.updateMany({
        where: { id: rep.id, po_id: null, nro_oc: null, status_oc_codigo: rep.status_oc_codigo, cantidad: rep.cantidad },
        data: updateData,
      });
      if (repUpd.count === 0) {
        throw Object.assign(
          new Error("El requerimiento cambió mientras se procesaba (¿doble click o consumo simultáneo?). Refrescá y volvé a intentar."),
          { code: "CONCURRENT" },
        );
      }

      // 4) Registrar en historial de la OT (externa o interna).
      //    Antes solo seteaba ot_id → si el req era de una OT interna el
      //    historial quedaba huérfano (ot_id NULL, sin orden_trabajo_interna_id).
      await tx.oTHistorial.create({
        data: {
          ot_id: rep.ot_id,
          orden_trabajo_interna_id: rep.orden_trabajo_interna_id,
          tipo_operacion: "CONSUMO_ALMACEN",
          descripcion: `Consumo de almacén — material ${material.codigo} cant ${cantidad} (REQ ${rep.nro_req ?? rep.id} / item ${rep.item_req ?? "-"})`,
          usuario,
          datos_adicionales: JSON.stringify({
            requerimiento_id: rep.id,
            material_id: materialId,
            cantidad: cantidad.toString(),
            stock_anterior: stockActual.toString(),
            stock_nuevo: stockActual.minus(cantidad).toString(),
            nuevo_estado_oc: nuevoEstado,
          }),
        },
      });

      // Auto-update del estado de recursos de la OT.
      await recalcularRecursosStatusDesdeRep(tx, rep);
      return {
        requerimiento_id: rep.id,
        nuevo_estado: nuevoEstado,
        cantidad_consumida: cantidad.toString(),
        stock_resultante: stockActual.minus(cantidad).toString(),
      };
    }, { timeout: 15_000 });

    return NextResponse.json({
      message: `Consumido de almacén: ${result.cantidad_consumida} unidad(es). Stock restante: ${result.stock_resultante}.`,
      ...result,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND" || err?.code === "MATERIAL_NOT_FOUND") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (
      err?.code === "NO_MATERIAL" ||
      err?.code === "HAS_OC" ||
      err?.code === "INVALID_STATE" ||
      err?.code === "NOT_APPROVED" ||
      err?.code === "BAD_QTY" ||
      err?.code === "OVER_QTY" ||
      err?.code === "NO_STOCK" ||
      err?.code === "CONCURRENT"
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/requerimientos/[id]/consumir-de-almacen error:", error);
    const msg = error instanceof Error ? error.message : "Error al consumir de almacén";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalcularCostoPromedio } from "@/lib/inventario";

// Para recepción por req individual (recomendado): el caller pasa el id del
// OTRepuesto a recibir + la zona/posición del almacén físico donde se guarda.
// Si no se pasa repuesto_id, mantiene la lógica histórica (distribución por
// material entre detalles).
// material_id es opcional: para items "free" (CAD sin catálogo) viene null y
// repuesto_id es obligatorio. La validación cruzada se hace abajo.
const ItemSchema = z.object({
  material_id: z.coerce.number().int().positive().optional().nullable(),
  cantidad: z.coerce.number().positive(),
  observacion: z.string().trim().optional().nullable(),
  repuesto_id: z.coerce.number().int().positive().optional().nullable(),
  almacen_zona_id: z.coerce.number().int().positive().optional().nullable(),
  almacen_posicion_id: z.coerce.number().int().positive().optional().nullable(),
}).refine(
  (item) => item.material_id != null || item.repuesto_id != null,
  { message: "Cada item debe tener material_id o repuesto_id" },
);

const Schema = z.object({
  po_id: z.coerce.number().int().positive(),
  items: z.array(ItemSchema).min(1),
  usuario: z.string().trim().min(1),
  nro_guia: z.string().trim().optional().nullable(),
  nro_factura: z.string().trim().optional().nullable(),
  comentarios: z.string().trim().optional().nullable(),
  // Ubicación física donde se guardó el material recibido. Se propaga a las OTs.
  ubicacion_codigo: z.string().trim().optional().nullable(),
});

// Estados desde los que se permite recepcionar mercadería.
const ESTADOS_RECEPCIONABLES = new Set(["PEND_OC", "PROCESO", "ENTREGADO", "INCOMPLETO"]);

// POST — recibir una OC y generar ENTRADAS en inventario.
//   - Suma a cantidad_recibida de cada CompraDetalle (por material).
//   - Valida que no exceda lo pendiente.
//   - Si todas las líneas quedan completas → status_oc_codigo = "ENTREGADO".
//   - Si quedan parciales → status_oc_codigo = "INCOMPLETO".
//   - Crea MovimientoInventario(ENTRADA) por cada item.
//   - Incrementa Material.stock_actual.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const compra = await tx.compra.findUnique({
        where: { id: d.po_id },
        include: {
          detalles: {
            select: { id: true, material_id: true, cantidad: true, cantidad_recibida: true, cantidad_en_transito: true },
          },
        },
      });
      if (!compra) throw Object.assign(new Error("Orden de compra no encontrada"), { code: "NOT_FOUND" });
      if (!compra.status_oc_codigo || !ESTADOS_RECEPCIONABLES.has(compra.status_oc_codigo)) {
        throw Object.assign(
          new Error(
            `No se puede recepcionar en estado ${compra.status_oc_codigo ?? "(vacío)"}. Debe estar en PEND_OC, PROCESO, ENTREGADO o INCOMPLETO.`,
          ),
          { code: "INVALID_STATE" },
        );
      }

      // Indexar detalles por material_id. Si hay múltiples del mismo material, recibimos en orden de menor cantidad pendiente.
      const detallesPorMaterial = new Map<number, typeof compra.detalles>();
      for (const det of compra.detalles) {
        const arr = detallesPorMaterial.get(det.material_id) ?? [];
        arr.push(det);
        detallesPorMaterial.set(det.material_id, arr);
      }

      // Cache de detalles con precio + moneda por material — necesario para
      // recalcular costo promedio ponderado. Tomamos el primer detalle del
      // material (asumiendo precio uniforme por material en una OC). Si hay
      // mezcla de precios para el mismo material en la misma OC, usamos el
      // promedio ponderado de esos detalles como precio de entrada.
      const detallesCompletos = await tx.compraDetalle.findMany({
        where: { compra_id: d.po_id },
        select: { material_id: true, cantidad: true, precio_unitario: true },
      });
      const precioPorMaterial = new Map<number, Prisma.Decimal>();
      const cantTotalPorMat = new Map<number, Prisma.Decimal>();
      const valorTotalPorMat = new Map<number, Prisma.Decimal>();
      for (const det of detallesCompletos) {
        const cant = new Prisma.Decimal(det.cantidad);
        const prec = new Prisma.Decimal(det.precio_unitario ?? 0);
        cantTotalPorMat.set(
          det.material_id,
          (cantTotalPorMat.get(det.material_id) ?? new Prisma.Decimal(0)).plus(cant),
        );
        valorTotalPorMat.set(
          det.material_id,
          (valorTotalPorMat.get(det.material_id) ?? new Prisma.Decimal(0)).plus(cant.mul(prec)),
        );
      }
      for (const [matId, cantTotal] of cantTotalPorMat) {
        const valorTotal = valorTotalPorMat.get(matId) ?? new Prisma.Decimal(0);
        if (cantTotal.gt(0)) {
          precioPorMaterial.set(matId, valorTotal.div(cantTotal));
        }
      }

      const movimientosCreados: { material_id: number | null; cantidad: number }[] = [];

      for (const item of d.items) {
        // ─── Caso "free" (item sin material catalogado) ───────────────────
        // Identificado por material_id == null. La distribución va por
        // repuesto_id directamente: actualizamos OTRepuesto.cantidad_recibida
        // y saltamos MovimientoInventario + stock_actual (no hay material).
        if (item.material_id == null) {
          if (!item.repuesto_id) {
            throw Object.assign(
              new Error("Item sin material_id requiere repuesto_id"),
              { code: "BAD_LINE" },
            );
          }
          const reqFree = await tx.oTRepuesto.findUnique({
            where: { id: item.repuesto_id },
            select: { id: true, po_id: true, cantidad: true, cantidad_recibida: true, descripcion: true },
          });
          if (!reqFree || reqFree.po_id !== d.po_id) {
            throw Object.assign(
              new Error(`Repuesto ${item.repuesto_id} no pertenece a la OC ${compra.numero_po}`),
              { code: "BAD_LINE" },
            );
          }
          const pendienteFree = Number(reqFree.cantidad) - Number(reqFree.cantidad_recibida ?? 0);
          if (item.cantidad > pendienteFree + 0.0001) {
            throw Object.assign(
              new Error(`${reqFree.descripcion ?? "Item"}: cantidad ${item.cantidad} excede lo pendiente (${pendienteFree})`),
              { code: "OVER_QTY" },
            );
          }
          await tx.oTRepuesto.update({
            where: { id: reqFree.id },
            data: {
              cantidad_recibida: new Prisma.Decimal(reqFree.cantidad_recibida ?? 0).plus(item.cantidad),
              ...(item.almacen_zona_id
                ? { almacen_zona_id: item.almacen_zona_id, almacen_posicion_id: item.almacen_posicion_id ?? null }
                : {}),
            },
          });
          movimientosCreados.push({ material_id: null, cantidad: item.cantidad });
          continue;
        }

        // ─── Caso catalogado (material_id presente) ────────────────────────
        const detalles = detallesPorMaterial.get(item.material_id);
        if (!detalles || detalles.length === 0) {
          throw Object.assign(
            new Error(`Material ${item.material_id} no figura en la OC ${compra.numero_po}`),
            { code: "BAD_LINE" },
          );
        }

        // Suma del pendiente disponible para este material.
        const totalPendiente = detalles.reduce(
          (acc, det) => acc + (Number(det.cantidad) - Number(det.cantidad_recibida ?? 0)),
          0,
        );
        if (item.cantidad > totalPendiente + 0.0001) {
          throw Object.assign(
            new Error(
              `Material ${item.material_id}: cantidad ${item.cantidad} excede lo pendiente (${totalPendiente})`,
            ),
            { code: "OVER_QTY" },
          );
        }

        // Distribuir la cantidad recibida entre los detalles (en orden, llenando el primero hasta su pendiente).
        let restante = new Prisma.Decimal(item.cantidad);
        for (const det of detalles) {
          if (restante.lte(0)) break;
          const pendiente = new Prisma.Decimal(det.cantidad).minus(det.cantidad_recibida ?? 0);
          if (pendiente.lte(0)) continue;
          const aRecibir = Prisma.Decimal.min(pendiente, restante);
          const nuevaRecibida = new Prisma.Decimal(det.cantidad_recibida ?? 0).plus(aRecibir);
          const nuevaEnTransito = Prisma.Decimal.max(
            0,
            new Prisma.Decimal(det.cantidad_en_transito ?? 0).minus(aRecibir),
          );
          await tx.compraDetalle.update({
            where: { id: det.id },
            data: { cantidad_recibida: nuevaRecibida, cantidad_en_transito: nuevaEnTransito },
          });
          // Mantener el snapshot local sincronizado por si hay otra iteración sobre este detalle.
          det.cantidad_recibida = nuevaRecibida;
          det.cantidad_en_transito = nuevaEnTransito;
          restante = restante.minus(aRecibir);
        }

        const docRef = d.nro_guia ? `${compra.numero_po} / G:${d.nro_guia}` : compra.numero_po;
        const obsBase =
          `Recepción OC ${compra.numero_po}` +
          (d.nro_guia ? ` — Guía: ${d.nro_guia}` : "") +
          (d.nro_factura ? ` — Factura: ${d.nro_factura}` : "");

        // Leemos el snapshot del stock + costo previo ANTES del increment para
        // alimentar el cálculo de PPP. Si dos ingresos del mismo material caen
        // en la misma transacción, el segundo verá el costo recalculado del
        // primero porque ya estamos dentro de tx.
        const matPrevio = await tx.material.findUnique({
          where: { material_id: item.material_id },
          select: { stock_actual: true, costo_promedio: true },
        });

        await tx.movimientoInventario.create({
          data: {
            material_id: item.material_id,
            tipo_movimiento: "ENTRADA",
            cantidad: item.cantidad,
            // Snapshot del precio de la OC para esta entrada (vale tanto para
            // auditoría como para el cálculo de costos de la OT más adelante).
            precio_unitario: precioPorMaterial.get(item.material_id) ?? null,
            moneda: compra.moneda_codigo ?? null,
            documento_referencia: docRef,
            observacion: item.observacion || obsBase,
            usuario: d.usuario,
          },
        });

        await tx.material.update({
          where: { material_id: item.material_id },
          data: { stock_actual: { increment: item.cantidad } },
        });

        // Recalcular PPP con el stock previo y el precio de esta entrada.
        await recalcularCostoPromedio(tx, item.material_id, {
          stockPrevio: matPrevio?.stock_actual ?? 0,
          costoPrevio: matPrevio?.costo_promedio ?? null,
          cantidadEntrada: item.cantidad,
          precioEntrada: precioPorMaterial.get(item.material_id) ?? null,
          monedaEntrada: compra.moneda_codigo ?? null,
        });

        // Persistir ubicación física en el req específico (si se pasó
        // repuesto_id) o en todos los reqs del material de esta OC (si no).
        // Se aplica solo cuando el caller envía zona_id — sino el req queda
        // sin ubicación y se completa después al consumir.
        if (item.almacen_zona_id) {
          const ubicData = {
            almacen_zona_id: item.almacen_zona_id,
            almacen_posicion_id: item.almacen_posicion_id ?? null,
          };
          if (item.repuesto_id) {
            await tx.oTRepuesto.update({
              where: { id: item.repuesto_id },
              data: ubicData,
            });
          } else {
            await tx.oTRepuesto.updateMany({
              where: { po_id: d.po_id, material_id: item.material_id },
              data: ubicData,
            });
          }
        }

        movimientosCreados.push({ material_id: item.material_id, cantidad: item.cantidad });
      }

      // Recalcular estado de la OC: si hay CompraDetalle, los usamos; si no
      // (OC de items free), nos basamos en OTRepuesto.cantidad_recibida.
      const detallesActualizados = await tx.compraDetalle.findMany({
        where: { compra_id: d.po_id },
        select: { cantidad: true, cantidad_recibida: true },
      });
      let todasCompletas: boolean;
      if (detallesActualizados.length > 0) {
        todasCompletas = detallesActualizados.every(
          (x) => Number(x.cantidad_recibida ?? 0) >= Number(x.cantidad) - 0.0001,
        );
      } else {
        const reqsActualizados = await tx.oTRepuesto.findMany({
          where: { po_id: d.po_id },
          select: { cantidad: true, cantidad_recibida: true },
        });
        todasCompletas = reqsActualizados.every(
          (x) => Number(x.cantidad_recibida ?? 0) >= Number(x.cantidad) - 0.0001,
        );
      }
      const nuevoEstado = todasCompletas ? "ENTREGADO" : "INCOMPLETO";

      const updateCompra: Prisma.CompraUncheckedUpdateInput = {
        status_oc_codigo: nuevoEstado,
        fecha_entrega_real: new Date(),
        usuario_aprueba: d.usuario,
      };
      if (d.nro_guia) updateCompra.nro_guia = d.nro_guia;
      if (d.nro_factura) updateCompra.nro_factura = d.nro_factura;
      if (d.comentarios) {
        updateCompra.observaciones = compra.observaciones
          ? `${compra.observaciones}\n— Recepción: ${d.comentarios}`
          : `Recepción: ${d.comentarios}`;
      }
      await tx.compra.update({ where: { id: d.po_id }, data: updateCompra });

      // Reflejar fechas/factura en los requerimientos vinculados.
      await tx.oTRepuesto.updateMany({
        where: { po_id: d.po_id },
        data: {
          fecha_entrega_real: new Date(),
          ...(d.nro_guia ? { nro_guia: d.nro_guia } : {}),
          ...(d.nro_factura ? { nro_factura_proveedor: d.nro_factura } : {}),
        },
      });

      // Actualizar las OTs afectadas por esta PO: ubicación física + estado
      // de recursos. La OC puede agrupar items de OT externas + internas;
      // procesamos ambas dimensiones.
      const repuestosPO = await tx.oTRepuesto.findMany({
        where: { po_id: d.po_id },
        select: { ot_id: true, orden_trabajo_interna_id: true },
      });
      const otIds = [
        ...new Set(repuestosPO.map((r) => r.ot_id).filter((x): x is number => x != null)),
      ];
      const otInternaIds = [
        ...new Set(
          repuestosPO
            .map((r) => r.orden_trabajo_interna_id)
            .filter((x): x is number => x != null),
        ),
      ];
      const ubicacionValida = d.ubicacion_codigo
        ? await tx.ubicacion.findUnique({ where: { codigo: d.ubicacion_codigo }, select: { codigo: true } })
        : null;

      // Calcula el código de recursos status según las OCs vinculadas a una OT.
      async function calcularRecursosStatus(where: Record<string, unknown>): Promise<string> {
        const reqs = await tx.oTRepuesto.findMany({
          where: { ...where, po_id: { not: null } },
          select: { po_id: true },
        });
        const poIds = [...new Set(reqs.map((r) => r.po_id).filter((x): x is number => x != null))];
        if (poIds.length === 0) return "Recursos entregados";
        const comprasOT = await tx.compra.findMany({
          where: { id: { in: poIds } },
          select: { status_oc_codigo: true },
        });
        const todasEntregadas = comprasOT.every(
          (c) => c.status_oc_codigo === "ENTREGADO" || c.status_oc_codigo === "COMPLETO",
        );
        return todasEntregadas ? "Recursos completos" : "Recursos entregados";
      }

      for (const otId of otIds) {
        const recursosCodigo = await calcularRecursosStatus({ ot_id: otId });
        await tx.ordenTrabajo.update({
          where: { id: otId },
          data: {
            recursos_status_codigo: recursosCodigo,
            ...(ubicacionValida ? { ubicacion_codigo: ubicacionValida.codigo } : {}),
          },
        });
      }

      // OT internas: solo tienen `recursos_status_codigo` (no ubicacion_codigo
      // todavía — el modelo no lo declara). Aplicamos la misma regla.
      for (const otInternaId of otInternaIds) {
        const recursosCodigo = await calcularRecursosStatus({
          orden_trabajo_interna_id: otInternaId,
        });
        await tx.ordenTrabajoInterna.update({
          where: { id: otInternaId },
          data: { recursos_status_codigo: recursosCodigo },
        });
      }

      return { numero_po: compra.numero_po, nuevo_estado: nuevoEstado, movimientos: movimientosCreados };
    });

    return NextResponse.json(
      {
        message: `OC ${result.numero_po} recibida (${result.nuevo_estado}). ${result.movimientos.length} entradas generadas.`,
        nuevo_estado: result.nuevo_estado,
        movimientos: result.movimientos,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "INVALID_STATE" || err?.code === "BAD_LINE" || err?.code === "OVER_QTY") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/movimientos/ingreso-po error:", error);
    const msg = error instanceof Error ? error.message : "Error al registrar ingreso";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

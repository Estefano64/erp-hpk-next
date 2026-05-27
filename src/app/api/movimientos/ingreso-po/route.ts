import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ItemSchema = z.object({
  material_id: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().positive(),
  observacion: z.string().trim().optional().nullable(),
});

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

      const movimientosCreados: { material_id: number; cantidad: number }[] = [];

      for (const item of d.items) {
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

        await tx.movimientoInventario.create({
          data: {
            material_id: item.material_id,
            tipo_movimiento: "ENTRADA",
            cantidad: item.cantidad,
            documento_referencia: docRef,
            observacion: item.observacion || obsBase,
            usuario: d.usuario,
          },
        });

        await tx.material.update({
          where: { material_id: item.material_id },
          data: { stock_actual: { increment: item.cantidad } },
        });

        movimientosCreados.push({ material_id: item.material_id, cantidad: item.cantidad });
      }

      // Recalcular estado de la OC en función de cuánto queda pendiente en TODOS los detalles.
      const detallesActualizados = await tx.compraDetalle.findMany({
        where: { compra_id: d.po_id },
        select: { cantidad: true, cantidad_recibida: true },
      });
      const todasCompletas = detallesActualizados.every(
        (x) => Number(x.cantidad_recibida ?? 0) >= Number(x.cantidad) - 0.0001,
      );
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

      // Actualizar las OTs afectadas por esta PO: ubicación física + estado de recursos.
      const repuestosPO = await tx.oTRepuesto.findMany({
        where: { po_id: d.po_id },
        select: { ot_id: true },
      });
      // Filtramos null porque ahora ot_id es opcional (items de OT interna).
      // El bloque siguiente solo actualiza OTs externas — las internas no tienen
      // status `recursos_status_codigo` ni `ubicacion_codigo`.
      const otIds = [
        ...new Set(repuestosPO.map((r) => r.ot_id).filter((x): x is number => x != null)),
      ];
      const ubicacionValida = d.ubicacion_codigo
        ? await tx.ubicacion.findUnique({ where: { codigo: d.ubicacion_codigo }, select: { codigo: true } })
        : null;

      for (const otId of otIds) {
        // Estado de recursos según el estado de TODAS las POs vinculadas a la OT.
        // - Todas las POs ENTREGADO (recibidas completas) → "Recursos completos"
        // - Alguna recibida pero queda alguna por completar → "Recursos en recepción"
        const reqsOT = await tx.oTRepuesto.findMany({
          where: { ot_id: otId, po_id: { not: null } },
          select: { po_id: true },
        });
        const poIds = [...new Set(reqsOT.map((r) => r.po_id).filter((x): x is number => x != null))];
        let recursosCodigo = "Recursos en recepción";
        if (poIds.length > 0) {
          const comprasOT = await tx.compra.findMany({
            where: { id: { in: poIds } },
            select: { status_oc_codigo: true },
          });
          const todasEntregadas = comprasOT.every(
            (c) => c.status_oc_codigo === "ENTREGADO" || c.status_oc_codigo === "COMPLETO",
          );
          recursosCodigo = todasEntregadas ? "Recursos completos" : "Recursos en recepción";
        }
        await tx.ordenTrabajo.update({
          where: { id: otId },
          data: {
            recursos_status_codigo: recursosCodigo,
            ...(ubicacionValida ? { ubicacion_codigo: ubicacionValida.codigo } : {}),
          },
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

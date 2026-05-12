import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  cantidad: z.coerce.number().positive().optional(),
  usuario: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
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
    const usuario = parsed.data.usuario || "Logistica";

    const result = await prisma.$transaction(async (tx) => {
      const rep = await tx.oTRepuesto.findUnique({ where: { id: Number(id) } });
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
      if (rep.status_oc_codigo === "ANULADO" || rep.status_oc_codigo === "DEVOLUCION") {
        throw Object.assign(
          new Error(`No se puede consumir un requerimiento en estado ${rep.status_oc_codigo}.`),
          { code: "INVALID_STATE" },
        );
      }

      const material = await tx.material.findUnique({ where: { material_id: rep.material_id } });
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
      if (stockActual.lt(cantidad)) {
        throw Object.assign(
          new Error(`Stock insuficiente. Disponible: ${stockActual}, requerido: ${cantidad}.`),
          { code: "NO_STOCK" },
        );
      }

      // 1) Crear movimiento SALIDA.
      await tx.movimientoInventario.create({
        data: {
          material_id: rep.material_id,
          tipo_movimiento: "SALIDA",
          cantidad,
          documento_referencia: rep.nro_req ? `REQ-${rep.nro_req}` : `REQ-${rep.id}`,
          observacion:
            parsed.data.observacion
            || `Consumo de almacén — REQ ${rep.nro_req ?? rep.id} item ${rep.item_req ?? ""}`,
          usuario,
        },
      });

      // 2) Decrementar stock_actual.
      await tx.material.update({
        where: { material_id: rep.material_id },
        data: { stock_actual: { decrement: cantidad } },
      });

      // 3) Marcar el requerimiento. Si fue completo, status final = ENTREGADO. Si fue parcial,
      //    decrementar la cantidad pedida y dejar el resto como pendiente para otro flujo.
      let nuevoEstado: string;
      const updateData: Prisma.OTRepuestoUncheckedUpdateInput = {
        cantidad_recibida: { increment: cantidad },
      };
      if (cantidad.equals(cantPedida)) {
        nuevoEstado = "ENTREGADO";
        updateData.status_oc_codigo = nuevoEstado;
        updateData.fecha_entrega_real = new Date();
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        updateData.observaciones = `${obsPrev}Consumido de almacén el ${new Date().toLocaleDateString("es-PE")} (${usuario})`;
      } else {
        // Consumo parcial: reducir la cantidad pedida y mantener el item pendiente para otro destino.
        nuevoEstado = rep.status_oc_codigo ?? "PEND_OC";
        updateData.cantidad = cantPedida.minus(cantidad);
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        updateData.observaciones = `${obsPrev}Consumo parcial de almacén: ${cantidad} u. el ${new Date().toLocaleDateString("es-PE")} (${usuario})`;
      }
      await tx.oTRepuesto.update({ where: { id: rep.id }, data: updateData });

      // 4) Registrar en historial de la OT.
      await tx.oTHistorial.create({
        data: {
          ot_id: rep.ot_id,
          tipo_operacion: "CONSUMO_ALMACEN",
          descripcion: `Consumo de almacén — material ${material.codigo} cant ${cantidad} (REQ ${rep.nro_req ?? rep.id} / item ${rep.item_req ?? "-"})`,
          usuario,
          datos_adicionales: JSON.stringify({
            requerimiento_id: rep.id,
            material_id: rep.material_id,
            cantidad: cantidad.toString(),
            stock_anterior: stockActual.toString(),
            stock_nuevo: stockActual.minus(cantidad).toString(),
            nuevo_estado_oc: nuevoEstado,
          }),
        },
      });

      return {
        requerimiento_id: rep.id,
        nuevo_estado: nuevoEstado,
        cantidad_consumida: cantidad.toString(),
        stock_resultante: stockActual.minus(cantidad).toString(),
      };
    });

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
      err?.code === "BAD_QTY" ||
      err?.code === "OVER_QTY" ||
      err?.code === "NO_STOCK"
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/requerimientos/[id]/consumir-de-almacen error:", error);
    const msg = error instanceof Error ? error.message : "Error al consumir de almacén";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

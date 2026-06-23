import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import { parseInt4Safe } from "@/lib/ot-formato";
type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  partes: z.array(z.coerce.number().positive()).min(2),
});

// POST — dividir un requerimiento en varios sub-items.
//   - Las partes deben sumar como máximo la cantidad original.
//   - Si suman menos, el remanente queda en un registro extra.
//   - El cálculo del siguiente item_req se hace dentro de la transacción para evitar
//     que dos divisiones simultáneas asignen el mismo número.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const partes = parsed.data.partes;
    const sumaPartes = partes.reduce((s, p) => s + p, 0);

    const result = await prisma.$transaction(
      async (tx) => {
        const original = await tx.oTRepuesto.findUnique({ where: { id: (parseInt4Safe(id) ?? 0) } });
        if (!original) {
          throw Object.assign(new Error("Requerimiento no encontrado"), { code: "NOT_FOUND" });
        }
        if (original.nro_oc || original.po_id) {
          throw Object.assign(
            new Error("No se puede dividir un requerimiento ya asignado a una OC"),
            { code: "ALREADY_OC" },
          );
        }

        const cantOriginal = Number(original.cantidad);
        if (sumaPartes > cantOriginal + 0.0001) {
          throw Object.assign(
            new Error(`Las partes (${sumaPartes}) no pueden superar la cantidad original (${cantOriginal})`),
            { code: "OVER_QTY" },
          );
        }

        // Calcular el siguiente item_req dentro de la transacción para serializar
        // con otras divisiones concurrentes sobre el mismo nro_req. La query
        // filtra por la OT del original (externa o interna) para no mezclar
        // requerimientos de distintas OTs que casualmente comparten nro_req.
        const sameReq = await tx.oTRepuesto.findFirst({
          where: original.ot_id != null
            ? { ot_id: original.ot_id, nro_req: original.nro_req }
            : { orden_trabajo_interna_id: original.orden_trabajo_interna_id, nro_req: original.nro_req },
          orderBy: { item_req: "desc" },
          select: { item_req: true },
        });
        const startItem = (sameReq?.item_req ?? original.item_req ?? 0) + 1;

        // Primera parte: actualizar el original.
        await tx.oTRepuesto.update({
          where: { id: original.id },
          data: { cantidad: partes[0] },
        });

        const baseClone = {
          ot_id: original.ot_id,
          // Heredar también el vínculo a OT interna cuando aplica — antes
          // se quedaba null y los hijos se desvinculaban de la OT interna.
          orden_trabajo_interna_id: original.orden_trabajo_interna_id,
          material_id: original.material_id,
          material_codigo: original.material_codigo,
          nro_req: original.nro_req,
          tipo_codigo: original.tipo_codigo,
          descripcion: original.descripcion,
          texto: original.texto,
          fabricante_codigo: original.fabricante_codigo,
          unidad_medida: original.unidad_medida,
          fecha_requerida: original.fecha_requerida,
          status_oc_codigo: original.status_oc_codigo,
          status_cotizacion_codigo: original.status_cotizacion_codigo,
          status_requerimiento_codigo: original.status_requerimiento_codigo,
          precio_unitario: original.precio_unitario,
          precio_venta: original.precio_venta,
          moneda: original.moneda,
          es_adicional: original.es_adicional,
          usuario_solicita: original.usuario_solicita,
        };

        const nuevos = [];
        for (let i = 1; i < partes.length; i++) {
          const nuevo = await tx.oTRepuesto.create({
            data: {
              ...baseClone,
              item_req: startItem + i - 1,
              cantidad: partes[i],
              fecha_solicitud: new Date(),
              observaciones: `Dividido del requerimiento #${original.id}`,
            },
          });
          nuevos.push(nuevo);
        }

        const remanente = cantOriginal - sumaPartes;
        if (remanente > 0.0001) {
          const remanenteReg = await tx.oTRepuesto.create({
            data: {
              ...baseClone,
              item_req: startItem + partes.length - 1,
              cantidad: remanente,
              fecha_solicitud: new Date(),
              observaciones: `Remanente dividido del requerimiento #${original.id}`,
            },
          });
          nuevos.push(remanenteReg);
        }

        return { nuevos, partes: partes.length, hasRemanente: remanente > 0.0001 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({
      message: `Requerimiento dividido en ${result.partes + (result.hasRemanente ? 1 : 0)} partes`,
      creados: result.nuevos,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND") return NextResponse.json({ error: err.message }, { status: 404 });
    if (err?.code === "ALREADY_OC" || err?.code === "OVER_QTY") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/requerimientos/[id]/dividir error:", error);
    const msg = error instanceof Error ? error.message : "Error al dividir";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

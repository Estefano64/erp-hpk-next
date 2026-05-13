import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  requerimiento_ids: z.array(z.coerce.number().int().positive()).min(1),
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

    const result = await prisma.$transaction(async (tx) => {
      const ok: number[] = [];
      const errores: { id: number; error: string }[] = [];

      for (const reqId of parsed.data.requerimiento_ids) {
        const rep = await tx.oTRepuesto.findUnique({ where: { id: reqId } });
        if (!rep) { errores.push({ id: reqId, error: "No encontrado" }); continue; }
        if (rep.ot_id !== otId) { errores.push({ id: reqId, error: "Pertenece a otra OT" }); continue; }
        if (!rep.material_id) { errores.push({ id: reqId, error: "Sin material vinculado" }); continue; }
        if (rep.po_id) { errores.push({ id: reqId, error: "Ya tiene OC" }); continue; }
        if (rep.status_requerimiento_codigo !== "APROBADO") { errores.push({ id: reqId, error: "No está APROBADO" }); continue; }

        const material = await tx.material.findUnique({ where: { material_id: rep.material_id } });
        if (!material) { errores.push({ id: reqId, error: "Material no encontrado" }); continue; }
        const cant = new Prisma.Decimal(rep.cantidad);
        const stock = new Prisma.Decimal(material.stock_actual ?? 0);
        if (stock.lt(cant)) {
          errores.push({ id: reqId, error: `Stock insuficiente (${stock} < ${cant})` });
          continue;
        }

        // Movimiento SALIDA
        await tx.movimientoInventario.create({
          data: {
            material_id: rep.material_id,
            tipo_movimiento: "SALIDA",
            cantidad: cant,
            documento_referencia: rep.nro_req ? `REQ-${rep.nro_req}` : `REQ-${rep.id}`,
            observacion: `Despacho a OT — REQ ${rep.nro_req ?? rep.id}/${rep.item_req ?? "-"}`,
            usuario,
          },
        });
        // Decrementar stock
        await tx.material.update({
          where: { material_id: rep.material_id },
          data: { stock_actual: { decrement: cant } },
        });
        // Marcar requerimiento como ENTREGADO
        const obsPrev = rep.observaciones ? `${rep.observaciones}\n` : "";
        await tx.oTRepuesto.update({
          where: { id: rep.id },
          data: {
            status_oc_codigo: "ENTREGADO",
            cantidad_recibida: { increment: cant },
            fecha_entrega_real: new Date(),
            fecha_salida_almacen: new Date(),
            observaciones: `${obsPrev}Despacho desde almacén el ${new Date().toLocaleDateString("es-PE")} (${usuario})`,
          },
        });
        ok.push(rep.id);
      }

      // Historial único por la operación
      if (ok.length > 0) {
        await tx.oTHistorial.create({
          data: {
            ot_id: otId,
            tipo_operacion: "DESPACHO_OT",
            descripcion: `Despacho desde almacén a la OT: ${ok.length} item(s)`,
            usuario,
            datos_adicionales: JSON.stringify({ requerimiento_ids: ok }),
          },
        });
      }

      return { ok, errores };
    });

    return NextResponse.json({
      message: `Despachados ${result.ok.length} item(s). ${result.errores.length} error(es).`,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/despachos/ot/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Error al despachar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

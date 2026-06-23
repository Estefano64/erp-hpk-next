// PATCH /api/requerimientos/[id]/precio
//
// Endpoint dedicado para que Logística asigne/edite el precio unitario, moneda
// y proveedor sugerido de un requerimiento ya APROBADO. A diferencia de
// PUT /api/requerimientos/[id] (que para items APROBADO requiere admin),
// este endpoint NO requiere admin porque cotizar es trabajo de Logística post-
// aprobación operacional. Lo que NO permite: cambiar cantidad ni material,
// ni tocar items ya con OC asociada o terminales (ANULADO/DESAPROBADO).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  precio_unitario: z.coerce.number().min(0),
  moneda: z.string().trim().max(10).optional().nullable(),
  proveedor_id: z.coerce.number().int().positive().optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const itemId = parseInt4Safe(id) ?? 0;
    if (itemId == null || itemId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        status_requerimiento_codigo: true,
        po_id: true,
        material_id: true,
        ot_id: true,
        nro_req: true,
        item_req: true,
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Requerimiento no encontrado" }, { status: 404 });
    }
    const estado = current.status_requerimiento_codigo ?? "BORRADOR";
    if (estado === "ANULADO" || estado === "DESAPROBADO") {
      return NextResponse.json({ error: `Requerimiento ${estado.toLowerCase()}, no editable.` }, { status: 423 });
    }
    if (current.po_id != null) {
      return NextResponse.json({
        error: "Este requerimiento ya tiene OC asociada — no se puede cambiar el precio acá. Editá la OC directamente.",
      }, { status: 409 });
    }

    const usuario = (await getAuditUser(req)) ?? "Logistica";
    const updated = await prisma.oTRepuesto.update({
      where: { id: itemId },
      data: {
        precio_unitario: d.precio_unitario,
        moneda: d.moneda ?? undefined,
        proveedor_id: d.proveedor_id ?? undefined,
      },
      include: {
        material: { select: { codigo: true, descripcion: true } },
        proveedor: { select: { id: true, razon_social: true } },
      },
    });

    // Si el ítem tiene material y proveedor, actualizar también el histórico
    // (CotizacionProveedor) para que las próximas OC ya tengan el precio
    // "ganador" registrado por par material/proveedor.
    if (current.material_id && d.proveedor_id && d.precio_unitario > 0) {
      try {
        await prisma.cotizacionProveedor.upsert({
          where: {
            material_id_proveedor_id: {
              material_id: current.material_id,
              proveedor_id: d.proveedor_id,
            },
          },
          create: {
            material_id: current.material_id,
            proveedor_id: d.proveedor_id,
            precio_unitario: d.precio_unitario,
            moneda_codigo: d.moneda ?? "USD",
            usuario,
          },
          update: {
            precio_unitario: d.precio_unitario,
            moneda_codigo: d.moneda ?? "USD",
            usuario,
            fecha: new Date(),
          },
        });
      } catch (e) {
        // Si falla el upsert de histórico no rompemos la actualización del item.
        console.warn("PATCH /api/requerimientos/[id]/precio: no se pudo actualizar histórico", e);
      }
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/requerimientos/[id]/precio error:", error);
    return NextResponse.json({ error: "Error al actualizar precio" }, { status: 500 });
  }
}

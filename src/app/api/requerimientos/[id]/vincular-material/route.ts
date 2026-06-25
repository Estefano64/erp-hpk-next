// POST /api/requerimientos/[id]/vincular-material
//
// Vincula un OTRepuesto que estaba creado como CAD (cargo directo) o sin
// material catalogado, al material correcto del catálogo. Cambia tipo a
// MAC y setea material_id + material_codigo + atributos heredados del
// material (unidad, fabricante, precio si el req no tiene uno propio).
//
// Body:
//   { material_id?: number } | { material_codigo?: string }
// Al menos uno debe venir. Si vienen ambos, gana material_id.
//
// Reglas:
//   - El req no puede tener po_id ni nro_oc (ya asignado a OC).
//   - El req no puede estar en status ANULADO/DESAPROBADO ni
//     status_oc ENTREGADO/CONSUMIDO_ALMACEN/DEVOLUCION.
//   - El material destino debe existir y estar activo.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";
import { getAuditUser } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  material_id: z.coerce.number().int().positive().optional(),
  material_codigo: z.string().trim().min(1).optional(),
}).refine((d) => d.material_id != null || (d.material_codigo && d.material_codigo.length > 0), {
  message: "Se requiere material_id o material_codigo",
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const repId = parseInt4Safe(id);
    if (repId == null || repId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "Logistica";

    const result = await prisma.$transaction(async (tx) => {
      const rep = await tx.oTRepuesto.findUnique({ where: { id: repId } });
      if (!rep) {
        throw Object.assign(new Error("Requerimiento no encontrado"), { code: "NOT_FOUND" });
      }
      if (rep.po_id || rep.nro_oc) {
        throw Object.assign(
          new Error("El requerimiento ya está asignado a una OC, no se puede re-vincular."),
          { code: "HAS_OC" },
        );
      }
      const sr = rep.status_requerimiento_codigo;
      if (sr === "ANULADO" || sr === "DESAPROBADO") {
        throw Object.assign(
          new Error(`No se puede vincular un req en estado ${sr}.`),
          { code: "INVALID_STATE" },
        );
      }
      const so = rep.status_oc_codigo;
      if (so === "ENTREGADO" || so === "CONSUMIDO_ALMACEN" || so === "DEVOLUCION") {
        throw Object.assign(
          new Error(`No se puede vincular un req con estado de OC ${so}.`),
          { code: "INVALID_STATE" },
        );
      }

      // Resolver material destino (por id o por código).
      let material = parsed.data.material_id != null
        ? await tx.material.findUnique({ where: { material_id: parsed.data.material_id } })
        : null;
      if (!material && parsed.data.material_codigo) {
        material = await tx.material.findUnique({ where: { codigo: parsed.data.material_codigo } });
      }
      if (!material) {
        throw Object.assign(new Error("Material no encontrado."), { code: "MATERIAL_NOT_FOUND" });
      }
      if (material.activo === false) {
        throw Object.assign(
          new Error(`El material ${material.codigo} está inactivo.`),
          { code: "MATERIAL_INACTIVO" },
        );
      }

      // Actualizar el req: tipo MAC + material vinculado + atributos heredados.
      // No tocamos cantidad ni precio_unitario (los del req tienen prioridad).
      // Si el req no tiene precio_unitario, copiamos el del material.
      const heredarPrecio = rep.precio_unitario == null && material.precio != null;
      const updated = await tx.oTRepuesto.update({
        where: { id: repId },
        data: {
          tipo_codigo: "MAC",
          material_id: material.material_id,
          material_codigo: material.codigo,
          fabricante_codigo: rep.fabricante_codigo ?? material.fabricante_codigo,
          unidad_medida: rep.unidad_medida ?? material.unidad_medida_codigo ?? "UNIDAD",
          ...(heredarPrecio ? { precio_unitario: material.precio, moneda: material.moneda_codigo ?? "USD" } : {}),
        },
      });

      // Historial.
      await tx.oTHistorial.create({
        data: {
          ot_id: rep.ot_id,
          orden_trabajo_interna_id: rep.orden_trabajo_interna_id,
          tipo_operacion: "EDICION",
          descripcion: `Material vinculado: ${material.codigo} — ${material.descripcion ?? ""} (req ${rep.nro_req ?? rep.id}/${rep.item_req ?? "-"}, tipo cambiado a MAC)`,
          usuario,
        },
      });
      return { id: updated.id, material_id: material.material_id, material_codigo: material.codigo };
    });

    return NextResponse.json({
      message: `Vinculado al material ${result.material_codigo}.`,
      ...result,
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err?.code === "NOT_FOUND" || err?.code === "MATERIAL_NOT_FOUND") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (
      err?.code === "HAS_OC" ||
      err?.code === "INVALID_STATE" ||
      err?.code === "MATERIAL_INACTIVO"
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/requerimientos/[id]/vincular-material error:", error);
    const msg = error instanceof Error ? error.message : "Error al vincular";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

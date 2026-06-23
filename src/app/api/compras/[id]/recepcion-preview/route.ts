// GET /api/compras/[id]/recepcion-preview
// Para el modal de recepción de OC: devuelve por cada item (OTRepuesto) la
// ubicación SUGERIDA basada en otros reqs ya ubicados de la misma OT.
//
// Estructura devuelta:
//   items: [
//     {
//       repuesto_id, nro_req, item_req, material_codigo, descripcion,
//       cantidad_pedida, cantidad_recibida, cantidad_pendiente,
//       ot_id, orden_trabajo_interna_id, ot_codigo,
//       ubicacion_actual: { zona_id, posicion_id } | null,
//       ubicacion_sugerida: { zona_id, posicion_id } | null
//     }
//   ]
//
// La UI usa ubicacion_actual si existe (ya está ubicado), sino
// ubicacion_sugerida (de la OT), sino vacío.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sugerirUbicacionPorOT } from "@/lib/almacen-ubicacion";
import {  formatOtCodigo, formatOtInternaCodigo, parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const poId = parseInt4Safe(id) ?? 0;
    if (poId == null || poId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const reqs = await prisma.oTRepuesto.findMany({
      where: { po_id: poId },
      select: {
        id: true,
        nro_req: true,
        item_req: true,
        material_id: true,
        material_codigo: true,
        descripcion: true,
        cantidad: true,
        cantidad_recibida: true,
        ot_id: true,
        orden_trabajo_interna_id: true,
        almacen_zona_id: true,
        almacen_posicion_id: true,
        material: { select: { codigo: true, descripcion: true, np: true, unidad_medida_codigo: true } },
        orden_trabajo: { select: { ot: true, tipo_codigo: true } },
        orden_trabajo_interna: { select: { ot: true } },
      },
      orderBy: [{ nro_req: "asc" }, { item_req: "asc" }],
    });

    const items = await Promise.all(
      reqs.map(async (r) => {
        const cantPedida = Number(r.cantidad);
        const cantRecibida = Number(r.cantidad_recibida ?? 0);
        const pendiente = Math.max(cantPedida - cantRecibida, 0);
        const otCodigo = r.orden_trabajo?.ot != null
          ? formatOtCodigo(r.orden_trabajo.ot, r.orden_trabajo.tipo_codigo, "")
          : r.orden_trabajo_interna?.ot != null
            ? formatOtInternaCodigo(r.orden_trabajo_interna.ot, "")
            : "";
        const ubicSugerida = r.almacen_zona_id == null
          ? await sugerirUbicacionPorOT(prisma, {
              otId: r.ot_id,
              otInternaId: r.orden_trabajo_interna_id,
              excluirRepuestoId: r.id,
            })
          : null;
        return {
          repuesto_id: r.id,
          nro_req: r.nro_req,
          item_req: r.item_req,
          material_id: r.material_id,
          material_codigo: r.material?.codigo ?? r.material_codigo,
          descripcion: r.material?.descripcion ?? r.descripcion,
          np: r.material?.np ?? null,
          unidad: r.material?.unidad_medida_codigo ?? "UN",
          cantidad_pedida: cantPedida,
          cantidad_recibida: cantRecibida,
          cantidad_pendiente: pendiente,
          ot_id: r.ot_id,
          orden_trabajo_interna_id: r.orden_trabajo_interna_id,
          ot_codigo: otCodigo,
          ubicacion_actual: r.almacen_zona_id != null
            ? { zona_id: r.almacen_zona_id, posicion_id: r.almacen_posicion_id }
            : null,
          ubicacion_sugerida: ubicSugerida,
        };
      }),
    );

    return NextResponse.json({ data: items });
  } catch (e) {
    console.error("GET /api/compras/[id]/recepcion-preview error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

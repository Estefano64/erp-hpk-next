import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/despachos/ot — lista OTs con items APROBADO + sin OC + con material vinculado.
// Para cada item indica si hay stock disponible (>= cantidad pedida).
export async function GET(_req: NextRequest) {
  try {
    const items = await prisma.oTRepuesto.findMany({
      where: {
        status_requerimiento_codigo: "APROBADO",
        po_id: null,
        material_id: { not: null },
        status_oc_codigo: { notIn: ["ENTREGADO", "COMPLETO", "ANULADO"] },
      },
      select: {
        id: true,
        ot_id: true,
        nro_req: true,
        item_req: true,
        descripcion: true,
        cantidad: true,
        unidad_medida: true,
        material_id: true,
        material: { select: { codigo: true, descripcion: true, stock_actual: true, ubicacion: true } },
        orden_trabajo: {
          select: {
            id: true, ot: true,
            cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
            codigo_reparacion: { select: { codigo: true, descripcion: true } },
          },
        },
      },
      orderBy: [{ ot_id: "asc" }, { nro_req: "asc" }, { item_req: "asc" }],
    });

    // Agrupar por OT
    const grupos = new Map<number, {
      ot_id: number;
      ot: string | null;
      cliente: string | null;
      codigo_reparacion: string | null;
      items: typeof items;
      con_stock: number;
      sin_stock: number;
    }>();

    for (const it of items) {
      const otId = it.ot_id;
      if (!grupos.has(otId)) {
        grupos.set(otId, {
          ot_id: otId,
          ot: it.orden_trabajo?.ot ?? null,
          cliente: it.orden_trabajo?.cliente?.nombre_comercial ?? it.orden_trabajo?.cliente?.razon_social ?? null,
          codigo_reparacion: it.orden_trabajo?.codigo_reparacion?.codigo ?? null,
          items: [],
          con_stock: 0,
          sin_stock: 0,
        });
      }
      const g = grupos.get(otId)!;
      const stockMat = Number(it.material?.stock_actual ?? 0);
      const cant = Number(it.cantidad);
      if (stockMat >= cant && cant > 0) g.con_stock++;
      else g.sin_stock++;
      g.items.push(it);
    }

    return NextResponse.json({ data: Array.from(grupos.values()) });
  } catch (error) {
    console.error("GET /api/despachos/ot error:", error);
    return NextResponse.json({ error: "Error al obtener despachos pendientes" }, { status: 500 });
  }
}

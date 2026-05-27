import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/despachos/ot
// Lista OTs con requerimientos APROBADOS y material vinculado que están pendientes
// de entrega a la OT (aún no ENTREGADO). Incluye tanto:
//   - Items sin OC (material que ya estaba en almacén / stock directo).
//   - Items con OC: aparecen apenas se aprueba la OC; el estado de la PO indica
//     si el material ya llegó al almacén (recepcionado) o sigue por llegar.
// Para cada item se calcula la cantidad pendiente y si hay stock para despacharla.
export async function GET(_req: NextRequest) {
  try {
    const items = await prisma.oTRepuesto.findMany({
      where: {
        status_requerimiento_codigo: "APROBADO",
        material_id: { not: null },
        status_oc_codigo: { notIn: ["ENTREGADO", "ANULADO"] },
      },
      select: {
        id: true,
        ot_id: true,
        nro_req: true,
        item_req: true,
        descripcion: true,
        cantidad: true,
        cantidad_recibida: true,
        unidad_medida: true,
        material_id: true,
        po_id: true,
        status_oc_codigo: true,
        material: { select: { codigo: true, descripcion: true, stock_actual: true, ubicacion: true } },
        compra: { select: { numero_po: true, status_oc_codigo: true } },
        orden_trabajo: {
          select: {
            id: true, ot: true,
            recursos_status_codigo: true,
            ubicacion_codigo: true,
            ubicacion: { select: { codigo: true, nombre: true } },
            cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
            codigo_reparacion: { select: { codigo: true, descripcion: true } },
          },
        },
      },
      orderBy: [{ ot_id: "asc" }, { nro_req: "asc" }, { item_req: "asc" }],
    });

    // Solo items con cantidad pendiente de despacho (> 0).
    const pendientes = items
      .map((it) => {
        const cantTotal = Number(it.cantidad);
        const yaDespachado = Number(it.cantidad_recibida ?? 0);
        const cantPendiente = Math.max(0, cantTotal - yaDespachado);
        const stockMat = Number(it.material?.stock_actual ?? 0);
        const puedeDespachar = cantPendiente > 0 && stockMat >= cantPendiente;
        // El material "llegó" si no necesitaba OC (po_id null y hay stock) o si
        // la PO asociada fue recepcionada (ENTREGADO / INCOMPLETO / COMPLETO).
        const poStatus = it.compra?.status_oc_codigo ?? null;
        const poRecibida = it.po_id == null
          ? stockMat > 0
          : poStatus === "ENTREGADO" || poStatus === "INCOMPLETO" || poStatus === "COMPLETO";
        return {
          ...it,
          _cant_pendiente: cantPendiente,
          _puede_despachar: puedeDespachar,
          _po_status: poStatus,
          _po_recibida: poRecibida,
        };
      })
      .filter((it) => it._cant_pendiente > 0);

    type ItemConCalc = (typeof pendientes)[number];

    const grupos = new Map<number, {
      ot_id: number;
      ot: string | null;
      cliente: string | null;
      codigo_reparacion: string | null;
      recursos_status: string | null;
      ubicacion: string | null;
      items: ItemConCalc[];
      con_stock: number;
      sin_stock: number;
      estado_ot: "completa" | "incompleta";
    }>();

    for (const it of pendientes) {
      // Despachos son a clientes externos: ignorar items de OT interna.
      if (it.ot_id == null) continue;
      const otId = it.ot_id;
      if (!grupos.has(otId)) {
        grupos.set(otId, {
          ot_id: otId,
          ot: it.orden_trabajo?.ot ?? null,
          cliente: it.orden_trabajo?.cliente?.nombre_comercial ?? it.orden_trabajo?.cliente?.razon_social ?? null,
          codigo_reparacion: it.orden_trabajo?.codigo_reparacion?.codigo ?? null,
          recursos_status: it.orden_trabajo?.recursos_status_codigo ?? null,
          ubicacion: it.orden_trabajo?.ubicacion
            ? `${it.orden_trabajo.ubicacion.codigo} — ${it.orden_trabajo.ubicacion.nombre}`
            : null,
          items: [],
          con_stock: 0,
          sin_stock: 0,
          estado_ot: "completa",
        });
      }
      const g = grupos.get(otId)!;
      if (it._puede_despachar) g.con_stock++;
      else g.sin_stock++;
      g.items.push(it);
    }

    // Una OT está "completa" cuando TODOS sus items pendientes pueden despacharse
    // (material ya en almacén con stock suficiente). Si alguno no, queda "incompleta".
    for (const g of grupos.values()) {
      g.estado_ot = g.sin_stock === 0 && g.con_stock > 0 ? "completa" : "incompleta";
    }

    return NextResponse.json({ data: Array.from(grupos.values()) });
  } catch (error) {
    console.error("GET /api/despachos/ot error:", error);
    return NextResponse.json({ error: "Error al obtener despachos pendientes" }, { status: 500 });
  }
}

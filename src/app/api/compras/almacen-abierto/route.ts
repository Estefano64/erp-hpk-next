// GET /api/compras/almacen-abierto
//
// Lista las OCs marcadas como "almacén abierto" (es_almacen_abierto = true)
// con el stock disponible de cada item. Pensado para popular el dropdown de
// "fuente de stock" al crear un requerimiento de OT: el usuario ve qué
// CONTAINMENT TRAYS / SPILL PALLETS quedan disponibles para tirar de la OC
// de Quellaveco antes de generar una nueva OC.
//
// Una OC se considera "consumible" si:
//   - es_almacen_abierto = true
//   - status_oc_codigo NO está en ('ANULADO', 'COMPLETO')  (completo = stock agotado)
//   - fecha_expiracion es null O es >= hoy (no expiró)
//   - Al menos uno de sus items tiene stock pendiente (cantidad > cantidad_recibida)
//
// Respuesta:
//   data: [
//     {
//       id, numero_po, proveedor: { id, razon_social, nombre_comercial },
//       moneda, fecha_solicitud, fecha_expiracion,
//       items: [
//         { detalle_id, material_id, material_codigo, descripcion, um,
//           cantidad_total, cantidad_consumida, stock_disponible, precio_unitario }
//       ]
//     }
//   ]
//
// Usamos SQL raw por el campo `es_almacen_abierto` que puede no estar en el
// cliente Prisma si todavía no se regeneró (dev server bloqueando el .dll).
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

interface CompraRow {
  id: number;
  numero_po: string;
  moneda_codigo: string | null;
  fecha_solicitud: Date;
  fecha_expiracion: Date | null;
  status_oc_codigo: string | null;
  observaciones: string | null;
  proveedor_id: number;
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    // 1. Compras almacén abierto activas (SQL raw porque `es_almacen_abierto`
    //    y `fecha_expiracion` pueden no estar en el cliente Prisma todavía).
    const compras = await prisma.$queryRaw<CompraRow[]>`
      SELECT id, numero_po, moneda_codigo, fecha_solicitud, fecha_expiracion,
             status_oc_codigo, observaciones, proveedor_id
        FROM "compras"
       WHERE es_almacen_abierto = true
         AND status_oc_codigo NOT IN ('ANULADO', 'COMPLETO')
         AND (fecha_expiracion IS NULL OR fecha_expiracion >= CURRENT_DATE)
       ORDER BY fecha_solicitud DESC
    `;

    if (compras.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const ids = compras.map((c) => c.id);
    const provIds = [...new Set(compras.map((c) => c.proveedor_id))];

    // 2. Proveedores
    const proveedores = await prisma.proveedor.findMany({
      where: { id: { in: provIds } },
      select: { id: true, razon_social: true, nombre_comercial: true },
    });
    const provById = new Map(proveedores.map((p) => [p.id, p]));

    // 3. Detalles con material info — uso cliente Prisma normal (sin campos nuevos)
    const detalles = await prisma.compraDetalle.findMany({
      where: { compra_id: { in: ids } },
      select: {
        id: true,
        compra_id: true,
        material_id: true,
        cantidad: true,
        cantidad_recibida: true,
        precio_unitario: true,
        material: {
          select: {
            codigo: true,
            descripcion: true,
            unidad_medida_codigo: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    // Agrupar detalles por compra
    const detallesByCompra = new Map<number, typeof detalles>();
    for (const d of detalles) {
      const arr = detallesByCompra.get(d.compra_id) ?? [];
      arr.push(d);
      detallesByCompra.set(d.compra_id, arr);
    }

    // 4. Componer respuesta con stock_disponible calculado.
    // Filtramos OCs cuyos items TODOS tengan stock=0 (ya consumidos).
    const data = compras
      .map((c) => {
        const items = (detallesByCompra.get(c.id) ?? [])
          .map((d) => {
            const cantTotal = Number(d.cantidad);
            const cantConsumida = Number(d.cantidad_recibida ?? 0);
            const stock = Math.max(0, cantTotal - cantConsumida);
            return {
              detalle_id: d.id,
              material_id: d.material_id,
              material_codigo: d.material?.codigo ?? null,
              descripcion: d.material?.descripcion ?? null,
              um: d.material?.unidad_medida_codigo ?? null,
              cantidad_total: cantTotal,
              cantidad_consumida: cantConsumida,
              stock_disponible: stock,
              precio_unitario: Number(d.precio_unitario),
            };
          })
          // Mantenemos todos los items aunque stock=0 para que la UI muestre
          // claramente cuáles ya se agotaron. El filtro real lo hace el modal
          // de selección al crear el req.
          ;
        const tieneStockEnAlgunItem = items.some((it) => it.stock_disponible > 0);
        if (!tieneStockEnAlgunItem) return null;

        const prov = provById.get(c.proveedor_id);
        return {
          id: c.id,
          numero_po: c.numero_po,
          moneda: c.moneda_codigo ?? "USD",
          fecha_solicitud: c.fecha_solicitud,
          fecha_expiracion: c.fecha_expiracion,
          status_oc_codigo: c.status_oc_codigo,
          observaciones: c.observaciones,
          proveedor: prov
            ? { id: prov.id, razon_social: prov.razon_social, nombre_comercial: prov.nombre_comercial }
            : null,
          items,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/almacen-abierto error:", error);
    return NextResponse.json({ error: "Error al listar OCs de almacén abierto" }, { status: 500 });
  }
}

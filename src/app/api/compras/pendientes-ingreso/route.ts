import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar OCs pendientes de recepción.
// Sólo se incluyen OCs ya APROBADAS por el admin: estado PROCESO (aceptadas y
// aún por recibir) o INCOMPLETO (parcialmente recibidas). Las OCs en PEND_OC
// (pendientes de aprobación) NO deben aparecer acá — primero deben ser
// aceptadas en /compras (botón "Aceptar OC").
//
// 2026-06: ahora también se incluyen OCs cuyos items son SOLO "libres" (sin
// material_id, ej. items CAD como "Barra Cromada D 40x450"). En ese caso los
// items vienen de `ot_repuestos` en vez de `compra_detalle`. La UI los recibe
// con `repuesto_id` para que la API de recepción los matchee.
export async function GET() {
  try {
    const compras = await prisma.compra.findMany({
      where: { status_oc_codigo: { in: ["PROCESO", "INCOMPLETO"] } },
      include: {
        proveedor: { select: { id: true, razon_social: true } },
        ubicacion: { select: { codigo: true, nombre: true } },
        moneda: { select: { codigo: true } },
        detalles: {
          include: { material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true } } },
        },
        // Para OCs creadas desde requerimientos con items free (sin material_id),
        // necesitamos ot_repuestos como fuente alternativa.
        ot_repuestos: {
          select: {
            id: true,
            material_id: true,
            material_codigo: true,
            descripcion: true,
            unidad_medida: true,
            cantidad: true,
            cantidad_recibida: true,
            precio_unitario: true,
          },
        },
      },
      orderBy: { fecha_solicitud: "desc" },
    });

    type C = typeof compras[number];
    type D = C["detalles"][number];
    type R = C["ot_repuestos"][number];

    const data = compras
      .map((c: C) => {
        // Caso 1 (mayoritario): la OC tiene CompraDetalle → items vienen de ahí.
        // Cada item con `cantidad` = pendiente (cantidad − cantidad_recibida).
        const itemsDetalles = c.detalles
          .map((d: D) => {
            const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida ?? 0);
            return {
              id: d.id,
              repuesto_id: null as number | null,
              material_id: d.material_id as number | null,
              codigo: d.material?.codigo ?? null,
              descripcion: d.material?.descripcion ?? null,
              unidad_medida: d.material?.unidad_medida_codigo ?? "und",
              cantidad: pendiente,
              precio_unitario: d.precio_unitario != null ? Number(d.precio_unitario) : null,
            };
          })
          .filter((it) => it.cantidad > 0);

        // Caso 2: si NO hay detalles pero sí hay ot_repuestos (items free),
        // los listamos como fuente alternativa. Cada uno se identifica por
        // su `repuesto_id` para que el API de recepción lo matchee directamente.
        const itemsRepuestos = itemsDetalles.length === 0
          ? c.ot_repuestos
            .map((r: R) => {
              const pendiente = Number(r.cantidad) - Number(r.cantidad_recibida ?? 0);
              return {
                id: r.id,
                repuesto_id: r.id,
                material_id: r.material_id as number | null,
                codigo: r.material_codigo ?? null,
                descripcion: r.descripcion ?? null,
                unidad_medida: r.unidad_medida ?? "und",
                cantidad: pendiente,
                precio_unitario: r.precio_unitario != null ? Number(r.precio_unitario) : null,
              };
            })
            .filter((it) => it.cantidad > 0)
          : [];

        return {
          id: c.id,
          numero_po: c.numero_po,
          proveedor_nombre: c.proveedor?.razon_social ?? null,
          ubicacion_nombre: c.ubicacion?.nombre ?? null,
          fecha_solicitud: c.fecha_solicitud,
          fecha_entrega_esperada: c.fecha_entrega_esperada,
          status_oc_codigo: c.status_oc_codigo,
          total: c.total,
          moneda: c.moneda?.codigo ?? c.moneda_codigo ?? null,
          observaciones: c.observaciones ?? null,
          nro_guia: c.nro_guia ?? null,
          nro_factura: c.nro_factura ?? null,
          guia_key: c.guia_key ?? null,
          guia_nombre: c.guia_nombre ?? null,
          factura_key: c.factura_key ?? null,
          factura_nombre: c.factura_nombre ?? null,
          items: itemsDetalles.length > 0 ? itemsDetalles : itemsRepuestos,
        };
      })
      // OCs sin items pendientes no aparecen (probablemente ya recibidas).
      .filter((c) => c.items.length > 0);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/pendientes-ingreso error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

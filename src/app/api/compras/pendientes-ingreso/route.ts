import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar OCs pendientes de recepción.
// Sólo se incluyen OCs ya APROBADAS por el admin: estado PROCESO (aceptadas y
// aún por recibir) o INCOMPLETO (parcialmente recibidas). Las OCs en PEND_OC
// (pendientes de aprobación) NO deben aparecer acá — primero deben ser
// aceptadas en /compras (botón "Aceptar OC").
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
      },
      orderBy: { fecha_solicitud: "desc" },
    });

    type C = typeof compras[number];
    type D = C["detalles"][number];
    // Los items por recibir se derivan de `compraDetalle` (la fuente que también
    // usa `ingreso-po` para actualizar `cantidad_recibida`). Cada item muestra
    // SOLO la cantidad pendiente (cantidad - cantidad_recibida).
    const data = compras
      .map((c: C) => ({
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
        guia_archivo: c.guia_archivo ?? null,
        guia_nombre: c.guia_nombre ?? null,
        factura_archivo: c.factura_archivo ?? null,
        factura_nombre: c.factura_nombre ?? null,
        items: c.detalles
          .map((d: D) => {
            const pendiente = Number(d.cantidad) - Number(d.cantidad_recibida ?? 0);
            return {
              id: d.id,
              material_id: d.material_id,
              codigo: d.material?.codigo ?? null,
              descripcion: d.material?.descripcion ?? null,
              unidad_medida: d.material?.unidad_medida_codigo ?? "und",
              cantidad: pendiente,
              precio_unitario: d.precio_unitario != null ? Number(d.precio_unitario) : null,
            };
          })
          .filter((it) => it.cantidad > 0),
      }))
      // OCs sin items pendientes no aparecen (probablemente ya recibidas).
      .filter((c) => c.items.length > 0);

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/pendientes-ingreso error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar OCs pendientes de recepción
export async function GET() {
  try {
    const compras = await prisma.compra.findMany({
      where: { status_oc_codigo: { in: ["PEND_OC", "PROCESO"] } },
      include: {
        proveedor: { select: { id: true, razon_social: true } },
        ubicacion: { select: { codigo: true, nombre: true } },
        moneda: { select: { codigo: true } },
        detalles: {
          include: { material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true } } },
        },
        ot_repuestos: {
          include: {
            material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true } },
          },
        },
      },
      orderBy: { fecha_solicitud: "desc" },
    });

    type C = typeof compras[number];
    type R = C["ot_repuestos"][number];
    const data = compras.map((c: C) => ({
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
      items: c.ot_repuestos
        .filter((r: R) => r.material_id)
        .map((r: R) => ({
          id: r.id,
          material_id: r.material_id!,
          codigo: r.material?.codigo ?? r.material_codigo ?? null,
          descripcion: r.material?.descripcion ?? r.descripcion ?? null,
          unidad_medida: r.material?.unidad_medida_codigo ?? r.unidad_medida ?? "und",
          cantidad: Number(r.cantidad),
          precio_unitario: r.precio_unitario ? Number(r.precio_unitario) : null,
        })),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/pendientes-ingreso error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

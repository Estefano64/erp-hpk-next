import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listar OCs pendientes de recepción
export async function GET() {
  try {
    const compras = await prisma.compra.findMany({
      where: { estado: { in: ["Pendiente", "Aprobado", "En Proceso"] } },
      include: {
        proveedor: { select: { id: true, razonSocial: true } },
        almacen: { select: { id: true, nombre: true } },
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
      proveedor_nombre: c.proveedor?.razonSocial ?? null,
      almacen_nombre: c.almacen?.nombre ?? null,
      fecha_solicitud: c.fecha_solicitud,
      fecha_entrega_esperada: c.fecha_entrega_esperada,
      estado: c.estado,
      total: c.total,
      moneda: c.moneda,
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

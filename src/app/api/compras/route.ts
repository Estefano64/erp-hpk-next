import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Listar todas las compras (POs)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (estado) where.estado = estado;
    if (search) {
      where.OR = [
        { numero_po: { contains: search, mode: "insensitive" } },
        { numero_req: { contains: search, mode: "insensitive" } },
        { nro_factura: { contains: search, mode: "insensitive" } },
      ];
    }

    const records = await prisma.compra.findMany({
      where,
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        almacen: { select: { id: true, nombre: true } },
        orden_trabajo: { select: { id: true, ot: true } },
        detalles: {
          include: { material: { select: { codigo: true, descripcion: true } } },
        },
        _count: { select: { ot_repuestos: true } },
      },
      orderBy: { fecha_solicitud: "desc" },
    });

    type R = typeof records[number];
    const data = records.map((r: R) => ({
      id: r.id,
      numero_po: r.numero_po,
      numero_req: r.numero_req,
      ot_id: r.ot_id,
      ot_numero: r.orden_trabajo?.ot ?? null,
      proveedor_id: r.proveedor_id,
      proveedor_nombre: r.proveedor?.razonSocial ?? null,
      proveedor_ruc: r.proveedor?.ruc ?? null,
      almacen_id: r.almacen_id,
      almacen_nombre: r.almacen?.nombre ?? null,
      fecha_solicitud: r.fecha_solicitud,
      fecha_entrega_esperada: r.fecha_entrega_esperada,
      fecha_entrega_real: r.fecha_entrega_real,
      estado: r.estado,
      subtotal: r.subtotal,
      impuesto: r.impuesto,
      total: r.total,
      moneda: r.moneda,
      nro_factura: r.nro_factura,
      nro_guia: r.nro_guia,
      observaciones: r.observaciones,
      usuario_solicita: r.usuario_solicita,
      usuario_aprueba: r.usuario_aprueba,
      cantidad_items: r._count.ot_repuestos || r.detalles.length,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras error:", error);
    return NextResponse.json({ error: "Error al obtener compras" }, { status: 500 });
  }
}

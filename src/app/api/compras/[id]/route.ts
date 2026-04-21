import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET — obtener una PO por id con todos sus items
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const record = await prisma.compra.findUnique({
      where: { id: Number(id) },
      include: {
        proveedor: true,
        almacen: true,
        orden_trabajo: { select: { id: true, ot: true, descripcion: true } },
        detalles: { include: { material: true } },
        ot_repuestos: {
          include: {
            material: { select: { codigo: true, descripcion: true } },
            orden_trabajo: { select: { id: true, ot: true } },
          },
        },
      },
    });
    if (!record) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("GET /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener compra" }, { status: 500 });
  }
}

// PUT — actualizar
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    const campos = [
      "proveedor_id",
      "almacen_id",
      "estado",
      "fecha_entrega_esperada",
      "fecha_entrega_real",
      "nro_factura",
      "nro_guia",
      "observaciones",
      "usuario_aprueba",
    ];
    for (const c of campos) {
      if (body[c] !== undefined) {
        if (c.startsWith("fecha_") && body[c]) {
          data[c] = new Date(body[c]);
        } else {
          data[c] = body[c];
        }
      }
    }

    const record = await prisma.compra.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("PUT /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar compra" }, { status: 500 });
  }
}

// DELETE — solo si esta en estado Pendiente
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const compra = await prisma.compra.findUnique({ where: { id: Number(id) } });
    if (!compra) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    if (compra.estado !== "Pendiente") {
      return NextResponse.json({ error: "Solo se pueden eliminar compras en estado Pendiente" }, { status: 400 });
    }

    // Desvincular los requerimientos
    await prisma.oTRepuesto.updateMany({
      where: { po_id: Number(id) },
      data: { po_id: null, nro_oc: null, estado: "Aprobado" },
    });

    await prisma.compra.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "Compra eliminada" });
  } catch (error) {
    console.error("DELETE /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PUT — actualizar un requerimiento (aprobar, cotizar, actualizar precio, etc.)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    const campos = [
      "estado",
      "estado_cot",
      "proveedor_id",
      "precio_unitario",
      "precio_venta",
      "moneda",
      "fecha_entrega_esperada",
      "fecha_entrega_real",
      "fecha_oc",
      "nro_guia",
      "nro_factura_proveedor",
      "ubicacion",
      "observaciones",
      "usuario_aprueba",
      "fecha_aprobacion",
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

    const record = await prisma.oTRepuesto.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("PUT /api/requerimientos/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.oTRepuesto.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "Eliminado" });
  } catch (error) {
    console.error("DELETE /api/requerimientos/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

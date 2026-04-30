import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Mapeo POs2 estado <-> current status_oc_codigo
const labelToCode: Record<string, string> = {
  Pendiente: "PEND_OC",
  Aprobado: "PEND_OC",
  "En PO": "PEND_OC",
  "En Proceso": "PROCESO",
  Recibido: "COMPLETO",
  Cancelado: "ANULADO",
  COM: "COMPLETO",
  ANU: "ANULADO",
  DEV: "DEVOLUCION",
};

// PUT — actualizar un requerimiento (aprobar, cotizar, actualizar precio, etc.)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    // Mapeo de aliases POs2 a current
    if (body.estado !== undefined) {
      data.status_oc_codigo = labelToCode[body.estado] ?? body.estado;
    }
    if (body.estado_cot !== undefined) data.status_cotizacion_codigo = body.estado_cot;
    if (body.status_oc_codigo !== undefined) data.status_oc_codigo = body.status_oc_codigo;
    if (body.status_cotizacion_codigo !== undefined) data.status_cotizacion_codigo = body.status_cotizacion_codigo;
    if (body.status_requerimiento_codigo !== undefined) data.status_requerimiento_codigo = body.status_requerimiento_codigo;

    // Campos directos
    const camposDirectos = [
      "proveedor_id",
      "precio_unitario",
      "precio_venta",
      "moneda",
      "nro_guia",
      "nro_factura_proveedor",
      "ubicacion",
      "observaciones",
      "usuario_aprueba",
    ];
    for (const c of camposDirectos) {
      if (body[c] !== undefined) data[c] = body[c];
    }

    // Campos de fecha
    const camposFecha = ["fecha_entrega_esperada", "fecha_entrega_real", "fecha_oc", "fecha_aprobacion"];
    for (const c of camposFecha) {
      if (body[c] !== undefined) {
        data[c] = body[c] ? new Date(body[c]) : null;
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

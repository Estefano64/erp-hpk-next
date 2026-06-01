import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

type Params = { params: Promise<{ id: string }> };

// ── Mapeos status (POs2 ↔ current) ─────────────────────────────
const codeToLabel: Record<string, string> = {
  PEND_OC: "Pendiente",
  PROCESO: "En Proceso",
  ENTREGADO: "Recibido",
  INCOMPLETO: "En Proceso",
  COMPLETO: "Recibido",
  ANULADO: "Cancelado",
  DEVOLUCION: "Cancelado",
};
const labelToCode: Record<string, string> = {
  Pendiente: "PEND_OC",
  Aprobado: "PROCESO",
  "En Proceso": "PROCESO",
  Recibido: "COMPLETO",
  Cancelado: "ANULADO",
};

// GET — obtener una compra por id (DTO compatible con POs2)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const r = await prisma.compra.findUnique({
      where: { id: Number(id) },
      include: {
        proveedor: true,
        ubicacion: true,
        orden_trabajo: { select: { id: true, ot: true, descripcion: true } },
        detalles: {
          include: { material: { select: { material_id: true, codigo: true, descripcion: true, np: true } } },
          orderBy: { id: "asc" },
        },
        ot_repuestos: {
          include: {
            material: { select: { codigo: true, descripcion: true } },
            orden_trabajo: { select: { id: true, ot: true } },
          },
        },
      },
    });
    if (!r) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });

    type Repuesto = (typeof r.ot_repuestos)[number];
    const data = {
      id: r.id,
      numero_po: r.numero_po,
      numero_req: r.numero_req,
      ot_id: r.ot_id,
      proveedor: r.proveedor
        ? { id: r.proveedor.id, razonSocial: r.proveedor.razon_social, ruc: r.proveedor.ruc, direccion: r.proveedor.direccion, telefono: r.proveedor.telefono, email: r.proveedor.email, contacto: r.proveedor.contacto }
        : null,
      almacen: r.ubicacion ? { id: r.ubicacion_codigo, codigo: r.ubicacion.codigo, nombre: r.ubicacion.nombre } : null,
      ubicacion_codigo: r.ubicacion_codigo,
      orden_trabajo: r.orden_trabajo,
      fecha_solicitud: r.fecha_solicitud,
      fecha_entrega_esperada: r.fecha_entrega_esperada,
      fecha_entrega_real: r.fecha_entrega_real,
      estado: r.status_oc_codigo ? codeToLabel[r.status_oc_codigo] ?? r.status_oc_codigo : "Pendiente",
      status_oc_codigo: r.status_oc_codigo,
      subtotal: r.subtotal,
      descuento: r.descuento,
      impuesto: r.impuesto,
      otros: r.otros,
      total: r.total,
      moneda: r.moneda_codigo ?? "USD",
      nombre: r.nombre ?? null,
      proveedor_nombre: r.proveedor?.nombre_comercial ?? r.proveedor?.razon_social ?? null,
      nro_factura: r.nro_factura,
      nro_guia: r.nro_guia,
      tipo_pago: r.tipo_pago,
      dias_credito: r.dias_credito,
      guia_key: r.guia_key,
      guia_nombre: r.guia_nombre,
      guia_fecha_subida: r.guia_fecha_subida,
      factura_key: r.factura_key,
      factura_nombre: r.factura_nombre,
      factura_fecha_subida: r.factura_fecha_subida,
      observaciones: r.observaciones,
      usuario_solicita: r.usuario_solicita,
      usuario_aprueba: r.usuario_aprueba,
      detalles: r.detalles,
      ot_repuestos: r.ot_repuestos.map((rep: Repuesto) => ({
        id: rep.id,
        nro_req: rep.nro_req,
        item_req: rep.item_req,
        material_id: rep.material_id,
        material_codigo: rep.material_codigo,
        descripcion: rep.descripcion,
        texto: rep.texto,
        unidad_medida: rep.unidad_medida,
        cantidad: rep.cantidad,
        precio_unitario: rep.precio_unitario,
        moneda: rep.moneda,
        fabricante_codigo: rep.fabricante_codigo,
        estado: rep.status_oc_codigo
          ? codeToLabel[rep.status_oc_codigo] ?? rep.status_oc_codigo
          : "Pendiente",
        material: rep.material,
        orden_trabajo: rep.orden_trabajo,
      })),
    };

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener compra" }, { status: 500 });
  }
}

// PUT — actualizar compra (acepta params POs2 y traduce al schema current)
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const usuario = await getAuditUser(req);

    const data: Record<string, unknown> = {};
    // Aliases POs2 → current
    if (body.proveedor_id !== undefined) data.proveedor_id = body.proveedor_id;
    if (body.almacen_id !== undefined) data.ubicacion_codigo = body.almacen_id; // POs2 manda id, lo guardamos como código
    if (body.ubicacion_codigo !== undefined) data.ubicacion_codigo = body.ubicacion_codigo;
    if (body.estado !== undefined) {
      data.status_oc_codigo = labelToCode[body.estado] ?? body.estado;
    }
    if (body.status_oc_codigo !== undefined) data.status_oc_codigo = body.status_oc_codigo;
    if (body.moneda !== undefined) data.moneda_codigo = body.moneda;
    if (body.moneda_codigo !== undefined) data.moneda_codigo = body.moneda_codigo;
    for (const k of ["fecha_entrega_esperada", "fecha_entrega_real"]) {
      if (body[k] !== undefined) data[k] = parseDateOnly(body[k]);
    }
    for (const k of ["nro_factura", "nro_guia", "observaciones", "usuario_aprueba", "tipo_pago"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    // dias_credito: normalizamos para que CONTADO siempre sea 0/null y no
    // arrastre un plazo viejo si se cambió desde CREDITO.
    if (body.tipo_pago === "CONTADO") {
      data.dias_credito = 0;
    } else if (body.dias_credito !== undefined) {
      const n = Number(body.dias_credito);
      data.dias_credito = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
    // Descuento / otros (header-level): si vienen, recalcular total = subtotal - descuento + impuesto + otros
    let recalcularTotal = false;
    if (body.descuento !== undefined) { data.descuento = body.descuento; recalcularTotal = true; }
    if (body.otros !== undefined) { data.otros = body.otros; recalcularTotal = true; }
    if (usuario && data.usuario_aprueba === undefined) data.usuario_aprueba = usuario;

    const record = await prisma.compra.update({
      where: { id: Number(id) },
      data,
    });

    if (recalcularTotal) {
      const { Prisma } = await import("@prisma/client");
      const subtotal = new Prisma.Decimal(record.subtotal);
      const descuento = new Prisma.Decimal(record.descuento);
      const impuesto = new Prisma.Decimal(record.impuesto);
      const otros = new Prisma.Decimal(record.otros);
      const total = subtotal.minus(descuento).plus(impuesto).plus(otros);
      const updated = await prisma.compra.update({
        where: { id: record.id },
        data: { total },
      });
      return NextResponse.json({ data: updated });
    }
    return NextResponse.json({ data: record });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    console.error("PUT /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar compra" }, { status: 500 });
  }
}

// DELETE — solo si está en estado Pendiente (PEND_OC)
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const compra = await prisma.compra.findUnique({ where: { id: Number(id) } });
    if (!compra) return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    if (compra.status_oc_codigo !== "PEND_OC") {
      return NextResponse.json({ error: "Solo se pueden eliminar compras en estado Pendiente" }, { status: 400 });
    }

    // Desvincular requerimientos asociados
    await prisma.oTRepuesto.updateMany({
      where: { po_id: Number(id) },
      data: { po_id: null, nro_oc: null, status_oc_codigo: null },
    });

    await prisma.compra.delete({ where: { id: Number(id) } });
    return NextResponse.json({ message: "Compra eliminada" });
  } catch (error) {
    console.error("DELETE /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

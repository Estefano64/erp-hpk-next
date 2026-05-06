import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

// ── Mapeos de status entre POs2 (UI) y current (DB) ─────────────
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

const DetalleSchema = z.object({
  material_id: z.number().int().positive(),
  cantidad: z.coerce.number().positive(),
  precio_unitario: z.coerce.number().min(0).default(0),
  descuento: z.coerce.number().min(0).optional().nullable(),
  impuesto: z.coerce.number().min(0).optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
});

const CreateSchema = z.object({
  numero_po: z.string().trim().min(1),
  numero_req: z.string().trim().optional().nullable(),
  ot_id: z.number().int().positive().optional().nullable(),
  proveedor_id: z.number().int().positive(),
  fecha_solicitud: z.string().optional().nullable(),
  fecha_entrega_esperada: z.string().optional().nullable(),
  ubicacion_codigo: z.string().trim().optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  moneda_codigo: z.string().trim().optional().nullable(),
  nro_factura: z.string().trim().optional().nullable(),
  nro_guia: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
  detalles: z.array(DetalleSchema).optional().default([]),
});

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// GET — Listar compras (devuelve DTO compatible con POs2)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estadoLabel = searchParams.get("estado");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (estadoLabel) {
      // Aceptar nombre "Pendiente" o código "PEND_OC"
      const code = labelToCode[estadoLabel] ?? estadoLabel;
      where.status_oc_codigo = code;
    }
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
        proveedor: { select: { id: true, razon_social: true, ruc: true } },
        ubicacion: { select: { codigo: true, nombre: true } },
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
      proveedor_nombre: r.proveedor?.razon_social ?? null,
      proveedor_ruc: r.proveedor?.ruc ?? null,
      almacen_id: r.ubicacion_codigo, // alias para compatibilidad POs2
      almacen_nombre: r.ubicacion?.nombre ?? null,
      ubicacion_codigo: r.ubicacion_codigo,
      fecha_solicitud: r.fecha_solicitud,
      fecha_entrega_esperada: r.fecha_entrega_esperada,
      fecha_entrega_real: r.fecha_entrega_real,
      estado: r.status_oc_codigo ? codeToLabel[r.status_oc_codigo] ?? r.status_oc_codigo : "Pendiente",
      status_oc_codigo: r.status_oc_codigo,
      subtotal: r.subtotal,
      impuesto: r.impuesto,
      total: r.total,
      moneda: r.moneda_codigo ?? "USD",
      nro_factura: r.nro_factura,
      nro_guia: r.nro_guia,
      guia_archivo: r.guia_archivo,
      guia_nombre: r.guia_nombre,
      factura_archivo: r.factura_archivo,
      factura_nombre: r.factura_nombre,
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

// POST — Crear compra manualmente (mantiene la lógica robusta del current con audit + zod)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const d = parsed.data;

    let subtotal = 0;
    let impuestoTotal = 0;
    const detallesData = d.detalles.map((x) => {
      const sub = x.cantidad * x.precio_unitario;
      const desc = Number(x.descuento ?? 0);
      const imp = Number(x.impuesto ?? 0);
      const total = sub - desc + imp;
      subtotal += sub - desc;
      impuestoTotal += imp;
      return {
        material_id: x.material_id,
        cantidad: x.cantidad,
        precio_unitario: x.precio_unitario,
        subtotal: sub,
        descuento: desc,
        impuesto: imp,
        total,
        status_oc_codigo: x.status_oc_codigo ?? d.status_oc_codigo ?? null,
        observaciones: x.observaciones ?? null,
      };
    });
    const total = subtotal + impuestoTotal;

    const created = await prisma.compra.create({
      data: {
        numero_po: d.numero_po,
        numero_req: d.numero_req ?? null,
        ot_id: d.ot_id ?? null,
        proveedor_id: d.proveedor_id,
        fecha_solicitud: toDate(d.fecha_solicitud) ?? new Date(),
        fecha_entrega_esperada: toDate(d.fecha_entrega_esperada),
        ubicacion_codigo: d.ubicacion_codigo ?? null,
        status_oc_codigo: d.status_oc_codigo ?? "PEND_OC",
        moneda_codigo: d.moneda_codigo ?? null,
        nro_factura: d.nro_factura ?? null,
        nro_guia: d.nro_guia ?? null,
        observaciones: d.observaciones ?? null,
        usuario_solicita: usuario,
        subtotal,
        impuesto: impuestoTotal,
        total,
        detalles: { create: detallesData },
      },
      include: { detalles: true, proveedor: true, status_oc: true },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "numero_po ya existe" }, { status: 409 });
    }
    console.error("POST /api/compras error:", error);
    return NextResponse.json({ error: "Error al crear compra" }, { status: 500 });
  }
}

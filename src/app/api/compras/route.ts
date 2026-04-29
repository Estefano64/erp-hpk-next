import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const estado = searchParams.get("estado")?.trim();
    const proveedorId = searchParams.get("proveedor_id");
    const otId = searchParams.get("ot_id");

    const where: Record<string, unknown> = {};
    if (estado) where.status_oc_codigo = estado;
    if (proveedorId) where.proveedor_id = Number(proveedorId);
    if (otId) where.ot_id = Number(otId);
    if (search) {
      where.OR = [
        { numero_po: { contains: search, mode: "insensitive" } },
        { numero_req: { contains: search, mode: "insensitive" } },
        { nro_factura: { contains: search, mode: "insensitive" } },
        { nro_guia: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.compra.findMany({
        where,
        include: {
          proveedor: { select: { id: true, ruc: true, razon_social: true, nombre_comercial: true } },
          status_oc: true,
          moneda: true,
          orden_trabajo: { select: { id: true, ot: true } },
          _count: { select: { detalles: true } },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.compra.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/compras error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";
    const d = parsed.data;

    // Calcular totales
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

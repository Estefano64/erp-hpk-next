import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  material_id: z.coerce.number().int().positive(),
  proveedor_id: z.coerce.number().int().positive(),
  precio_unitario: z.coerce.number().min(0),
  moneda_codigo: z.string().trim().max(10).optional().nullable(),
  observaciones: z.string().trim().max(300).optional().nullable(),
  usuario: z.string().trim().optional().nullable(),
});

// POST — upsert de la cotización manual (override) de un material a un proveedor.
// Si precio = 0 se elimina la cotización (vuelve a usar el precio de OC real).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    if (d.precio_unitario <= 0) {
      await prisma.cotizacionProveedor.deleteMany({
        where: { material_id: d.material_id, proveedor_id: d.proveedor_id },
      });
      return NextResponse.json({ message: "Cotización eliminada (usa precio de OC)" });
    }

    const record = await prisma.cotizacionProveedor.upsert({
      where: { material_id_proveedor_id: { material_id: d.material_id, proveedor_id: d.proveedor_id } },
      create: {
        material_id: d.material_id,
        proveedor_id: d.proveedor_id,
        precio_unitario: d.precio_unitario,
        moneda_codigo: d.moneda_codigo || "USD",
        observaciones: d.observaciones || null,
        usuario: d.usuario || "sistema",
      },
      update: {
        precio_unitario: d.precio_unitario,
        moneda_codigo: d.moneda_codigo || "USD",
        observaciones: d.observaciones || null,
        usuario: d.usuario || "sistema",
        fecha: new Date(),
      },
    });
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("POST /api/compras/cotizaciones error:", error);
    return NextResponse.json({ error: "Error al guardar cotización" }, { status: 500 });
  }
}

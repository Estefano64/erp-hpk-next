import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Histórico de precios por (material × proveedor).
// Devuelve UNA fila por cada combinación material+proveedor con los datos
// de la compra MÁS RECIENTE (excluyendo compras anuladas/devueltas).
export async function GET() {
  try {
    const detalles = await prisma.compraDetalle.findMany({
      where: {
        compra: { status_oc_codigo: { notIn: ["ANULADO", "DEVOLUCION"] } },
      },
      include: {
        material: {
          select: { codigo: true, descripcion: true, unidad_medida_codigo: true },
        },
        compra: {
          select: {
            id: true,
            numero_po: true,
            fecha_solicitud: true,
            fecha_entrega_real: true,
            moneda_codigo: true,
            status_oc_codigo: true,
            proveedor: { select: { id: true, razon_social: true, ruc: true } },
          },
        },
      },
      orderBy: [
        { compra: { fecha_solicitud: "desc" } },
        { createdAt: "desc" },
      ],
    });

    type D = typeof detalles[number];

    const visto = new Set<string>();
    const data = [] as Array<{
      key: string;
      material_id: number;
      material_codigo: string | null;
      material_descripcion: string | null;
      unidad: string | null;
      proveedor_id: number;
      proveedor_razon_social: string;
      proveedor_ruc: string | null;
      precio_unitario: number;
      moneda: string | null;
      cantidad: number;
      fecha: Date | null;
      numero_po: string;
      compra_id: number;
      status_oc: string | null;
    }>;

    for (const d of detalles as D[]) {
      const provId = d.compra?.proveedor?.id;
      if (!provId) continue;
      const k = `${d.material_id}__${provId}`;
      if (visto.has(k)) continue;
      visto.add(k);
      data.push({
        key: k,
        material_id: d.material_id,
        material_codigo: d.material?.codigo ?? null,
        material_descripcion: d.material?.descripcion ?? null,
        unidad: d.material?.unidad_medida_codigo ?? null,
        proveedor_id: provId,
        proveedor_razon_social: d.compra.proveedor.razon_social,
        proveedor_ruc: d.compra.proveedor.ruc ?? null,
        precio_unitario: Number(d.precio_unitario),
        moneda: d.compra.moneda_codigo ?? null,
        cantidad: Number(d.cantidad),
        fecha: d.compra.fecha_entrega_real ?? d.compra.fecha_solicitud ?? null,
        numero_po: d.compra.numero_po,
        compra_id: d.compra.id,
        status_oc: d.compra.status_oc_codigo ?? null,
      });
    }

    const materialesUnicos = new Set(data.map((r) => r.material_id)).size;
    const proveedoresUnicos = new Set(data.map((r) => r.proveedor_id)).size;

    return NextResponse.json({
      data,
      stats: {
        combinaciones: data.length,
        materiales: materialesUnicos,
        proveedores: proveedoresUnicos,
      },
    });
  } catch (error) {
    console.error("GET /api/compras/historico error:", error);
    return NextResponse.json({ error: "Error obteniendo histórico" }, { status: 500 });
  }
}

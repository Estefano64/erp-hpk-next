import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Matriz "Listado de repuestos · precios unitarios por proveedor".
// Para cada material: precio por proveedor (cotización manual = override; si no,
// el último precio de una OC real), + precio mínimo, proveedor ganador y
// precio de la última compra.
export async function GET() {
  try {
    // 1) Precios reales: detalles de compra (no anuladas), ordenados por fecha desc.
    const detalles = await prisma.compraDetalle.findMany({
      where: { compra: { status_oc_codigo: { notIn: ["ANULADO", "DEVOLUCION"] } } },
      select: {
        material_id: true,
        precio_unitario: true,
        material: { select: { codigo: true, descripcion: true, np: true, fabricante_codigo: true } },
        compra: {
          select: {
            fecha_solicitud: true,
            fecha_entrega_real: true,
            moneda_codigo: true,
            proveedor: { select: { id: true, razon_social: true, nombre_comercial: true } },
          },
        },
      },
      orderBy: [{ compra: { fecha_solicitud: "desc" } }, { createdAt: "desc" }],
    });

    // 2) Cotizaciones manuales (override).
    const cotizaciones = await prisma.cotizacionProveedor.findMany({
      include: {
        material: { select: { codigo: true, descripcion: true, np: true, fabricante_codigo: true } },
        proveedor: { select: { id: true, razon_social: true, nombre_comercial: true } },
      },
    });

    type Celda = { precio: number; moneda: string; origen: "oc" | "cotizacion"; fecha: Date | null };
    interface MatAcc {
      material_id: number;
      codigo: string | null;
      np: string | null;
      descripcion: string | null;
      marca: string | null;
      precios: Record<number, Celda>;       // proveedor_id → celda
      ultima_compra_precio: number | null;
      ultima_compra_fecha: Date | null;
      ultima_compra_prov: string | null;
    }
    const mats = new Map<number, MatAcc>();
    const provs = new Map<number, string>();

    const provLabel = (p: { id: number; razon_social: string; nombre_comercial: string | null }) =>
      p.nombre_comercial ?? p.razon_social ?? `Prov.${p.id}`;

    // Precios reales (el primero por orden = el más reciente por par material/proveedor).
    for (const d of detalles) {
      const prov = d.compra?.proveedor;
      if (!prov) continue;
      provs.set(prov.id, provLabel(prov));
      if (!mats.has(d.material_id)) {
        mats.set(d.material_id, {
          material_id: d.material_id,
          codigo: d.material?.codigo ?? null,
          np: d.material?.np ?? null,
          descripcion: d.material?.descripcion ?? null,
          marca: d.material?.fabricante_codigo ?? null,
          precios: {},
          ultima_compra_precio: null,
          ultima_compra_fecha: null,
          ultima_compra_prov: null,
        });
      }
      const m = mats.get(d.material_id)!;
      const precio = Number(d.precio_unitario);
      const fecha = d.compra?.fecha_entrega_real ?? d.compra?.fecha_solicitud ?? null;
      // Solo registrar si no hay ya un precio (más reciente) para ese proveedor.
      if (!m.precios[prov.id]) {
        m.precios[prov.id] = { precio, moneda: d.compra?.moneda_codigo ?? "USD", origen: "oc", fecha };
      }
      // Última compra global del material (la primera que aparece = más reciente).
      if (m.ultima_compra_precio == null) {
        m.ultima_compra_precio = precio;
        m.ultima_compra_fecha = fecha;
        m.ultima_compra_prov = provLabel(prov);
      }
    }

    // Cotizaciones manuales: override (pisan el precio de OC en esa celda).
    for (const c of cotizaciones) {
      const prov = c.proveedor;
      provs.set(prov.id, provLabel(prov));
      if (!mats.has(c.material_id)) {
        mats.set(c.material_id, {
          material_id: c.material_id,
          codigo: c.material?.codigo ?? null,
          np: c.material?.np ?? null,
          descripcion: c.material?.descripcion ?? null,
          marca: c.material?.fabricante_codigo ?? null,
          precios: {},
          ultima_compra_precio: null,
          ultima_compra_fecha: null,
          ultima_compra_prov: null,
        });
      }
      const m = mats.get(c.material_id)!;
      m.precios[prov.id] = {
        precio: Number(c.precio_unitario),
        moneda: c.moneda_codigo,
        origen: "cotizacion",
        fecha: c.fecha,
      };
    }

    const proveedores = [...provs.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const materiales = [...mats.values()].map((m) => {
      let min = Infinity;
      let ganadorId: number | null = null;
      for (const [pid, c] of Object.entries(m.precios)) {
        if (c.precio > 0 && c.precio < min) { min = c.precio; ganadorId = Number(pid); }
      }
      return {
        ...m,
        precio_minimo: ganadorId != null ? min : null,
        proveedor_ganador: ganadorId != null ? (provs.get(ganadorId) ?? null) : null,
        proveedor_ganador_id: ganadorId,
      };
    }).sort((a, b) => (a.descripcion ?? "").localeCompare(b.descripcion ?? ""));

    return NextResponse.json({
      proveedores,
      materiales,
      stats: {
        materiales: materiales.length,
        proveedores: proveedores.length,
        cotizaciones: cotizaciones.length,
      },
    });
  } catch (error) {
    console.error("GET /api/compras/historico error:", error);
    return NextResponse.json({ error: "Error obteniendo histórico" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Mapeo POs2 estado <-> current status_oc_codigo ─────────
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
  Aprobado: "PEND_OC",
  "En PO": "PEND_OC",
  "En Proceso": "PROCESO",
  Recibido: "COMPLETO",
  Cancelado: "ANULADO",
  COM: "COMPLETO",
  ANU: "ANULADO",
  DEV: "DEVOLUCION",
};

// GET — Listar requerimientos (OTRepuesto) con filtros
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get("estado");
    const clienteId = searchParams.get("cliente_id");
    const otId = searchParams.get("ot_id");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    // Filtro por estado: el page envía nombre POs2 ("Pendiente"); mapeamos al code
    if (estado) {
      const code = labelToCode[estado] ?? estado;
      where.status_oc_codigo = code;
    } else {
      // Por defecto: excluir terminados/anulados/devueltos. Incluir los NULL (sin OC aún)
      where.OR = [
        { status_oc_codigo: null },
        { status_oc_codigo: { notIn: ["COMPLETO", "ANULADO", "DEVOLUCION"] } },
      ];
    }

    if (otId) where.ot_id = Number(otId);

    if (clienteId) {
      where.orden_trabajo = { id_cliente: Number(clienteId) };
    }

    if (search) {
      const searchOR = [
        { descripcion: { contains: search, mode: "insensitive" as const } },
        { material_codigo: { contains: search, mode: "insensitive" as const } },
        { nro_req: { contains: search, mode: "insensitive" as const } },
        { nro_oc: { contains: search, mode: "insensitive" as const } },
      ];
      // Si ya había OR (filtro estado por defecto), combinar con AND
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOR }];
        delete where.OR;
      } else {
        where.OR = searchOR;
      }
    }

    const records = await prisma.oTRepuesto.findMany({
      where,
      include: {
        material: {
          select: {
            material_id: true,
            codigo: true,
            descripcion: true,
            stock_actual: true,
          },
        },
        orden_trabajo: {
          select: {
            id: true,
            ot: true,
            equipo_codigo: true,
            descripcion: true,
            prioridad_atencion_codigo: true,
            cliente: {
              select: { cliente_id: true, codigo: true, nombre_comercial: true, razon_social: true },
            },
          },
        },
        proveedor: { select: { id: true, razon_social: true } },
        compra: { select: { id: true, numero_po: true } },
      },
      orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
    });

    type R = typeof records[number];
    const data = records.map((r: R) => ({
      id: r.id,
      ot_id: r.ot_id,
      numero_ot: r.orden_trabajo?.ot ?? null,
      equipo_codigo: r.orden_trabajo?.equipo_codigo ?? null,
      prioridad_atencion_codigo: r.orden_trabajo?.prioridad_atencion_codigo ?? null,
      cliente_id: r.orden_trabajo?.cliente?.cliente_id ?? null,
      cliente_nombre: r.orden_trabajo?.cliente?.nombre_comercial ?? r.orden_trabajo?.cliente?.razon_social ?? null,
      material_id: r.material_id,
      material_codigo: r.material?.codigo ?? r.material_codigo ?? null,
      material_nombre: r.material?.descripcion ?? null,
      stock_actual: r.material?.stock_actual ?? 0,
      nro_req: r.nro_req,
      item_req: r.item_req,
      tipo_codigo: r.tipo_codigo,
      cantidad: r.cantidad,
      descripcion: r.descripcion,
      texto: r.texto,
      fabricante_codigo: r.fabricante_codigo,
      unidad_medida: r.unidad_medida,
      fecha_solicitud: r.fecha_solicitud,
      fecha_requerida: r.fecha_requerida,
      estado: r.status_oc_codigo ? codeToLabel[r.status_oc_codigo] ?? r.status_oc_codigo : "Pendiente",
      estado_cot: r.status_cotizacion_codigo,
      po_id: r.po_id,
      numero_po: r.compra?.numero_po ?? null,
      nro_oc: r.nro_oc,
      proveedor_id: r.proveedor_id,
      proveedor_nombre: r.proveedor?.razon_social ?? null,
      precio_unitario: r.precio_unitario,
      moneda: r.moneda,
      fecha_oc: r.fecha_oc,
      fecha_entrega_esperada: r.fecha_entrega_esperada,
      fecha_entrega_real: r.fecha_entrega_real,
      ubicacion: r.ubicacion,
      observaciones: r.observaciones,
      es_adicional: r.es_adicional,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/requerimientos error:", error);
    return NextResponse.json({ error: "Error al obtener requerimientos" }, { status: 500 });
  }
}

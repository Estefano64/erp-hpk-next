import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/requerimientos — listado cross-OT con filtros, para módulo global de Logística.
//
// Query params soportados:
//   ot_id              número exacto
//   ot                 string (busca dentro de orden_trabajo.ot, contains)
//   status_req         código exacto del status_requerimiento
//   status_cot         código exacto del status_cotizacion
//   status_oc          código exacto del status_oc
//   tipo               MAC | CAD | SER
//   proveedor_id       número exacto
//   fecha_desde        ISO (filtra fecha_solicitud >= )
//   fecha_hasta        ISO (filtra fecha_solicitud <= )
//   solo_aprobados_sin_oc   "1" → status_req=APROBADO AND po_id IS NULL (útil para "items elegibles para OC")
//   search             texto: busca en descripcion / texto / nro_req / nro_oc / material_codigo
//   page, limit        paginación (default 1, 100)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(sp.get("limit") ?? 100)));

    const where: Record<string, unknown> = {};
    const otId = sp.get("ot_id");
    if (otId) where.ot_id = Number(otId);

    const ot = sp.get("ot")?.trim();
    if (ot) where.orden_trabajo = { ot: { contains: ot, mode: "insensitive" } };

    const statusReq = sp.get("status_req")?.trim();
    if (statusReq) where.status_requerimiento_codigo = statusReq;

    const statusCot = sp.get("status_cot")?.trim();
    if (statusCot) where.status_cotizacion_codigo = statusCot;

    const statusOC = sp.get("status_oc")?.trim();
    if (statusOC) where.status_oc_codigo = statusOC;

    const tipo = sp.get("tipo")?.trim();
    if (tipo) where.tipo_codigo = tipo;

    const proveedorId = sp.get("proveedor_id");
    if (proveedorId) where.proveedor_id = Number(proveedorId);

    const desde = sp.get("fecha_desde");
    const hasta = sp.get("fecha_hasta");
    if (desde || hasta) {
      const range: Record<string, Date> = {};
      if (desde) range.gte = new Date(desde);
      if (hasta) range.lte = new Date(hasta);
      where.fecha_solicitud = range;
    }

    if (sp.get("solo_aprobados_sin_oc") === "1") {
      where.status_requerimiento_codigo = "APROBADO";
      where.po_id = null;
    }

    const search = sp.get("search")?.trim();
    if (search) {
      where.OR = [
        { descripcion: { contains: search, mode: "insensitive" } },
        { texto: { contains: search, mode: "insensitive" } },
        { nro_req: { contains: search, mode: "insensitive" } },
        { nro_oc: { contains: search, mode: "insensitive" } },
        { material_codigo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.oTRepuesto.findMany({
        where,
        include: {
          orden_trabajo: {
            select: {
              id: true, ot: true,
              cliente: { select: { codigo: true, razon_social: true, nombre_comercial: true } },
              codigo_reparacion: { select: { codigo: true, descripcion: true } },
            },
          },
          material: { select: { codigo: true, descripcion: true, unidad_medida_codigo: true, stock_actual: true } },
          status_requerimiento: { select: { codigo: true, nombre: true } },
          status_cotizacion: { select: { codigo: true, nombre: true } },
          status_oc: { select: { codigo: true, nombre: true } },
          proveedor: { select: { id: true, razon_social: true } },
          compra: { select: { id: true, numero_po: true, status_oc_codigo: true } },
          adjuntos: { select: { id: true, nombre_archivo: true, ruta: true, tamano: true } },
        },
        orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.oTRepuesto.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/requerimientos error:", error);
    return NextResponse.json({ error: "Error al obtener requerimientos" }, { status: 500 });
  }
}

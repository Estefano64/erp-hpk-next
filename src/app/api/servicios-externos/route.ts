// GET /api/servicios-externos
// Lista requerimientos tipo SER con su seguimiento (envíos, adjuntos, ítems
// asociados, estado derivado y checklist documental).
//
// Query:
//   ot_id=N            → solo los SER de esa OT externa (pestaña Requerimientos)
//   ot_interna_id=N    → ídem OT interna
//   estado=X[,Y]       → filtra por estado derivado (ver SERVICIO_ESTADOS)
//   proveedor_id=N     → filtra por proveedor del último envío
//   solo_aprobados=1   → omite SER que aún no están APROBADOS (default en la
//                        vista global de Logística; la pestaña de OT los pide todos)
//   con_seguimiento=1  → solo SER con al menos un envío (la vista de Logística:
//                        un servicio aparece ahí cuando se le generó el
//                        seguimiento o la OC desde Requerimientos, 2026-10-23),
//                        más los SER con OC abierta sin envío (llegada directa)
//   q=texto            → busca en descripción / nro_req / guías
//   anio=YYYY          → año de la OT externa (vista global)
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { Prisma } from "@prisma/client";
import { prisma, SELECT_SER, cargarDocsOC, cargarLotes, serializarSer } from "@/lib/servicios-externos-server";
import { SERVICIO_ESTADOS, type ServicioEstado } from "@/lib/servicios-externos";

// Estados de OT que ya no admiten registrar llegada (mismo criterio que programacion-dashboard).
const OT_CERRADA = ["Cerrada", "Anulada", "Entregada", "No Ejecutada"];

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const sp = req.nextUrl.searchParams;
    const otId = sp.get("ot_id") ? Number(sp.get("ot_id")) : null;
    const otInternaId = sp.get("ot_interna_id") ? Number(sp.get("ot_interna_id")) : null;
    const proveedorId = sp.get("proveedor_id") ? Number(sp.get("proveedor_id")) : null;
    const anio = sp.get("anio") ? Number(sp.get("anio")) : null;
    const q = (sp.get("q") ?? "").trim();
    const soloAprobados = sp.get("solo_aprobados") === "1";
    const estados = (sp.get("estado") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ServicioEstado => (SERVICIO_ESTADOS as readonly string[]).includes(s));

    const where: Prisma.OTRepuestoWhereInput = { tipo_codigo: "SER" };
    if (otId != null && Number.isFinite(otId)) where.ot_id = otId;
    if (otInternaId != null && Number.isFinite(otInternaId)) where.orden_trabajo_interna_id = otInternaId;
    if (soloAprobados) where.status_requerimiento_codigo = "APROBADO";
    const and: Prisma.OTRepuestoWhereInput[] = [];
    // Con envío, o con OC abierta por recibir aunque nunca haya salido por el
    // seguimiento (OCs anteriores a 2026-10-23, ej. OC 260386): así logística
    // puede registrarles la llegada directa desde la vista por servicio.
    // Solo si la OT sigue abierta: los de OTs cerradas no se van a registrar
    // (decisión del usuario 2026-11-04).
    if (sp.get("con_seguimiento") === "1") {
      const otAbierta = {
        activo: true,
        OR: [{ ot_status_codigo: null }, { ot_status_codigo: { notIn: OT_CERRADA } }],
      };
      and.push({ OR: [
        { servicio_envios: { some: {} } },
        {
          po_id: { not: null },
          status_oc_codigo: { in: ["PROCESO", "INCOMPLETO"] },
          OR: [{ orden_trabajo: otAbierta }, { orden_trabajo_interna: otAbierta }],
        },
      ] });
    }
    if (anio != null && Number.isFinite(anio)) {
      where.orden_trabajo = { anio: anio % 100 };
    }
    if (q) {
      and.push({ OR: [
        { descripcion: { contains: q, mode: "insensitive" } },
        { nro_req: { contains: q, mode: "insensitive" } },
        { servicio_envios: { some: { OR: [
          { guia_salida: { contains: q, mode: "insensitive" } },
          { guia_llegada: { contains: q, mode: "insensitive" } },
          { guia_devolucion: { contains: q, mode: "insensitive" } },
          { nro_cotizacion: { contains: q, mode: "insensitive" } },
        ] } } },
      ] });
    }
    if (and.length) where.AND = and;

    const rows = await prisma.oTRepuesto.findMany({
      where,
      select: SELECT_SER,
      orderBy: [{ id: "desc" }],
      take: 2000,
    });

    const lotes = await cargarLotes(prisma, rows.flatMap((r) => r.servicio_envios.map((e) => e.lote_id)));
    const ocs = await cargarDocsOC(prisma, rows.map((r) => r.po_id));
    let data = rows.map((r) => serializarSer(r, lotes, ocs));
    if (estados.length > 0) data = data.filter((r) => estados.includes(r.estado));
    if (proveedorId != null && Number.isFinite(proveedorId)) {
      data = data.filter((r) => {
        const u = r.envios.length ? r.envios[r.envios.length - 1] : null;
        return u?.proveedor_id === proveedorId;
      });
    }

    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("GET /api/servicios-externos error:", error);
    return NextResponse.json({ error: "Error al listar servicios externos" }, { status: 500 });
  }
}

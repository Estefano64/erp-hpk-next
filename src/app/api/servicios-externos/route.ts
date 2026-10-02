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
//   q=texto            → busca en descripción / nro_req / guías
//   anio=YYYY          → año de la OT externa (vista global)
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { Prisma } from "@prisma/client";
import { prisma, SELECT_SER, serializarSer } from "@/lib/servicios-externos-server";
import { SERVICIO_ESTADOS, type ServicioEstado } from "@/lib/servicios-externos";

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
    if (anio != null && Number.isFinite(anio)) {
      where.orden_trabajo = { anio: anio % 100 };
    }
    if (q) {
      where.OR = [
        { descripcion: { contains: q, mode: "insensitive" } },
        { nro_req: { contains: q, mode: "insensitive" } },
        { servicio_envios: { some: { OR: [
          { guia_salida: { contains: q, mode: "insensitive" } },
          { guia_llegada: { contains: q, mode: "insensitive" } },
          { guia_devolucion: { contains: q, mode: "insensitive" } },
          { nro_cotizacion: { contains: q, mode: "insensitive" } },
        ] } } },
      ];
    }

    const rows = await prisma.oTRepuesto.findMany({
      where,
      select: SELECT_SER,
      orderBy: [{ id: "desc" }],
      take: 2000,
    });

    let data = rows.map(serializarSer);
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

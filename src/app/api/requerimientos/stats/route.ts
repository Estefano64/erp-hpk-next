import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/requerimientos/stats — KPIs agregados sobre TODO el conjunto filtrado,
// no sólo la página actual. Replica el `where` de GET /api/requerimientos.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
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

    // Rango fecha_solicitud: acepta fecha_desde/fecha_hasta (filtro principal)
    // o sol_desde/sol_hasta (filtro "Fecha solicitud" del pie).
    const desde = sp.get("fecha_desde") ?? sp.get("sol_desde");
    const hasta = sp.get("fecha_hasta") ?? sp.get("sol_hasta");
    if (desde || hasta) {
      const range: Record<string, Date> = {};
      if (desde) range.gte = new Date(desde);
      if (hasta) range.lte = new Date(hasta);
      where.fecha_solicitud = range;
    }
    // Rango fecha_requerida (filtro "Fecha requerida" del pie).
    const reqDesde = sp.get("req_desde");
    const reqHasta = sp.get("req_hasta");
    if (reqDesde || reqHasta) {
      const range: Record<string, Date> = {};
      if (reqDesde) range.gte = new Date(reqDesde);
      if (reqHasta) range.lte = new Date(reqHasta);
      where.fecha_requerida = range;
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

    const rows = await prisma.oTRepuesto.findMany({
      where,
      select: {
        id: true,
        ot_id: true,
        nro_req: true,
        cantidad: true,
        po_id: true,
        material_id: true,
        status_requerimiento_codigo: true,
        status_oc_codigo: true,
        precio_unitario: true,
        moneda: true,
        tipo_codigo: true,
        fecha_solicitud: true,
        fecha_aprobacion: true,
        fecha_oc: true,
        fecha_entrega_real: true,
        material: { select: { stock_actual: true, precio: true, moneda_codigo: true } },
      },
    });

    // ── Por item ──
    let aprob = 0, sinAprob = 0, conOC = 0, anul = 0;
    let porSolicitar = 0, sinStock = 0;
    let porLlegar = 0, enStock = 0;
    let cantidadTotal = 0, itemsActivos = 0;
    // Precio global:
    //   - Items con PO (po_id != null) → precio_unitario real de la OC.
    //   - Items sin PO → precio del catálogo (Material.precio). Servicios sin catálogo
    //     caen en precio_unitario si lo tienen, de lo contrario 0.
    //   - Excluye ANULADO / DESAPROBADO.
    const precioPorMoneda: Record<string, number> = {};
    const precioRealPorMoneda: Record<string, number> = {};
    const precioCatalogoPorMoneda: Record<string, number> = {};
    const grupos = new Map<string, typeof rows>();
    for (const r of rows) {
      const sr = r.status_requerimiento_codigo;
      const so = r.status_oc_codigo;
      if (sr === "APROBADO") aprob++;
      else if (sr === "SIN_APROBACION") sinAprob++;
      else if (sr === "ANULADO") anul++;
      if (r.po_id) conOC++;
      if (sr === "APROBADO" && !r.po_id) porSolicitar++;
      if (so === "PROCESO" || so === "INCOMPLETO") porLlegar++;
      const stockMat = Number(r.material?.stock_actual ?? 0);
      const cantReq = Number(r.cantidad ?? 0);
      const itemActivo = sr !== "ANULADO" && sr !== "DESAPROBADO";
      if (itemActivo && r.po_id == null && r.material_id != null && stockMat > 0 && stockMat >= cantReq) enStock++;
      if (r.material_id != null && stockMat <= 0) sinStock++;
      if (itemActivo) {
        cantidadTotal += cantReq;
        itemsActivos++;

        // Precio global: regla pedida (PO → real, sin PO → catálogo).
        let unit = 0;
        let mon = "USD";
        let esReal = false;
        if (r.po_id != null) {
          unit = Number(r.precio_unitario ?? 0);
          mon = r.moneda ?? "USD";
          esReal = true;
        } else if (r.material?.precio != null) {
          unit = Number(r.material.precio);
          mon = r.material.moneda_codigo ?? "USD";
        } else if (r.precio_unitario != null) {
          // Servicios u otros sin catálogo: fallback al precio cargado en el repuesto.
          unit = Number(r.precio_unitario);
          mon = r.moneda ?? "USD";
        }
        if (unit > 0) {
          const sub = unit * cantReq;
          precioPorMoneda[mon] = (precioPorMoneda[mon] ?? 0) + sub;
          if (esReal) precioRealPorMoneda[mon] = (precioRealPorMoneda[mon] ?? 0) + sub;
          else precioCatalogoPorMoneda[mon] = (precioCatalogoPorMoneda[mon] ?? 0) + sub;
        }
      }
      const gk = r.nro_req ?? `__sin_req_${r.id}`;
      if (!grupos.has(gk)) grupos.set(gk, []);
      grupos.get(gk)!.push(r);
    }
    const cantidadPromedio = itemsActivos > 0 ? cantidadTotal / itemsActivos : 0;

    // ── Por OT ── (cuántas OTs distintas y cuántos RQ/items por OT)
    const otsSet = new Set<number>();
    const rqPorOt = new Map<number, Set<string>>();
    for (const r of rows) {
      if (r.ot_id == null) continue;
      otsSet.add(r.ot_id);
      if (!rqPorOt.has(r.ot_id)) rqPorOt.set(r.ot_id, new Set());
      rqPorOt.get(r.ot_id)!.add(r.nro_req ?? `__sin_req_${r.id}`);
    }
    const otsDistintas = otsSet.size;
    const rqPorOtProm = otsDistintas > 0
      ? [...rqPorOt.values()].reduce((s, set) => s + set.size, 0) / otsDistintas
      : 0;
    const itemsPorOtProm = otsDistintas > 0 ? rows.length / otsDistintas : 0;

    // ── Tiempos (en días) ──
    const DIA_MS = 1000 * 60 * 60 * 24;
    const diffDias = (a: Date | null, b: Date | null): number | null => {
      if (!a || !b) return null;
      const d = (new Date(b).getTime() - new Date(a).getTime()) / DIA_MS;
      return d >= 0 ? d : null;
    };
    // Atención: solicitud → material recibido (fecha_entrega_real).
    const atencionDias: number[] = [];
    // Aprobado → OC: fecha_aprobacion → fecha_oc.
    const aprobOcDias: number[] = [];
    for (const r of rows) {
      const at = diffDias(r.fecha_solicitud, r.fecha_entrega_real);
      if (at != null) atencionDias.push(at);
      const ao = diffDias(r.fecha_aprobacion, r.fecha_oc);
      if (ao != null) aprobOcDias.push(ao);
    }
    const prom = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
    const tiempoAtencionProm = prom(atencionDias);
    const tiempoAprobOcProm = prom(aprobOcDias);
    const tiempoAtencionMuestras = atencionDias.length;
    const tiempoAprobOcMuestras = aprobOcDias.length;

    // ── Por RQ ──
    let rqTotal = 0, rqActivos = 0;
    let rqSinAprob = 0, rqPorSolicitar = 0, rqPorLlegar = 0, rqEnStock = 0, rqSinStock = 0;
    for (const items of grupos.values()) {
      rqTotal++;
      const tieneActivo = items.some(
        (i) => i.status_requerimiento_codigo !== "ANULADO" && i.status_requerimiento_codigo !== "DESAPROBADO",
      );
      if (tieneActivo) rqActivos++;
      if (items.some((i) => i.status_requerimiento_codigo === "SIN_APROBACION")) rqSinAprob++;
      if (items.some((i) => i.status_requerimiento_codigo === "APROBADO" && !i.po_id)) rqPorSolicitar++;
      if (items.some((i) => i.status_oc_codigo === "PROCESO" || i.status_oc_codigo === "INCOMPLETO")) rqPorLlegar++;
      if (items.some((i) => {
        const sm = Number(i.material?.stock_actual ?? 0);
        const cr = Number(i.cantidad ?? 0);
        const act = i.status_requerimiento_codigo !== "ANULADO" && i.status_requerimiento_codigo !== "DESAPROBADO";
        return act && i.po_id == null && i.material_id != null && sm > 0 && sm >= cr;
      })) rqEnStock++;
      if (items.some((i) => i.material_id != null && Number(i.material?.stock_actual ?? 0) <= 0)) rqSinStock++;
    }

    return NextResponse.json({
      stats: {
        // Por item
        totalItems: rows.length,
        itemsActivos,
        aprob, sinAprob, conOC, anul,
        porSolicitar, porLlegar, enStock, sinStock,
        cantidadTotal, cantidadPromedio,
        // Por OT
        otsDistintas, rqPorOtProm, itemsPorOtProm,
        // Tiempos (días promedio)
        tiempoAtencionProm, tiempoAtencionMuestras,
        tiempoAprobOcProm, tiempoAprobOcMuestras,
        // Por RQ
        rqTotal, rqActivos,
        rqSinAprob, rqPorSolicitar, rqPorLlegar, rqEnStock, rqSinStock,
        // Precio global (catálogo para sin PO + real para con PO), desglosado por moneda
        precioPorMoneda,
        precioRealPorMoneda,
        precioCatalogoPorMoneda,
      },
    });
  } catch (error) {
    console.error("GET /api/requerimientos/stats error:", error);
    return NextResponse.json({ error: "Error al obtener estadísticas" }, { status: 500 });
  }
}

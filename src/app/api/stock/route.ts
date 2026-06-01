/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — listado de stock de materiales
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("filtro"); // "bajo_stock" | "sin_stock" | "todos"
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { activo: true };
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { np: { contains: search, mode: "insensitive" } },
      ];
    }

    const materiales = await prisma.material.findMany({
      where,
      select: {
        material_id: true,
        codigo: true,
        descripcion: true,
        np: true,
        stock_actual: true,
        punto_reposicion: true,
        stock_maximo: true,
        unidad_medida_codigo: true,
        ubicacion: true,
        caja: true,
        precio: true,
        moneda_codigo: true,
        fabricante_codigo: true,
        categoria_codigo: true,
        clasificacion_codigo: true,
        // El nombre de la categoría se usa en /suministros para filtrar por
        // "Suministros" / "Consumibles" sin depender de los códigos cortos.
        categoria: { select: { nombre: true } },
      },
      orderBy: { codigo: "asc" },
    });

    // ── Cantidades en POs (compras pendientes/aprobadas/enviadas) ──
    const detallesEnPO = await prisma.compraDetalle.findMany({
      where: {
        compra: {
          status_oc_codigo: { notIn: ["COMPLETO", "ANULADO", "DEVOLUCION"] },
        },
      },
      select: {
        material_id: true,
        cantidad: true,
        compra: { select: { numero_po: true, ubicacion: { select: { nombre: true, codigo: true } } } },
      },
    });
    type DetEnPO = typeof detallesEnPO[number];
    const enPOMap = new Map<number, { cantidad: number; pos: string[]; almacenes: string[] }>();
    for (const d of detallesEnPO as DetEnPO[]) {
      const prev = enPOMap.get(d.material_id) ?? { cantidad: 0, pos: [], almacenes: [] };
      prev.cantidad += Number(d.cantidad);
      if (d.compra?.numero_po && !prev.pos.includes(d.compra.numero_po)) prev.pos.push(d.compra.numero_po);
      const almNombre = d.compra?.ubicacion?.nombre ?? d.compra?.ubicacion?.codigo;
      if (almNombre && !prev.almacenes.includes(almNombre)) prev.almacenes.push(almNombre);
      enPOMap.set(d.material_id, prev);
    }

    // ── Cantidades en REQ pendientes (sin asignar a OC) ──
    const reqsPendientes = await prisma.oTRepuesto.findMany({
      where: {
        status_oc_codigo: { notIn: ["COMPLETO", "ANULADO", "DEVOLUCION"] },
        po_id: null,
        material_id: { not: null },
      },
      select: { material_id: true, cantidad: true, nro_req: true },
    });
    type ReqP = typeof reqsPendientes[number];
    const enReqMap = new Map<number, { cantidad: number; reqs: string[] }>();
    for (const r of reqsPendientes as ReqP[]) {
      if (r.material_id == null) continue;
      const prev = enReqMap.get(r.material_id) ?? { cantidad: 0, reqs: [] };
      prev.cantidad += Number(r.cantidad);
      if (r.nro_req && !prev.reqs.includes(r.nro_req)) prev.reqs.push(r.nro_req);
      enReqMap.set(r.material_id, prev);
    }

    type Mat = typeof materiales[number];
    type StockItem = {
      material_id: number;
      codigo: string;
      descripcion: string;
      np: string | null;
      stock_actual: number;
      punto_reposicion: number;
      stock_maximo: number;
      unidad_medida: string | null;
      ubicacion: string | null;
      caja: string | null;
      precio: number | null;
      moneda: string | null;
      fabricante: string | null;
      categoria: string | null;
      categoria_nombre: string | null;
      clasificacion: string | null;
      valor_total: number;
      alerta: "OK" | "BAJO" | "SIN" | "EXCESO";
      cantidad_en_po: number;
      pos_pendientes: string[];
      cantidad_en_req: number;
      reqs_pendientes: string[];
      almacen: string | null;
      stock_proyectado: number;
      por_solicitar: number;
    };

    let data: StockItem[] = materiales.map((m: Mat) => {
      const stock = Number(m.stock_actual ?? 0);
      const punto = Number(m.punto_reposicion ?? 0);
      const maximo = Number(m.stock_maximo ?? 0);
      const enPO = enPOMap.get(m.material_id);
      const enReq = enReqMap.get(m.material_id);
      const cantPO = enPO?.cantidad ?? 0;
      const cantReq = enReq?.cantidad ?? 0;
      // Stock proyectado = stock actual + lo que viene en POs - lo que pidieron en requerimientos
      const proyectado = stock + cantPO - cantReq;
      // Por solicitar = lo que se necesita para llegar al máximo (si bajo de reposición)
      const porSolicitar = punto > 0 && proyectado <= punto && maximo > proyectado
        ? Math.max(0, maximo - proyectado)
        : 0;

      let alerta: "OK" | "BAJO" | "SIN" | "EXCESO" = "OK";
      if (stock <= 0) alerta = "SIN";
      else if (punto > 0 && stock <= punto) alerta = "BAJO";
      else if (maximo > 0 && stock > maximo) alerta = "EXCESO";

      return {
        material_id: m.material_id,
        codigo: m.codigo,
        descripcion: m.descripcion,
        np: m.np,
        stock_actual: stock,
        punto_reposicion: punto,
        stock_maximo: maximo,
        unidad_medida: m.unidad_medida_codigo,
        ubicacion: m.ubicacion,
        caja: m.caja,
        precio: m.precio ? Number(m.precio) : null,
        moneda: m.moneda_codigo,
        fabricante: m.fabricante_codigo,
        categoria: m.categoria_codigo,
        categoria_nombre: m.categoria?.nombre ?? null,
        clasificacion: m.clasificacion_codigo,
        valor_total: m.precio ? Number(m.precio) * stock : 0,
        alerta,
        cantidad_en_po: cantPO,
        pos_pendientes: enPO?.pos ?? [],
        cantidad_en_req: cantReq,
        reqs_pendientes: enReq?.reqs ?? [],
        almacen: enPO?.almacenes?.[0] ?? null,
        stock_proyectado: proyectado,
        por_solicitar: porSolicitar,
      };
    });

    if (filtro === "bajo_stock") data = data.filter((m: StockItem) => m.alerta === "BAJO");
    if (filtro === "sin_stock") data = data.filter((m: StockItem) => m.alerta === "SIN");
    if (filtro === "exceso") data = data.filter((m: StockItem) => m.alerta === "EXCESO");
    if (filtro === "por_solicitar") data = data.filter((m: StockItem) => m.por_solicitar > 0);
    if (filtro === "en_po") data = data.filter((m: StockItem) => m.cantidad_en_po > 0);
    if (filtro === "en_req") data = data.filter((m: StockItem) => m.cantidad_en_req > 0);
    if (filtro === "con_min_max") {
      data = data.filter((m: StockItem) => m.punto_reposicion > 0 && m.stock_maximo > 0);
    }
    if (filtro === "min_max_sin_stock") {
      data = data.filter((m: StockItem) =>
        m.punto_reposicion > 0 && m.stock_maximo > 0 && m.stock_actual <= 0,
      );
    }

    // KPIs
    const totalMateriales = data.length;
    const sinStock = data.filter((m: StockItem) => m.alerta === "SIN").length;
    const bajoStock = data.filter((m: StockItem) => m.alerta === "BAJO").length;
    const exceso = data.filter((m: StockItem) => m.alerta === "EXCESO").length;
    const enPO = data.filter((m: StockItem) => m.cantidad_en_po > 0).length;
    const enReq = data.filter((m: StockItem) => m.cantidad_en_req > 0).length;
    const porSolicitar = data.filter((m: StockItem) => m.por_solicitar > 0).length;
    const valorTotal = data.reduce((s: number, m: StockItem) => s + m.valor_total, 0);
    // Catálogos con punto_reposicion y stock_maximo configurados (>0)
    const conMinMax = data.filter(
      (m: StockItem) => m.punto_reposicion > 0 && m.stock_maximo > 0,
    ).length;
    // De los anteriores, cuántos están sin stock
    const conMinMaxSinStock = data.filter(
      (m: StockItem) =>
        m.punto_reposicion > 0 && m.stock_maximo > 0 && m.stock_actual <= 0,
    ).length;

    // Balance de inventario: total de ENTRADAS vs SALIDAS (y AJUSTE) sobre movimientos.
    const movAgrupado = await prisma.movimientoInventario.groupBy({
      by: ["tipo_movimiento"],
      _sum: { cantidad: true },
    });
    let totalEntradas = 0, totalSalidas = 0, totalAjustes = 0;
    for (const g of movAgrupado) {
      const q = Number(g._sum.cantidad ?? 0);
      if (g.tipo_movimiento === "ENTRADA") totalEntradas = q;
      else if (g.tipo_movimiento === "SALIDA") totalSalidas = q;
      else if (g.tipo_movimiento === "AJUSTE") totalAjustes = q;
    }
    const balanceStock = totalEntradas - totalSalidas + totalAjustes;

    return NextResponse.json({
      data,
      kpis: {
        totalMateriales, sinStock, bajoStock, exceso, enPO, enReq, porSolicitar, valorTotal,
        conMinMax, conMinMaxSinStock,
        totalEntradas, totalSalidas, totalAjustes, balanceStock,
      },
    });
  } catch (error) {
    console.error("GET /api/stock error:", error);
    return NextResponse.json({ error: "Error al obtener stock" }, { status: 500 });
  }
}

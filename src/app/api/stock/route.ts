import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularStockReservado, stockLibre } from "@/lib/stock-reservado";

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

    // Las 4 consultas son independientes → en paralelo. Los agregados de
    // POs/REQs se hacen en SQL (SUM + ARRAY_AGG) en vez de traer todas las
    // filas de compras_detalle / ot_repuestos a Node y agrupar en JS.
    type EnPORow = { material_id: number; cantidad: number; pos: string[]; almacenes: string[] };
    type EnReqRow = { material_id: number; cantidad: number; reqs: string[] };

    const [materiales, enPORows, enReqRows, movAgrupado] = await Promise.all([
      prisma.material.findMany({
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
      }),
      // ── Cantidades en POs (compras pendientes/aprobadas/enviadas) ──
      prisma.$queryRaw<EnPORow[]>`
        SELECT cd.material_id,
               COALESCE(SUM(cd.cantidad), 0)::float AS cantidad,
               ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.numero_po), NULL) AS pos,
               ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(u.nombre, u.codigo)), NULL) AS almacenes
        FROM compras_detalle cd
        JOIN compras c ON c.id = cd.compra_id
        LEFT JOIN ubicacion u ON u.codigo = c.ubicacion_codigo
        WHERE c.status_oc_codigo NOT IN ('COMPLETO', 'ANULADO', 'DEVOLUCION')
        GROUP BY cd.material_id
      `,
      // ── Cantidades en REQ pendientes (sin asignar a OC) ──
      prisma.$queryRaw<EnReqRow[]>`
        SELECT material_id,
               COALESCE(SUM(cantidad), 0)::float AS cantidad,
               ARRAY_REMOVE(ARRAY_AGG(DISTINCT nro_req), NULL) AS reqs
        FROM ot_repuestos
        WHERE status_oc_codigo NOT IN ('COMPLETO', 'ANULADO', 'DEVOLUCION')
          AND po_id IS NULL
          AND material_id IS NOT NULL
        GROUP BY material_id
      `,
      // Balance de inventario: total de ENTRADAS vs SALIDAS (y AJUSTE).
      prisma.movimientoInventario.groupBy({
        by: ["tipo_movimiento"],
        _sum: { cantidad: true },
      }),
    ]);

    // Del stock físico, cuánto ya tiene dueño: material que llegó de una OC
    // y espera en almacén a que se despache a la OT que lo pidió. Ese saldo
    // suma a `stock_actual` pero NO se puede tomar para otra cosa — es la
    // misma corrección que se aplicó al tab "Almacén" de /requerimientos.
    // Ver src/lib/stock-reservado.ts.
    const reservadoMap = await calcularStockReservado(
      prisma,
      materiales.map((m: { material_id: number }) => m.material_id),
    );

    const enPOMap = new Map<number, { cantidad: number; pos: string[]; almacenes: string[] }>(
      enPORows.map((r) => [r.material_id, { cantidad: r.cantidad, pos: r.pos, almacenes: r.almacenes }]),
    );
    const enReqMap = new Map<number, { cantidad: number; reqs: string[] }>(
      enReqRows.map((r) => [r.material_id, { cantidad: r.cantidad, reqs: r.reqs }]),
    );

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
      /** Del stock físico, cuánto está apartado para una OT concreta. */
      cantidad_reservada: number;
      /** Códigos de las OTs dueñas de ese material. */
      ots_reservadas: string[];
      /** stock_actual − cantidad_reservada: lo realmente tomable hoy. */
      stock_libre: number;
    };

    let data: StockItem[] = materiales.map((m: Mat) => {
      const stock = Number(m.stock_actual ?? 0);
      const punto = Number(m.punto_reposicion ?? 0);
      const maximo = Number(m.stock_maximo ?? 0);
      const enPO = enPOMap.get(m.material_id);
      const enReq = enReqMap.get(m.material_id);
      const cantPO = enPO?.cantidad ?? 0;
      const cantReq = enReq?.cantidad ?? 0;
      // "Disponible" engloba todo el material que existe o existirá ligado al
      // NP: lo físico en almacén + lo en tránsito en POs + lo reservado para
      // alguna OT (en REQ). Esta es la definición pedida por logística — antes
      // se restaba En REQ pero por convención del área se suma porque ya está
      // "comprometido" al NP (aunque asignado a una OT específica).
      const proyectado = stock + cantPO + cantReq;
      const reserva = reservadoMap.get(m.material_id);
      const cantReservada = reserva?.cantidad ?? 0;
      const libre = stockLibre(stock, cantReservada);
      // "Por solicitar" usa Stock LIBRE + En POs (sin sumar En REQ) — el
      // material reservado a una OT NO debería evitar nuevas compras del NP,
      // ni el que está pedido ni el que ya llegó y espera despacho. Si bajamos
      // del punto de reposición considerando solo lo que efectivamente va a
      // estar libre, sugerimos comprar hasta el máximo.
      const proyectadoParaCompra = libre + cantPO;
      const porSolicitar = punto > 0 && proyectadoParaCompra <= punto && maximo > proyectadoParaCompra
        ? Math.max(0, maximo - proyectadoParaCompra)
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
        cantidad_reservada: cantReservada,
        ots_reservadas: reserva?.ots ?? [],
        stock_libre: libre,
      };
    });

    if (filtro === "bajo_stock") data = data.filter((m: StockItem) => m.alerta === "BAJO");
    if (filtro === "sin_stock") data = data.filter((m: StockItem) => m.alerta === "SIN");
    if (filtro === "exceso") data = data.filter((m: StockItem) => m.alerta === "EXCESO");
    if (filtro === "por_solicitar") data = data.filter((m: StockItem) => m.por_solicitar > 0);
    if (filtro === "en_po") data = data.filter((m: StockItem) => m.cantidad_en_po > 0);
    if (filtro === "en_req") data = data.filter((m: StockItem) => m.cantidad_en_req > 0);
    if (filtro === "reservado") data = data.filter((m: StockItem) => m.cantidad_reservada > 0);
    // Material que "figura" en almacén pero entero comprometido con otras OTs:
    // el caso que hacía creer que había repuesto disponible cuando no lo había.
    if (filtro === "sin_libre") {
      data = data.filter((m: StockItem) => m.stock_actual > 0 && m.stock_libre <= 0);
    }
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
    const conReservado = data.filter((m: StockItem) => m.cantidad_reservada > 0).length;
    const sinLibre = data.filter((m: StockItem) => m.stock_actual > 0 && m.stock_libre <= 0).length;
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
        conReservado, sinLibre,
        conMinMax, conMinMaxSinStock,
        totalEntradas, totalSalidas, totalAjustes, balanceStock,
      },
    });
  } catch (error) {
    console.error("GET /api/stock error:", error);
    return NextResponse.json({ error: "Error al obtener stock" }, { status: 500 });
  }
}

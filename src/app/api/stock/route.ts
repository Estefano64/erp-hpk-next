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
      },
      orderBy: { codigo: "asc" },
    });

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
      clasificacion: string | null;
      valor_total: number;
      alerta: "OK" | "BAJO" | "SIN";
    };
    let data: StockItem[] = materiales.map((m: Mat) => {
      const stock = Number(m.stock_actual ?? 0);
      const punto = Number(m.punto_reposicion ?? 0);
      const maximo = Number(m.stock_maximo ?? 0);
      let alerta: "OK" | "BAJO" | "SIN" = "OK";
      if (stock <= 0) alerta = "SIN";
      else if (punto > 0 && stock <= punto) alerta = "BAJO";

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
        clasificacion: m.clasificacion_codigo,
        valor_total: m.precio ? Number(m.precio) * stock : 0,
        alerta,
      };
    });

    if (filtro === "bajo_stock") data = data.filter((m: StockItem) => m.alerta === "BAJO");
    if (filtro === "sin_stock") data = data.filter((m: StockItem) => m.alerta === "SIN");

    // KPIs
    const totalMateriales = data.length;
    const sinStock = data.filter((m: StockItem) => m.alerta === "SIN").length;
    const bajoStock = data.filter((m: StockItem) => m.alerta === "BAJO").length;
    const valorTotal = data.reduce((s: number, m: StockItem) => s + m.valor_total, 0);

    return NextResponse.json({
      data,
      kpis: { totalMateriales, sinStock, bajoStock, valorTotal },
    });
  } catch (error) {
    console.error("GET /api/stock error:", error);
    return NextResponse.json({ error: "Error al obtener stock" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — lista con filtros y paginación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const planta = searchParams.get("planta") ?? "";
    const area = searchParams.get("area") ?? "";
    const categoria = searchParams.get("categoria") ?? "";
    const clasificacion = searchParams.get("clasificacion") ?? "";
    const fabricante = searchParams.get("fabricante") ?? "";
    // Filtro opcional: cuando es "true", excluye materiales con código no
    // numérico — esos son entries auto-creados desde flujos como ingreso-po
    // de OCs abiertas (ej. "BC-PB8931" para BC Bearing) y NO son catalogados
    // formales (los catalogados tienen código de 6+ dígitos numéricos). La
    // tabla de /materiales pasa este flag; otros consumidores (OC editor,
    // requerimientos, etc.) no lo pasan para seguir viendo todo.
    const soloCatalogados = searchParams.get("solo_catalogados") === "true";

    const where: Record<string, unknown> = { activo: true };
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { np: { contains: search, mode: "insensitive" } },
      ];
    }
    if (planta) where.planta_codigo = planta;
    if (area) where.area_codigo = area;
    if (categoria) where.categoria_codigo = categoria;
    if (clasificacion) where.clasificacion_codigo = clasificacion;
    if (fabricante) where.fabricante_codigo = fabricante;
    // Heurística simple: los auto-creados (ej. "BC-PB8931") llevan guión en
    // el código; los catalogados formales son código numérico puro de 6+ dígitos
    // ("000123"). Usamos AND para no colisionar con el OR de búsqueda.
    if (soloCatalogados) {
      where.AND = [
        ...((where.AND as object[]) ?? []),
        { codigo: { not: { contains: "-" } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        include: {
          planta: true,
          area: true,
          categoria: true,
          clasificacion: true,
          unidad_medida: true,
          moneda: true,
          fabricante: true,
        },
        orderBy: { material_id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.material.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/materiales error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

// POST — crear nuevo material
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Generar código numérico auto-incremental. IMPORTANTE: hay que ignorar
    // TODOS los materiales con código no-numérico:
    //   - Auto-creados desde OCs abiertas: "BC-PB8931", "BC-58B5000590"
    //   - Regresiones históricas: "000NaN" (bug antiguo con parseInt sobre BC-*)
    //   - Cualquier código que no sea dígitos puros.
    // Usamos regex de Postgres via $queryRaw porque Prisma no soporta regex
    // en el where — así garantizamos que el MAX es el correlativo real.
    const rows = await prisma.$queryRaw<{ codigo: string }[]>`
      SELECT codigo FROM material
      WHERE codigo ~ '^[0-9]+$'
      ORDER BY LENGTH(codigo) DESC, codigo DESC
      LIMIT 1
    `;
    const lastCod = rows[0]?.codigo ?? "";
    const lastNum = /^\d+$/.test(lastCod) ? parseInt(lastCod, 10) : 0;
    const codigo = String(lastNum + 1).padStart(6, "0");

    const created = await prisma.material.create({
      data: {
        codigo,
        descripcion: body.descripcion,
        planta_codigo: body.planta_codigo,
        area_codigo: body.area_codigo,
        categoria_codigo: body.categoria_codigo,
        clasificacion_codigo: body.clasificacion_codigo,
        unidad_medida_codigo: body.unidad_medida_codigo,
        plazo_entrega: body.plazo_entrega ?? null,
        precio: body.precio ?? null,
        moneda_codigo: body.moneda_codigo || null,
        fabricante_codigo: body.fabricante_codigo || null,
        np: body.np || null,
        modelo: body.modelo || null,
        caja: body.caja || null,
        ubicacion: body.ubicacion || null,
        punto_reposicion: body.punto_reposicion ?? null,
        stock_maximo: body.stock_maximo ?? null,
      },
      include: {
        planta: true,
        area: true,
        categoria: true,
        clasificacion: true,
        unidad_medida: true,
        moneda: true,
        fabricante: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/materiales error:", error);
    // Devolvemos el mensaje real del error (Prisma incluye info útil para
    // diagnóstico: FK inválida, unique violation, etc.) — antes el frontend
    // solo veía "Error al guardar" y no había forma de saber qué falló.
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Error al crear", detail }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureFlotaCodigo } from "@/lib/flota";

// GET — lista con filtros y paginación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(10000, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const tipo = searchParams.get("tipo") ?? "";
    const flota = searchParams.get("flota") ?? "";
    const fabricante = searchParams.get("fabricante") ?? "";

    const where: Record<string, unknown> = { activo: true };
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { np: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tipo) where.tipo_codigo = tipo;
    if (flota) where.flota_codigo = flota;
    if (fabricante) where.fabricante_codigo = fabricante;

    const [data, total] = await Promise.all([
      prisma.codigoReparacion.findMany({
        where,
        include: {
          tipo: true,
          categoria: true,
          flota: true,
          fabricante: true,
          posicion: true,
          moneda: true,
        },
        orderBy: { cod_rep_id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.codigoReparacion.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/codigos-reparacion error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

// POST — crear nuevo código reparable
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Generar código auto-incremental
    const last = await prisma.codigoReparacion.findFirst({
      orderBy: { cod_rep_id: "desc" },
      select: { codigo: true },
    });
    const lastNum = last?.codigo ? parseInt(last.codigo.replace("CR-", ""), 10) : 0;
    const codigo = `CR-${String(lastNum + 1).padStart(4, "0")}`;

    // Flota escrita a mano: si no existe en el catálogo, se crea al vuelo.
    const flotaCodigo = await ensureFlotaCodigo(body.flota_codigo);
    if (!flotaCodigo) {
      return NextResponse.json({ error: "La flota es requerida" }, { status: 400 });
    }

    const created = await prisma.codigoReparacion.create({
      data: {
        codigo,
        descripcion: body.descripcion,
        tipo_codigo: body.tipo_codigo,
        categoria_codigo: body.categoria_codigo,
        flota_codigo: flotaCodigo,
        fabricante_codigo: body.fabricante_codigo || null,
        np: body.np || null,
        posicion_codigo: body.posicion_codigo || null,
        precio: body.precio ?? null,
        moneda_codigo: body.moneda_codigo || null,
      },
      include: {
        tipo: true,
        categoria: true,
        flota: true,
        fabricante: true,
        posicion: true,
        moneda: true,
      },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/codigos-reparacion error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

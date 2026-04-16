import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const equipoIncludes = {
  status: true,
  area: true,
  sub_area: true,
  tipo: true,
  fabricante: true,
  unidad_medida: true,
  planta: true,
  criticidad: true,
  moneda: true,
  ubicacion: true,
};

// GET — lista con filtros y paginación
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const tipo = searchParams.get("tipo") ?? "";
    const area = searchParams.get("area") ?? "";
    const subArea = searchParams.get("subArea") ?? "";
    const status = searchParams.get("status") ?? "";
    const planta = searchParams.get("planta") ?? "";
    const criticidad = searchParams.get("criticidad") ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { descripcion: { contains: search, mode: "insensitive" } },
        { modelo: { contains: search, mode: "insensitive" } },
        { numero_serie: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tipo) where.tipo_codigo = tipo;
    if (area) where.area_codigo = area;
    if (subArea) where.sub_area_codigo = subArea;
    if (status) where.status_codigo = status;
    if (planta) where.planta_codigo = planta;
    if (criticidad) where.criticidad_codigo = criticidad;

    const [data, total] = await Promise.all([
      prisma.equipo.findMany({
        where,
        include: equipoIncludes,
        orderBy: { equipo_id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.equipo.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/equipos error:", error);
    return NextResponse.json({ error: "Error al obtener equipos" }, { status: 500 });
  }
}

// POST — crear nuevo equipo
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar campos requeridos
    if (!body.codigo || !body.descripcion || !body.status_codigo || !body.area_codigo || !body.tipo_codigo || !body.planta_codigo) {
      return NextResponse.json({ error: "Campos requeridos: codigo, descripcion, status, area, tipo, planta" }, { status: 400 });
    }

    // Verificar código único
    const existing = await prisma.equipo.findUnique({ where: { codigo: body.codigo } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe un equipo con ese código" }, { status: 400 });
    }

    const created = await prisma.equipo.create({
      data: {
        codigo: body.codigo,
        descripcion: body.descripcion,
        status_codigo: body.status_codigo,
        area_codigo: body.area_codigo,
        sub_area_codigo: body.sub_area_codigo || null,
        tipo_codigo: body.tipo_codigo,
        fecha_inicio: body.fecha_inicio ? new Date(body.fecha_inicio) : null,
        fecha_fabricacion: body.fecha_fabricacion ? new Date(body.fecha_fabricacion) : null,
        fabricante_codigo: body.fabricante_codigo || null,
        modelo: body.modelo || null,
        numero_serie: body.numero_serie || null,
        numero_parte: body.numero_parte || null,
        capacidad: body.capacidad || null,
        unidad_medida_codigo: body.unidad_medida_codigo || null,
        observaciones: body.observaciones || null,
        planta_codigo: body.planta_codigo,
        criticidad_codigo: body.criticidad_codigo || null,
        precio: body.precio ?? null,
        moneda_codigo: body.moneda_codigo || null,
        ubicacion_codigo: body.ubicacion_codigo || null,
        cantidad: body.cantidad ?? 1,
        usuario_responsable: body.usuario_responsable || null,
      },
      include: equipoIncludes,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/equipos error:", error);
    return NextResponse.json({ error: "Error al crear equipo" }, { status: 500 });
  }
}

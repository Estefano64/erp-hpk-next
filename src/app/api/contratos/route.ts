import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/dates";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";
    const clienteId = searchParams.get("cliente") ?? "";

    const where: Record<string, unknown> = { activo: true };
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { cliente: { nombre_comercial: { contains: search, mode: "insensitive" } } },
        { cliente: { razon_social: { contains: search, mode: "insensitive" } } },
      ];
    }
    if (clienteId) where.cliente_id = Number(clienteId);

    const [data, total] = await Promise.all([
      prisma.contrato.findMany({
        where,
        include: {
          cliente: true,
          codigo_reparacion: true,
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contrato.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/contratos error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await prisma.contrato.create({
      data: {
        codigo: body.codigo,
        cliente_id: body.cliente_id,
        cod_rep_id: body.cod_rep_id || null,
        fecha_inicio: parseDateOnly(body.fecha_inicio)!,
        fecha_termino: parseDateOnly(body.fecha_termino)!,
        dias_reparacion: body.dias_reparacion,
        precio: body.precio,
      },
      include: {
        cliente: true,
        codigo_reparacion: true,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/contratos error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

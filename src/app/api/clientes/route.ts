import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)));
    const search = searchParams.get("search")?.trim() ?? "";

    const where: Record<string, unknown> = { activo: true };
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { razon_social: { contains: search, mode: "insensitive" } },
        { nombre_comercial: { contains: search, mode: "insensitive" } },
        { ruc: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { cliente_id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cliente.count({ where }),
    ]);

    return NextResponse.json({ data, total, page });
  } catch (error) {
    console.error("GET /api/clientes error:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usuario = await getAuditUser(req);
    const created = await prisma.cliente.create({
      data: {
        codigo: body.codigo,
        razon_social: body.razon_social,
        nombre_comercial: body.nombre_comercial || null,
        ruc: body.ruc || null,
        direccion: body.direccion || null,
        telefono: body.telefono || null,
        email: body.email || null,
        contacto_principal: body.contacto_principal || null,
        usuario_crea: usuario,
        usuario_actualiza: usuario,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/clientes error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

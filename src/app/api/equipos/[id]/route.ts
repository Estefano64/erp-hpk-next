import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

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

// GET — obtener un equipo por id
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const record = await prisma.equipo.findUnique({
      where: { equipo_id: Number(id) },
      include: equipoIncludes,
    });

    if (!record) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("GET /api/equipos/[id] error:", error);
    return NextResponse.json({ error: "Error al obtener equipo" }, { status: 500 });
  }
}

// PUT — actualizar un equipo
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Formatear fechas si vienen como string
    for (const field of ["fecha_inicio", "fecha_fabricacion"]) {
      if (body[field]) body[field] = new Date(body[field]);
    }

    const updated = await prisma.equipo.update({
      where: { equipo_id: Number(id) },
      data: body,
      include: equipoIncludes,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/equipos/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar equipo" }, { status: 500 });
  }
}

// DELETE — eliminar un equipo
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.equipo.delete({ where: { equipo_id: Number(id) } });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/equipos/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar equipo" }, { status: 500 });
  }
}

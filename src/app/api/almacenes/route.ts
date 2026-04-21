import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const data = await prisma.almacen.findMany({
      where: { estado: "Activo" },
      orderBy: { nombre: "asc" },
      select: { id: true, codigo: true, nombre: true, ubicacion: true },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/almacenes error:", error);
    return NextResponse.json({ error: "Error al obtener almacenes" }, { status: 500 });
  }
}

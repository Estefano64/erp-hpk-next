import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const data = await prisma.proveedor.findMany({
      where: { estado: "Activo" },
      orderBy: { razonSocial: "asc" },
      select: { id: true, razonSocial: true, ruc: true },
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/proveedores error:", error);
    return NextResponse.json({ error: "Error al obtener proveedores" }, { status: 500 });
  }
}

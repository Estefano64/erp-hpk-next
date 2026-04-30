import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Listar ubicaciones (alias "almacenes" para compatibilidad con POs2)
// El frontend de POs2 espera { id, nombre } — mapeamos desde Ubicacion (codigo, nombre)
export async function GET() {
  try {
    const ubicaciones = await prisma.ubicacion.findMany({
      where: { activo: true },
      orderBy: { codigo: "asc" },
    });

    const data = ubicaciones.map((u) => ({
      id: u.codigo, // POs2 usa "id" pero current usa código string
      codigo: u.codigo,
      nombre: u.nombre,
      descripcion: u.descripcion,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/almacenes error:", error);
    return NextResponse.json({ error: "Error al obtener ubicaciones" }, { status: 500 });
  }
}

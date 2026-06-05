import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — Devuelve los valores únicos de maquina_taller y actividad_codigo
// para alimentar los selects de filtro en la UI. Más liviano que pedir
// toda la lista para extraerlos en cliente.
export async function GET(_req: NextRequest) {
  try {
    const filas = await prisma.taskList.findMany({
      where: { activo: true },
      select: { maquina_taller: true, actividad_codigo: true },
      distinct: ["maquina_taller", "actividad_codigo"],
      orderBy: [{ maquina_taller: "asc" }, { actividad_codigo: "asc" }],
    });
    const maquinas = Array.from(new Set(filas.map((f) => f.maquina_taller))).sort();
    const actividades = Array.from(new Set(filas.map((f) => f.actividad_codigo))).sort();
    return NextResponse.json({ maquinas, actividades });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

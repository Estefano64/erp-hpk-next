import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowed: Record<string, keyof typeof prisma> = {
  tipoCodRep: "tipoCodRep",
  categoriaCodRep: "categoriaCodRep",
  flotaEquipo: "flotaEquipo",
  fabricante: "fabricante",
  posicion: "posicion",
  moneda: "moneda",
  planta: "planta",
  area: "area",
  subArea: "subArea",
  unidadMedida: "unidadMedida",
  categoria: "categoria",
  clasificacion: "clasificacion",
  statusEquipo: "statusEquipo",
  tipoEquipo: "tipoEquipo",
  criticidad: "criticidad",
  otStatus: "otStatus",
  recursosStatus: "recursosStatus",
  tallerStatus: "tallerStatus",
  cliente: "cliente",
  tipoReparacion: "tipoReparacion",
  prioridadAtencion: "prioridadAtencion",
  garantia: "garantia",
  atencionReparacion: "atencionReparacion",
  tipoGarantia: "tipoGarantia",
  baseMetalica: "baseMetalica",
  ubicacion: "ubicacion",
};

// Tablas que deben ordenarse por PK (respetando orden de inserción)
const orderByPK: Record<string, string> = {
  otStatus: "ot_status_id",
  recursosStatus: "recursos_status_id",
  tallerStatus: "taller_status_id",
  prioridadAtencion: "prioridad_atencion_id",
  atencionReparacion: "atencion_reparacion_id",
  tipoReparacion: "tipo_reparacion_id",
  tipoGarantia: "tipo_garantia_id",
  garantia: "garantia_id",
  baseMetalica: "base_metalica_id",
};

export async function GET(req: NextRequest) {
  const tabla = req.nextUrl.searchParams.get("tabla") ?? "";

  if (!allowed[tabla]) {
    return NextResponse.json({ error: `Tabla "${tabla}" no permitida` }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = prisma[allowed[tabla]] as any;

    const pk = orderByPK[tabla];
    const orderBy = pk ? { [pk]: "asc" } : { codigo: "asc" };

    const data = await model.findMany({
      where: { activo: true },
      orderBy,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/catalogos error:", error);
    return NextResponse.json({ error: "Error al obtener catálogo" }, { status: 500 });
  }
}

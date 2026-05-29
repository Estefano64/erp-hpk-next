// GET /api/ordenes-trabajo/facets
//
// Devuelve las opciones de los filtros de columna del listado de OTs (los de
// tipo enum/catálogo), para poblar los desplegables con TODAS las opciones —
// no solo las de la página actual, ya que el listado es server-side paginado.
// Cada opción es { value, text }: `value` es lo que se manda al filtro del GET.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      otStatus, recursosStatus, tallerStatus, prioridad,
      atencion, tipoRep, tipoGar, tipoOt, fabricantes, codReps,
    ] = await Promise.all([
      prisma.otStatus.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.recursosStatus.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.tallerStatus.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.prioridadAtencion.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.atencionReparacion.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.tipoReparacion.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.tipoGarantia.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.tipoOT.findMany({ select: { codigo: true, nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.fabricante.findMany({ select: { nombre: true }, orderBy: { nombre: "asc" } }),
      prisma.codigoReparacion.findMany({ select: { codigo: true }, orderBy: { codigo: "asc" } }),
    ]);

    // Años disponibles (2 dígitos), para el multi-select del listado.
    const aniosRows = await prisma.ordenTrabajo.findMany({
      where: { anio: { not: null } },
      select: { anio: true },
      distinct: ["anio"],
      orderBy: { anio: "desc" },
    });
    const anios = aniosRows.map((a) => a.anio).filter((a): a is number => a != null);

    const porCodigo = (rows: { codigo: string | null; nombre: string | null }[]) =>
      rows.filter((r) => r.codigo).map((r) => ({ value: r.codigo as string, text: r.nombre ?? r.codigo as string }));

    return NextResponse.json({
      ot_status: porCodigo(otStatus),
      recursos_status: porCodigo(recursosStatus),
      taller_status: porCodigo(tallerStatus),
      prioridad_atencion: porCodigo(prioridad),
      atencion_reparacion: porCodigo(atencion),
      tipo_reparacion: porCodigo(tipoRep),
      tipo_garantia: porCodigo(tipoGar),
      tipo_ot: porCodigo(tipoOt),
      // fabricante se filtra por nombre; codigo_reparacion por su código.
      fabricante: fabricantes.filter((f) => f.nombre).map((f) => ({ value: f.nombre as string, text: f.nombre as string })),
      codigo_reparacion: codReps.filter((c) => c.codigo).map((c) => ({ value: c.codigo as string, text: c.codigo as string })),
      anios,
    });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/facets error:", error);
    return NextResponse.json({ error: "Error obteniendo facetas" }, { status: 500 });
  }
}

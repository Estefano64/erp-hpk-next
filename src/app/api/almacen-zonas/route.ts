// GET /api/almacen-zonas — lista todas las zonas (con sus posiciones) ordenadas
// por `orden`. Sin paginación porque hay pocas zonas físicas (3-5 max).
// POST  — crea una zona nueva (solo admin).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";

export async function GET(_req: NextRequest) {
  try {
    const zonas = await prisma.almacenZona.findMany({
      where: { activo: true },
      include: {
        posiciones: {
          where: { activo: true },
          orderBy: { codigo: "asc" },
          select: { id: true, codigo: true, nombre: true },
        },
      },
      orderBy: [{ orden: "asc" }, { codigo: "asc" }],
    });
    return NextResponse.json({ data: zonas });
  } catch (e) {
    console.error("GET /api/almacen-zonas error:", e);
    return NextResponse.json({ error: "Error al listar zonas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo admin puede crear zonas" }, { status: 403 });
    }
    const body = await req.json();
    if (!body.codigo || !body.nombre) {
      return NextResponse.json({ error: "codigo y nombre son requeridos" }, { status: 400 });
    }
    const zona = await prisma.almacenZona.create({
      data: {
        codigo: String(body.codigo).toUpperCase().slice(0, 20),
        nombre: String(body.nombre).slice(0, 100),
        descripcion: body.descripcion ?? null,
        orden: Number(body.orden) || 0,
      },
    });
    return NextResponse.json({ data: zona }, { status: 201 });
  } catch (e) {
    console.error("POST /api/almacen-zonas error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

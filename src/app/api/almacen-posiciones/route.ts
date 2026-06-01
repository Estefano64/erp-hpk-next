// GET /api/almacen-posiciones?zona_id=N — lista posiciones de una zona (o todas).
// POST — crea posición nueva (admin).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const zonaId = sp.get("zona_id");
    const where: Record<string, unknown> = { activo: true };
    if (zonaId) where.zona_id = Number(zonaId);
    const posiciones = await prisma.almacenPosicion.findMany({
      where,
      include: { zona: { select: { codigo: true, nombre: true } } },
      orderBy: [{ zona_id: "asc" }, { codigo: "asc" }],
    });
    return NextResponse.json({ data: posiciones });
  } catch (e) {
    console.error("GET /api/almacen-posiciones error:", e);
    return NextResponse.json({ error: "Error al listar posiciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json({ error: "Solo admin puede crear posiciones" }, { status: 403 });
    }
    const body = await req.json();
    if (!body.zona_id || !body.codigo) {
      return NextResponse.json({ error: "zona_id y codigo son requeridos" }, { status: 400 });
    }
    const pos = await prisma.almacenPosicion.create({
      data: {
        zona_id: Number(body.zona_id),
        codigo: String(body.codigo).toUpperCase().slice(0, 20),
        nombre: body.nombre ?? null,
      },
    });
    return NextResponse.json({ data: pos }, { status: 201 });
  } catch (e) {
    console.error("POST /api/almacen-posiciones error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

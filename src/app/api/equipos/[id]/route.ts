import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
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
      where: { equipo_id: (parseInt4Safe(id) ?? 0) },
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
      if (body[field]) body[field] = parseDateOnly(body[field]);
    }

    const usuario = await getAuditUser(req);
    const updated = await prisma.equipo.update({
      where: { equipo_id: (parseInt4Safe(id) ?? 0) },
      data: { ...body, usuario_actualiza: usuario },
      include: equipoIncludes,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/equipos/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar equipo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const equipoId = parseInt4Safe(id) ?? 0;
    const force = new URL(req.url).searchParams.get("force") === "true";

    const equipo = await prisma.equipo.findUnique({
      where: { equipo_id: equipoId },
      select: { codigo: true },
    });
    if (!equipo) {
      return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    }

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json(
          { error: "Solo administradores pueden eliminar permanentemente" },
          { status: 403 }
        );
      }

      const [estrategias, ots] = await Promise.all([
        prisma.estrategia.count({ where: { equipo_codigo: equipo.codigo } }),
        prisma.ordenTrabajo.count({ where: { equipo_codigo: equipo.codigo } }),
      ]);

      if (estrategias > 0 || ots > 0) {
        const partes: string[] = [];
        if (estrategias > 0) partes.push(`${estrategias} estrategia(s)`);
        if (ots > 0) partes.push(`${ots} OT(s)`);
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `Tiene ${partes.join(" y ")} en el historial. Use "Desactivar" o cierre esas referencias.`,
            estrategias,
            ots,
          },
          { status: 409 }
        );
      }

      await prisma.equipo.delete({ where: { equipo_id: equipoId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    const usuario = await getAuditUser(req);
    await prisma.equipo.update({
      where: { equipo_id: equipoId },
      data: { activo: false, usuario_actualiza: usuario },
    });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error("DELETE /api/equipos/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar equipo" }, { status: 500 });
  }
}

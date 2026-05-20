import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  nombre: z.string().trim().min(1).max(300),
  descripcion: z.string().trim().max(2000).optional().nullable(),
});

// POST /api/servicios-reparacion
// Crea (o reutiliza) un servicio de reparación. Idempotente: si ya existe
// uno con el mismo nombre (case-insensitive), lo devuelve.
// Códigos: "SRV-NNNN" para los creados desde acá.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Idempotencia por descripción (campo visible) o por nombre (legacy).
    const existing = await prisma.servicioReparacion.findFirst({
      where: {
        OR: [
          { descripcion: { equals: d.nombre, mode: "insensitive" } },
          { nombre: { equals: d.nombre, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ data: existing, reused: true });
    }

    // Próximo código SRV-NNNN
    const prefix = "SRV-";
    const last = await prisma.servicioReparacion.findFirst({
      where: { codigo: { startsWith: prefix } },
      orderBy: { codigo: "desc" },
      select: { codigo: true },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.codigo.substring(prefix.length), 10);
      if (Number.isFinite(n)) next = n + 1;
    }
    const codigo = `${prefix}${String(next).padStart(4, "0")}`;

    // Guardamos el mismo texto en `nombre` (NOT NULL en BD) y `descripcion` (la
    // que ve el usuario). Si vino un descripcion adicional, respetarlo.
    const created = await prisma.servicioReparacion.create({
      data: {
        codigo,
        nombre: d.nombre,
        descripcion: d.descripcion ?? d.nombre,
      },
    });
    return NextResponse.json({ data: created, reused: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/servicios-reparacion error:", error);
    return NextResponse.json({ error: "Error al crear servicio" }, { status: 500 });
  }
}

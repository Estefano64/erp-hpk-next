import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  componente_codigo: z.string().trim().min(1),
  clasificacion: z.enum(["STD", "NO_STD"]).default("NO_STD"),
});

// POST /api/operaciones-reparacion
// Crea una operación de reparación con código auto-generado. Si ya existe una
// con el mismo nombre + componente + clasificación, devuelve esa (idempotente).
//
// Códigos: "NS-NNNN" para NO_STD, "ST-NNNN" para STD (cuando se crea desde acá).
// Las operaciones precargadas mantienen sus códigos cortos originales.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Idempotencia: si ya hay una operación con el mismo nombre para el mismo
    // componente + clasificación, la devolvemos en vez de crear duplicado.
    const existing = await prisma.operacionReparacion.findFirst({
      where: {
        componente_codigo: d.componente_codigo,
        clasificacion: d.clasificacion,
        nombre: { equals: d.nombre, mode: "insensitive" },
      },
    });
    if (existing) {
      return NextResponse.json({ data: existing, reused: true });
    }

    const prefix = d.clasificacion === "NO_STD" ? "NS-" : "ST-";

    // Próximo número: max actual con ese prefijo + 1
    const last = await prisma.operacionReparacion.findFirst({
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

    const created = await prisma.operacionReparacion.create({
      data: {
        codigo,
        nombre: d.nombre,
        componente_codigo: d.componente_codigo,
        clasificacion: d.clasificacion,
      },
    });

    return NextResponse.json({ data: created, reused: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/operaciones-reparacion error:", error);
    return NextResponse.json({ error: "Error al crear operación" }, { status: 500 });
  }
}

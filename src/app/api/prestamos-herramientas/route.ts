import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

const CreateSchema = z.object({
  herramienta_id: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().min(1).default(1),
  // Si viene trabajador_id, el nombre se completa desde la BD (snapshot).
  // Si no viene, se acepta prestado_a libre (cuadrillas externas, eventuales).
  trabajador_id: z.coerce.number().int().positive().optional().nullable(),
  prestado_a: z.string().trim().max(100).optional().nullable(),
  ot_id: z.coerce.number().int().positive().optional().nullable(),
  fecha_entrega: z.string().optional().nullable(),
  fecha_devolucion_prevista: z.string().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

// GET /api/prestamos-herramientas — listado con filtros
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const estado = sp.get("estado")?.trim();
    const herramientaId = sp.get("herramienta_id");
    const otId = sp.get("ot_id");
    const limit = Math.min(10000, Math.max(1, Number(sp.get("limit") ?? 500)));

    const where: Record<string, unknown> = {};
    if (estado) where.estado = estado;
    if (herramientaId) where.herramienta_id = Number(herramientaId);
    if (otId) where.ot_id = Number(otId);

    const data = await prisma.prestamoHerramienta.findMany({
      where,
      include: {
        herramienta: { select: { id: true, codigo: true, nombre: true, stock: true, asignadas: true } },
        orden_trabajo: { select: { id: true, ot: true } },
        trabajador: { select: { trabajador_id: true, nombre: true, dni: true, area: true, puesto: true } },
      },
      orderBy: [{ estado: "asc" }, { fecha_entrega: "desc" }],
      take: limit,
    });
    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error("GET /api/prestamos-herramientas error:", error);
    return NextResponse.json({ error: "Error al obtener préstamos" }, { status: 500 });
  }
}

// POST /api/prestamos-herramientas — crear préstamo y descontar stock disponible
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const h = await tx.herramienta.findUnique({ where: { id: d.herramienta_id } });
      if (!h) throw Object.assign(new Error("Herramienta no encontrada"), { status: 404 });
      const disponibles = h.stock - h.asignadas;
      if (d.cantidad > disponibles) {
        throw Object.assign(
          new Error(`Cantidad ${d.cantidad} excede disponibles (${disponibles} de ${h.stock})`),
          { status: 400 },
        );
      }

      // Resolver el nombre desde trabajador_id si vino; si no, exigir prestado_a.
      let prestadoA = d.prestado_a?.trim() ?? "";
      if (d.trabajador_id) {
        const trab = await tx.trabajador.findUnique({ where: { trabajador_id: d.trabajador_id } });
        if (!trab) throw Object.assign(new Error("Trabajador no encontrado"), { status: 404 });
        prestadoA = trab.nombre;
      }
      if (!prestadoA) {
        throw Object.assign(new Error("Debe indicar a quién se presta (trabajador o nombre)"), { status: 400 });
      }

      // Crea el préstamo
      const prestamo = await tx.prestamoHerramienta.create({
        data: {
          herramienta_id: d.herramienta_id,
          cantidad: d.cantidad,
          prestado_a: prestadoA,
          trabajador_id: d.trabajador_id ?? null,
          ot_id: d.ot_id ?? null,
          fecha_entrega: d.fecha_entrega ? parseDateOnly(d.fecha_entrega) ?? new Date() : new Date(),
          fecha_devolucion_prevista: d.fecha_devolucion_prevista ? parseDateOnly(d.fecha_devolucion_prevista) : null,
          observaciones: d.observaciones ?? null,
          estado: "PRESTADA",
          usuario_entrega: usuario,
        },
      });
      // Incrementa `asignadas`
      await tx.herramienta.update({
        where: { id: d.herramienta_id },
        data: { asignadas: { increment: d.cantidad } },
      });
      return prestamo;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    console.error("POST /api/prestamos-herramientas error:", error);
    return NextResponse.json({ error: "Error al crear préstamo" }, { status: 500 });
  }
}

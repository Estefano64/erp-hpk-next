import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser } from "@/lib/audit";
import { parseDateOnly } from "@/lib/dates";

import { parseInt4Safe } from "@/lib/ot-formato";
type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  fecha_devolucion_real: z.string().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

// POST /api/prestamos-herramientas/[id]/devolver
// Marca el préstamo como DEVUELTA y libera la cantidad de `asignadas`.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = (await getAuditUser(req)) ?? "sistema";

    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.prestamoHerramienta.findUnique({ where: { id: (parseInt4Safe(id) ?? 0) } });
      if (!p) throw Object.assign(new Error("Préstamo no encontrado"), { status: 404 });
      if (p.estado === "DEVUELTA") {
        throw Object.assign(new Error("Este préstamo ya fue devuelto."), { status: 400 });
      }
      const fechaReal = parsed.data.fecha_devolucion_real
        ? parseDateOnly(parsed.data.fecha_devolucion_real) ?? new Date()
        : new Date();
      const obs = parsed.data.observaciones
        ? (p.observaciones ? `${p.observaciones}\n— Devolución: ${parsed.data.observaciones}` : `Devolución: ${parsed.data.observaciones}`)
        : p.observaciones;

      const updated = await tx.prestamoHerramienta.update({
        where: { id: (parseInt4Safe(id) ?? 0) },
        data: {
          estado: "DEVUELTA",
          fecha_devolucion_real: fechaReal,
          usuario_recibe: usuario,
          observaciones: obs,
        },
      });
      // Libera la cantidad asignada
      await tx.herramienta.update({
        where: { id: p.herramienta_id },
        data: { asignadas: { decrement: p.cantidad } },
      });
      return updated;
    });

    return NextResponse.json({ data: result, message: "Préstamo devuelto" });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status) return NextResponse.json({ error: err.message ?? "Error" }, { status: err.status });
    console.error("POST devolver error:", error);
    return NextResponse.json({ error: "Error al devolver préstamo" }, { status: 500 });
  }
}

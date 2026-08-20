import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  almacen_zona_id: z.coerce.number().int().positive().nullable(),
  almacen_posicion_id: z.coerce.number().int().positive().optional().nullable(),
});

// PATCH /api/requerimientos/[id]/ubicacion
// Corrige la zona/posición física de almacén de un item (pedido 2026-08-20:
// logística puede reubicar el material mientras NO esté entregado). El gating
// de rol (admin + logistica) lo aplica el middleware vía REGLAS_ESCRITURA_API.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const itemId = parseInt4Safe(id) ?? 0;
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: itemId },
      select: { id: true, status_oc_codigo: true },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    // Item ya entregado al técnico: salió del almacén, la ubicación ya no aplica.
    if (current.status_oc_codigo === "ENTREGADO") {
      return NextResponse.json({ error: "El item ya fue entregado — ya no está en almacén." }, { status: 409 });
    }

    const zonaId = parsed.data.almacen_zona_id;
    // Sin zona no hay posición (la posición pertenece a una zona).
    const posicionId = zonaId == null ? null : parsed.data.almacen_posicion_id ?? null;

    if (zonaId != null) {
      const zona = await prisma.almacenZona.findUnique({ where: { id: zonaId }, select: { id: true } });
      if (!zona) return NextResponse.json({ error: "Zona de almacén inexistente." }, { status: 400 });
    }
    if (posicionId != null) {
      const pos = await prisma.almacenPosicion.findUnique({ where: { id: posicionId }, select: { zona_id: true } });
      if (!pos) return NextResponse.json({ error: "Posición de almacén inexistente." }, { status: 400 });
      if (pos.zona_id !== zonaId) {
        return NextResponse.json({ error: "La posición no pertenece a la zona elegida." }, { status: 400 });
      }
    }

    const updated = await prisma.oTRepuesto.update({
      where: { id: itemId },
      data: { almacen_zona_id: zonaId, almacen_posicion_id: posicionId },
      select: {
        id: true,
        almacen_zona: { select: { codigo: true, nombre: true } },
        almacen_posicion: { select: { id: true, codigo: true } },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("PATCH /api/requerimientos/[id]/ubicacion error:", error);
    return NextResponse.json({ error: "Error al actualizar la ubicación" }, { status: 500 });
  }
}

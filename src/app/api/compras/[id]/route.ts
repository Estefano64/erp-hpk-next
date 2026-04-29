import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// Transiciones válidas entre estados OC.
// null → PEND_OC → PROCESO → ENTREGADO → COMPLETO
//                         → INCOMPLETO → COMPLETO
// Desde cualquiera → ANULADO o DEVOLUCION
const VALID_TRANSITIONS: Record<string, string[]> = {
  "null": ["PEND_OC", "ANULADO"],
  "PEND_OC": ["PROCESO", "ANULADO"],
  "PROCESO": ["ENTREGADO", "INCOMPLETO", "ANULADO"],
  "ENTREGADO": ["COMPLETO", "INCOMPLETO", "DEVOLUCION"],
  "INCOMPLETO": ["COMPLETO", "DEVOLUCION", "ANULADO"],
  "COMPLETO": ["DEVOLUCION"],
  "ANULADO": [],
  "DEVOLUCION": ["COMPLETO", "ANULADO"],
};

function assertValidTransition(prev: string | null | undefined, next: string | null | undefined) {
  if (!next || prev === next) return { ok: true as const };
  const from = prev ?? "null";
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(next)) {
    return { ok: false as const, reason: `Transición inválida: ${from} → ${next}. Permitidas: ${allowed.join(", ") || "(ninguna)"}` };
  }
  return { ok: true as const };
}

const UpdateSchema = z.object({
  numero_po: z.string().trim().min(1).optional(),
  numero_req: z.string().trim().optional().nullable(),
  ot_id: z.number().int().positive().optional().nullable(),
  proveedor_id: z.number().int().positive().optional(),
  fecha_solicitud: z.string().optional().nullable(),
  fecha_entrega_esperada: z.string().optional().nullable(),
  fecha_entrega_real: z.string().optional().nullable(),
  ubicacion_codigo: z.string().trim().optional().nullable(),
  status_oc_codigo: z.string().trim().optional().nullable(),
  moneda_codigo: z.string().trim().optional().nullable(),
  nro_factura: z.string().trim().optional().nullable(),
  nro_guia: z.string().trim().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
});

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.compra.findUnique({
    where: { id: Number(id) },
    include: {
      proveedor: true,
      status_oc: true,
      moneda: true,
      ubicacion: true,
      orden_trabajo: { select: { id: true, ot: true, descripcion: true } },
      detalles: {
        include: {
          material: { select: { material_id: true, codigo: true, descripcion: true, np: true } },
          status_oc: true,
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }

    // Validar transición de estado si se está cambiando
    if (parsed.data.status_oc_codigo !== undefined) {
      const current = await prisma.compra.findUnique({ where: { id: compraId }, select: { status_oc_codigo: true } });
      if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      const check = assertValidTransition(current.status_oc_codigo, parsed.data.status_oc_codigo);
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
    }

    const usuario = await getAuditUser(req);
    const data: Record<string, unknown> = { usuario_aprueba: usuario };
    const dateFields = new Set(["fecha_solicitud", "fecha_entrega_esperada", "fecha_entrega_real"]);
    for (const k of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
      const v = parsed.data[k];
      if (v === undefined) continue;
      if (dateFields.has(k)) data[k] = toDate(v as string | null);
      else data[k] = v === "" ? null : v;
    }

    const updated = await prisma.compra.update({
      where: { id: compraId },
      data,
      include: { proveedor: true, status_oc: true, moneda: true, detalles: true },
    });
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") return NextResponse.json({ error: "numero_po ya existe" }, { status: 409 });
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("PUT /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const compraId = Number(id);
    const force = new URL(req.url).searchParams.get("force") === "true";

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json({ error: "Solo administradores pueden eliminar permanentemente" }, { status: 403 });
      }
      // Bloquear si ya hubo movimientos de inventario ligados a sus detalles
      const detalles = await prisma.compraDetalle.findMany({
        where: { compra_id: compraId },
        select: { id: true, cantidad_recibida: true },
      });
      const conRecepcion = detalles.filter((d) => Number(d.cantidad_recibida ?? 0) > 0).length;
      if (conRecepcion > 0) {
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `La compra tiene ${conRecepcion} línea(s) con recepción registrada. Solo se puede anular.`,
          },
          { status: 409 },
        );
      }
      await prisma.compra.delete({ where: { id: compraId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    // Soft: transición a ANULADO (respetar validación)
    const current = await prisma.compra.findUnique({ where: { id: compraId }, select: { status_oc_codigo: true } });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const check = assertValidTransition(current.status_oc_codigo, "ANULADO");
    if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

    const usuario = await getAuditUser(req);
    await prisma.compra.update({
      where: { id: compraId },
      data: { status_oc_codigo: "ANULADO", usuario_aprueba: usuario },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("DELETE /api/compras/[id] error:", error);
    return NextResponse.json({ error: "Error al anular" }, { status: 500 });
  }
}

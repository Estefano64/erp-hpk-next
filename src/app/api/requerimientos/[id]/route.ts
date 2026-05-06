import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/audit";
import { ESTADOS_REQ_LOCKED_DELETE } from "@/lib/requerimientos";

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  material_codigo: z.string().trim().optional().nullable(),
  cantidad: z.coerce.number().min(0.01).optional(),
  descripcion: z.string().trim().min(1).max(500).optional(),
  texto: z.string().trim().optional().nullable(),
  fabricante_codigo: z.string().trim().optional().nullable(),
  unidad_medida: z.string().trim().optional().nullable(),
  fecha_requerida: z.string().optional().nullable(),
  precio_unitario: z.coerce.number().min(0).optional().nullable(),
  precio_venta: z.coerce.number().min(0).optional().nullable(),
  moneda: z.string().trim().optional().nullable(),
  proveedor_id: z.coerce.number().int().positive().optional().nullable(),
  observaciones: z.string().trim().optional().nullable(),
  status_cotizacion_codigo: z.string().trim().optional().nullable(),
});

// PUT — editar requerimiento. Lockea cambios cuando ya tiene OC o está en estado terminal.
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const admin = await isAdmin(req);

    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: {
        id: true, status_requerimiento_codigo: true, status_oc_codigo: true,
        po_id: true, material_id: true, material_codigo: true, tipo_codigo: true,
      },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const tieneOC = current.po_id != null;
    const estadoActual = current.status_requerimiento_codigo ?? "BORRADOR";

    // Estados terminales: nadie edita ni siquiera admin
    if (estadoActual === "ANULADO") {
      return NextResponse.json({ error: "Requerimiento anulado, no editable." }, { status: 423 });
    }
    if (estadoActual === "DESAPROBADO") {
      return NextResponse.json({ error: "Requerimiento desaprobado, no editable." }, { status: 423 });
    }

    // BORRADOR: cualquier usuario edita libre
    // SIN_APROBACION o APROBADO: solo admin (y no si tiene OC para cantidad/material)
    if (estadoActual !== "BORRADOR" && !admin) {
      return NextResponse.json({
        error: "Este requerimiento ya fue enviado a aprobación. Solo un admin puede editarlo desde el módulo Requerimientos.",
      }, { status: 403 });
    }
    const tocaCantidadOMaterial = d.cantidad !== undefined || d.material_codigo !== undefined;
    if (tocaCantidadOMaterial && tieneOC && !admin) {
      return NextResponse.json({
        error: "No se puede modificar cantidad/material si ya hay OC.",
      }, { status: 403 });
    }

    // Si cambia material_codigo, resolver material_id (solo si tipo MAC)
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (v !== undefined) updates[k] = v === "" ? null : v;
    }
    if (d.fecha_requerida !== undefined) {
      updates.fecha_requerida = d.fecha_requerida ? new Date(d.fecha_requerida) : null;
    }
    if (d.material_codigo !== undefined && current.tipo_codigo === "MAC") {
      if (d.material_codigo) {
        const mat = await prisma.material.findUnique({ where: { codigo: d.material_codigo } });
        if (!mat) return NextResponse.json({ error: `Material "${d.material_codigo}" no existe.` }, { status: 400 });
        updates.material_id = mat.material_id;
      } else {
        updates.material_id = null;
      }
    }

    const updated = await prisma.oTRepuesto.update({
      where: { id: Number(id) },
      data: updates,
      include: {
        material: { select: { codigo: true, descripcion: true } },
        status_requerimiento: true,
        status_cotizacion: true,
        status_oc: true,
        proveedor: { select: { id: true, razon_social: true } },
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      if (error.code === "P2003") return NextResponse.json({ error: "Referencia inválida." }, { status: 400 });
    }
    console.error("PUT /api/requerimientos/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// DELETE — solo si no tiene OC y está en SIN_APROBACION o DESAPROBADO.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const current = await prisma.oTRepuesto.findUnique({
      where: { id: Number(id) },
      select: { status_requerimiento_codigo: true, po_id: true },
    });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    if (current.po_id != null) {
      return NextResponse.json({
        error: "No se puede eliminar: ya tiene OC asociada. Anulalo en su lugar.",
      }, { status: 409 });
    }
    const estado = current.status_requerimiento_codigo ?? "BORRADOR";
    if (ESTADOS_REQ_LOCKED_DELETE.has(estado)) {
      return NextResponse.json({
        error: `No se puede eliminar un requerimiento en estado ${estado}. Anulalo en su lugar.`,
      }, { status: 409 });
    }

    await prisma.oTRepuesto.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    console.error("DELETE /api/requerimientos/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

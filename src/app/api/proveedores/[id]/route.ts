import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const UpdateSchema = z.object({
  ruc: z.string().trim().min(1).optional(),
  razon_social: z.string().trim().min(1).optional(),
  nombre_comercial: z.string().trim().optional().nullable(),
  contacto: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  direccion: z.string().trim().optional().nullable(),
  activo: z.boolean().optional(),
});

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.proveedor.findUnique({ where: { id: Number(id) } });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const usuario = await getAuditUser(req);
    const data: Record<string, unknown> = {
      usuario_actualiza: usuario,
    };
    for (const k of ["ruc", "razon_social", "nombre_comercial", "contacto", "telefono", "email", "direccion", "activo"] as const) {
      if (k in parsed.data) {
        const v = parsed.data[k];
        data[k] = v === "" ? null : v;
      }
    }
    const updated = await prisma.proveedor.update({ where: { id: Number(id) }, data });
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2002") return NextResponse.json({ error: "RUC ya existe" }, { status: 409 });
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("PUT /api/proveedores/[id] error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const provId = Number(id);
    const force = new URL(req.url).searchParams.get("force") === "true";

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json({ error: "Solo administradores pueden eliminar permanentemente" }, { status: 403 });
      }
      const [compras, otRep] = await Promise.all([
        prisma.compra.count({ where: { proveedor_id: provId } }),
        prisma.oTRepuesto.count({ where: { proveedor_id: provId } }),
      ]);
      if (compras > 0 || otRep > 0) {
        const partes: string[] = [];
        if (compras > 0) partes.push(`${compras} compra(s)`);
        if (otRep > 0) partes.push(`${otRep} repuesto(s) de OT`);
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `Tiene ${partes.join(" y ")} en el historial. Use "Desactivar" o cierre esas referencias.`,
            compras,
            ot_repuestos: otRep,
          },
          { status: 409 },
        );
      }
      await prisma.proveedor.delete({ where: { id: provId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    const usuario = await getAuditUser(req);
    await prisma.proveedor.update({ where: { id: provId }, data: { activo: false, usuario_actualiza: usuario } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    console.error("DELETE /api/proveedores/[id] error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

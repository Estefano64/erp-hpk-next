import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditUser, isAdmin } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = await prisma.cliente.findUnique({
    where: { cliente_id: Number(id) },
  });
  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ data: item });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const usuario = await getAuditUser(req);
    const updated = await prisma.cliente.update({
      where: { cliente_id: Number(id) },
      data: {
        codigo: body.codigo,
        razon_social: body.razon_social,
        nombre_comercial: body.nombre_comercial || null,
        ruc: body.ruc || null,
        direccion: body.direccion || null,
        telefono: body.telefono || null,
        email: body.email || null,
        contacto_principal: body.contacto_principal || null,
        usuario_actualiza: usuario,
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const clienteId = Number(id);
    const force = new URL(req.url).searchParams.get("force") === "true";

    if (force) {
      if (!(await isAdmin(req))) {
        return NextResponse.json(
          { error: "Solo administradores pueden eliminar permanentemente" },
          { status: 403 }
        );
      }

      const [contratos, ots] = await Promise.all([
        prisma.contrato.count({ where: { cliente_id: clienteId } }),
        prisma.ordenTrabajo.count({ where: { id_cliente: clienteId } }),
      ]);

      if (contratos > 0 || ots > 0) {
        const partes: string[] = [];
        if (contratos > 0) partes.push(`${contratos} contrato(s)`);
        if (ots > 0) partes.push(`${ots} OT(s)`);
        return NextResponse.json(
          {
            error: "No se puede eliminar permanentemente",
            detail: `Tiene ${partes.join(" y ")} en el historial. Use "Desactivar" o cierre esas referencias.`,
            contratos,
            ots,
          },
          { status: 409 }
        );
      }

      await prisma.cliente.delete({ where: { cliente_id: clienteId } });
      return NextResponse.json({ success: true, permanent: true });
    }

    const usuario = await getAuditUser(req);
    await prisma.cliente.update({
      where: { cliente_id: clienteId },
      data: { activo: false, usuario_actualiza: usuario },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}

// POST /api/clientes/[id]/portal/cuentas/[cuentaId]/password — reset de
// contraseña de una cuenta de PORTAL. Guarda dura: la cuenta objetivo debe
// tener rol "cliente" y pertenecer al cliente del path; una cuenta de personal
// nunca es alcanzable desde acá aunque el caller conozca su id.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

const PUBLICADORES = ["admin", "planner", "produccion", "logistica"];

const Schema = z
  .object({
    nueva: z.string().min(6, "Mínimo 6 caracteres").max(100),
    confirmacion: z.string().min(1, "Confirmá la nueva contraseña"),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: "La nueva contraseña y la confirmación no coinciden",
    path: ["confirmacion"],
  });

type Params = { params: Promise<{ id: string; cuentaId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    const roles = (token?.roles as string[] | undefined) ?? [];
    if (!token || !PUBLICADORES.some((r) => roles.includes(r))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { id, cuentaId } = await params;
    const clienteId = parseInt4Safe(id) ?? 0;
    const usuarioId = parseInt4Safe(cuentaId) ?? 0;
    if (clienteId <= 0 || usuarioId <= 0) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const target = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, codigoEmpleado: true, roles: true, clienteId: true },
    });
    if (!target || !target.roles.includes("cliente") || target.clienteId !== clienteId) {
      return NextResponse.json({ error: "Cuenta de portal no encontrada" }, { status: 404 });
    }
    const hashed = await bcrypt.hash(parsed.data.nueva, 10);
    await prisma.usuario.update({ where: { id: target.id }, data: { password: hashed } });
    return NextResponse.json({
      ok: true,
      message: `Contraseña actualizada para ${target.nombre} (${target.codigoEmpleado})`,
    });
  } catch (error) {
    console.error("POST portal/cuentas/[cuentaId]/password error:", error);
    return NextResponse.json({ error: "Error al cambiar contraseña" }, { status: 500 });
  }
}

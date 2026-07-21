// POST /api/clientes/[id]/portal/cuentas/[cuentaId]/estado — activa o
// desactiva una cuenta de PORTAL ({ activo: boolean }). Misma guarda dura que
// el reset: solo cuentas rol "cliente" del cliente del path.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

const PUBLICADORES = ["admin", "planner", "produccion", "logistica"];

const Schema = z.object({ activo: z.boolean() });

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
      select: { id: true, roles: true, clienteId: true },
    });
    if (!target || !target.roles.includes("cliente") || target.clienteId !== clienteId) {
      return NextResponse.json({ error: "Cuenta de portal no encontrada" }, { status: 404 });
    }
    const updated = await prisma.usuario.update({
      where: { id: target.id },
      data: { activo: parsed.data.activo },
      select: { id: true, activo: true },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("POST portal/cuentas/[cuentaId]/estado error:", error);
    return NextResponse.json({ error: "Error al actualizar la cuenta" }, { status: 500 });
  }
}

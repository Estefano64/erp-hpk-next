// POST /api/clientes/[id]/portal/cuentas — crea una cuenta de PORTAL para
// este cliente. A diferencia del POST /api/usuarios (admin-only, maneja
// cualquier cuenta), este endpoint está acotado: SIEMPRE crea rol ["cliente"]
// vinculado al cliente del path — no puede crear cuentas de personal ni
// asignar otros roles. Por eso pueden usarlo los publicadores del portal
// (admin/planner/produccion/logistica, regla de escritura en acceso-rutas).

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseInt4Safe } from "@/lib/ot-formato";

const PUBLICADORES = ["admin", "planner", "produccion", "logistica"];

const Schema = z.object({
  codigoEmpleado: z.string().trim().min(1).max(20),
  nombre: z.string().trim().min(1).max(100),
  email: z.string().trim().email().optional().nullable(),
  password: z.string().min(6).max(100),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const token = await getToken({ req });
    const roles = (token?.roles as string[] | undefined) ?? [];
    if (!token || !PUBLICADORES.some((r) => roles.includes(r))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { id } = await params;
    const clienteId = parseInt4Safe(id) ?? 0;
    if (clienteId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const cliente = await prisma.cliente.findUnique({ where: { cliente_id: clienteId }, select: { cliente_id: true } });
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Validación", detail: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const hashed = await bcrypt.hash(d.password, 10);
    const created = await prisma.usuario.create({
      data: {
        codigoEmpleado: d.codigoEmpleado,
        nombre: d.nombre,
        email: d.email || null,
        password: hashed,
        // Acotado a propósito: portal, nada más.
        roles: ["cliente"],
        clienteId,
        activo: true,
      },
      select: { id: true, codigoEmpleado: true, nombre: true, email: true, activo: true },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg.includes("P2002")) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese código o email" }, { status: 409 });
    }
    console.error("POST /api/clientes/[id]/portal/cuentas error:", error);
    return NextResponse.json({ error: "Error al crear la cuenta" }, { status: 500 });
  }
}

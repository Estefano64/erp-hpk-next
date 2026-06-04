import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permisos";

// POST /api/usuarios/[id]/cambiar-password
// Reset de contraseña por un admin. NO requiere la contraseña actual (es un
// reset de soporte: el admin no la conoce). Solo se permite a roles "admin".
//
// Body: { nueva: string, confirmacion: string }
const Schema = z
  .object({
    nueva: z.string().min(6, "Mínimo 6 caracteres").max(100),
    confirmacion: z.string().min(1, "Confirmá la nueva contraseña"),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: "La nueva contraseña y la confirmación no coinciden",
    path: ["confirmacion"],
  });

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!hasRole(session, "admin")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const { id } = await params;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const target = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, nombre: true, codigoEmpleado: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const hashed = await bcrypt.hash(parsed.data.nueva, 10);
    await prisma.usuario.update({
      where: { id: target.id },
      data: { password: hashed },
    });
    return NextResponse.json({
      ok: true,
      message: `Contraseña actualizada para ${target.nombre} (${target.codigoEmpleado})`,
    });
  } catch (error) {
    console.error("POST /api/usuarios/[id]/cambiar-password error:", error);
    return NextResponse.json({ error: "Error al cambiar contraseña" }, { status: 500 });
  }
}

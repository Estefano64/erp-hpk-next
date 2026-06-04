import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/me/cambiar-password
// Cambio de contraseña por el propio usuario. Requiere la contraseña actual
// para validar identidad — esto evita que un dispositivo desatendido con la
// sesión abierta pueda cambiarla sin conocer la clave previa.
//
// Body: { actual: string, nueva: string, confirmacion: string }
const Schema = z
  .object({
    actual: z.string().min(1, "La contraseña actual es obligatoria"),
    nueva: z.string().min(6, "Mínimo 6 caracteres").max(100),
    confirmacion: z.string().min(1, "Confirmá la nueva contraseña"),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: "La nueva contraseña y la confirmación no coinciden",
    path: ["confirmacion"],
  })
  .refine((d) => d.actual !== d.nueva, {
    message: "La nueva contraseña debe ser distinta de la actual",
    path: ["nueva"],
  });

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validación", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { actual, nueva } = parsed.data;

    const user = await prisma.usuario.findUnique({
      where: { id: Number(userId) },
      select: { id: true, password: true, activo: true },
    });
    if (!user || !user.activo) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    const ok = await bcrypt.compare(actual, user.password);
    if (!ok) {
      return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(nueva, 10);
    await prisma.usuario.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return NextResponse.json({ ok: true, message: "Contraseña actualizada" });
  } catch (error) {
    console.error("POST /api/me/cambiar-password error:", error);
    return NextResponse.json({ error: "Error al cambiar contraseña" }, { status: 500 });
  }
}

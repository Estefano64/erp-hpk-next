import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioIdSesion } from "@/lib/notificaciones-server";

// GET /api/notificaciones — buzón de la cuenta logueada.
// Devuelve las últimas N (no leídas primero) + el contador de no leídas que
// pinta el badge. La campanita lo consulta al montar y cada minuto.
export async function GET(req: NextRequest) {
  const usuarioId = await getUsuarioIdSesion(req);
  if (usuarioId == null) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));
    const [data, noLeidas] = await Promise.all([
      prisma.notificacion.findMany({
        where: { usuario_id: usuarioId },
        orderBy: [{ leida: "asc" }, { created_at: "desc" }],
        take: limit,
      }),
      prisma.notificacion.count({ where: { usuario_id: usuarioId, leida: false } }),
    ]);
    return NextResponse.json({ data, noLeidas });
  } catch (e) {
    console.error("GET /api/notificaciones error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST /api/notificaciones — marca leídas. Body: { ids?: number[] }.
// Sin ids marca TODAS las del usuario. El `usuario_id` del where garantiza
// que nadie pueda tocar el buzón de otro.
export async function POST(req: NextRequest) {
  const usuarioId = await getUsuarioIdSesion(req);
  if (usuarioId == null) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.filter((n: unknown) => Number.isInteger(n) && (n as number) > 0)
      : [];
    const res = await prisma.notificacion.updateMany({
      where: {
        usuario_id: usuarioId,
        leida: false,
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { leida: true, fecha_lectura: new Date() },
    });
    return NextResponse.json({ ok: true, marcadas: res.count });
  } catch (e) {
    console.error("POST /api/notificaciones error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

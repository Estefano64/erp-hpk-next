// GET /api/locks?resource=ot-externa&id=123 — estado del lock (sin tomarlo).
// Útil para mostrar "X está editando" en pantallas que aún no decidieron
// entrar a edición.
import { NextRequest, NextResponse } from "next/server";
import { isValidResourceType, readLock, LOCK_TTL_SECONDS } from "@/lib/edit-locks";

export async function GET(req: NextRequest) {
  const resource = req.nextUrl.searchParams.get("resource");
  const idRaw = req.nextUrl.searchParams.get("id");
  if (!isValidResourceType(resource)) {
    return NextResponse.json({ error: "resource inválido" }, { status: 400 });
  }
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const state = await readLock(resource, id);
  if (!state || state.is_stale) {
    return NextResponse.json({ locked: false, ttl_seconds: LOCK_TTL_SECONDS });
  }
  return NextResponse.json({
    locked: true,
    locked_by: state.usuario,
    acquired_at: state.acquired_at,
    last_heartbeat: state.last_heartbeat,
    ttl_seconds: LOCK_TTL_SECONDS,
  });
}

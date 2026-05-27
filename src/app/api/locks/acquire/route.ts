// POST /api/locks/acquire — { resource, id }
// Intenta tomar el lock. Devuelve { ok: true } o { ok: false, locked_by }.
import { NextRequest, NextResponse } from "next/server";
import { acquireLock, isValidResourceType, LOCK_TTL_SECONDS } from "@/lib/edit-locks";
import { getAuditUser } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const usuario = await getAuditUser(req);
  if (!usuario) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { resource?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!isValidResourceType(body.resource)) {
    return NextResponse.json({ error: "resource inválido" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const result = await acquireLock(body.resource, id, usuario);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        locked_by: result.locked_by,
        acquired_at: result.acquired_at,
        last_heartbeat: result.last_heartbeat,
        ttl_seconds: LOCK_TTL_SECONDS,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, usuario, ttl_seconds: LOCK_TTL_SECONDS });
}

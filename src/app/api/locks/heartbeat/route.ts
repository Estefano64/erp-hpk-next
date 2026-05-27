// POST /api/locks/heartbeat — { resource, id }
// Refresca el lock del caller. Si devuelve { ok: false } el front debe asumir
// que perdió el lock (TTL venció y/o otro lo tomó) y volver a modo lectura.
import { NextRequest, NextResponse } from "next/server";
import { heartbeatLock, isValidResourceType } from "@/lib/edit-locks";
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

  const ok = await heartbeatLock(body.resource, id, usuario);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Lock perdido" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

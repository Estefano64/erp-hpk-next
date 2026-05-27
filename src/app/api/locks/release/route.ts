// POST /api/locks/release — { resource, id }
// Libera el lock si el caller es el owner. Idempotente.
import { NextRequest, NextResponse } from "next/server";
import { releaseLock, isValidResourceType } from "@/lib/edit-locks";
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

  await releaseLock(body.resource, id, usuario);
  return NextResponse.json({ ok: true });
}

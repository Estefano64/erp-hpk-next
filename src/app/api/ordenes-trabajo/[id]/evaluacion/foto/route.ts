// GET    /api/ordenes-trabajo/[id]/evaluacion/foto?key=...  → URL firmada para preview
// DELETE /api/ordenes-trabajo/[id]/evaluacion/foto?key=...  → borra el objeto de R2
//
// Las fotos viven dentro del JSON `EvaluacionTecnica.datos_formulario` (sin
// tabla intermedia), por eso no podemos usar el helper genérico
// /api/r2/download-url que requiere resource+resourceId+key en BD. Validación
// de access: la `key` debe empezar con el prefijo de evaluación de ESTA OT
// (`R2Keys.otEvaluacion(otCodigoFor(ot))/fotos/...`). Así garantizamos que un
// user no puede leer/borrar keys de otras OTs.
import { NextResponse, type NextRequest } from "next/server";
import { generateDownloadUrl, deleteObject } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess } from "@/lib/r2-server";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

function validarKey(key: string | null, otCodigo: string): { ok: true; key: string } | { ok: false; response: NextResponse } {
  if (!key || typeof key !== "string") {
    return { ok: false, response: NextResponse.json({ error: "key requerida" }, { status: 400 }) };
  }
  const prefijo = `${R2Keys.otEvaluacion(otCodigo)}/fotos/`;
  if (!key.startsWith(prefijo)) {
    return { ok: false, response: NextResponse.json({ error: "key fuera del namespace de esta OT" }, { status: 403 }) };
  }
  return { ok: true, key };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = parseInt4Safe(id) ?? 0;
  const access = await assertOTAccess(req, otId);
  if (!access.ok) return access.response;

  const key = req.nextUrl.searchParams.get("key");
  const valid = validarKey(key, otCodigoFor(access.ot));
  if (!valid.ok) return valid.response;

  try {
    const downloadUrl = await generateDownloadUrl(valid.key);
    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error("GET /api/ordenes-trabajo/[id]/evaluacion/foto error:", error);
    return NextResponse.json({ error: "Error generando URL de descarga" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = parseInt4Safe(id) ?? 0;
  const access = await assertOTAccess(req, otId);
  if (!access.ok) return access.response;

  const key = req.nextUrl.searchParams.get("key");
  const valid = validarKey(key, otCodigoFor(access.ot));
  if (!valid.ok) return valid.response;

  try {
    // R2 es idempotente: si la key no existe igual devuelve 204.
    await deleteObject(valid.key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/ordenes-trabajo/[id]/evaluacion/foto error:", error);
    return NextResponse.json({ error: "Error al eliminar de R2" }, { status: 500 });
  }
}

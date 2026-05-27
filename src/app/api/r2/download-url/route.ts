// POST /api/r2/download-url
// Body: { key: string, resource: R2Resource, resourceId: number }
// Devuelve: { downloadUrl } — válida 10 minutos.
//
// Verifica que la key efectivamente esté ligada al recurso indicado en BD antes
// de firmar (no se aceptan keys arbitrarias del cliente).
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { generateDownloadUrl } from "@/lib/r2-helpers";
import { authorizeR2Access, isValidResource } from "@/lib/r2-authz";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { key, resource, resourceId } = body as {
    key?: unknown;
    resource?: unknown;
    resourceId?: unknown;
  };

  if (typeof key !== "string" || key.length === 0) {
    return NextResponse.json({ error: "key requerida" }, { status: 400 });
  }
  if (!isValidResource(resource)) {
    return NextResponse.json({ error: "resource inválido" }, { status: 400 });
  }
  const idNum = typeof resourceId === "number" ? resourceId : Number(resourceId);

  const authz = await authorizeR2Access({ resource, resourceId: idNum, key });
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status ?? 403 });
  }

  try {
    const downloadUrl = await generateDownloadUrl(key);
    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error("POST /api/r2/download-url error:", error);
    return NextResponse.json({ error: "Error generando URL de descarga" }, { status: 500 });
  }
}

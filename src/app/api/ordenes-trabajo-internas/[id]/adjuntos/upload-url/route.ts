// POST /api/ordenes-trabajo-internas/[id]/adjuntos/upload-url
// Genera una presigned URL bajo el namespace de la OT interna. El cliente NO
// decide el path — lo arma el backend con R2Keys.otInternaAdjunto.
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otInternaCodigoFor } from "@/lib/r2";
import { assertOTInternaAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = Number(id);

  const access = await assertOTInternaAccess(req, otId);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
    const folderPrefix = R2Keys.otInternaAdjunto(otInternaCodigoFor(access.ot));
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ordenes-trabajo-internas/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

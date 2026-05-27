// POST /api/requerimientos/[id]/adjuntos/upload-url
// Genera presigned URL para subir un adjunto de un item de requerimiento.
// El path se arma con R2Keys.requerimientoAdjunto(otCodigo, reqId).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const reqId = Number(id);
  if (!Number.isFinite(reqId) || reqId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Cargar el requerimiento para resolver la OT padre.
  const item = await prisma.oTRepuesto.findUnique({
    where: { id: reqId },
    select: { id: true, ot_id: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Requerimiento no encontrado" }, { status: 404 });
  }

  const access = await assertOTAccess(req, item.ot_id);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
    const folderPrefix = R2Keys.requerimientoAdjunto(otCodigoFor(access.ot), reqId);
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/requerimientos/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

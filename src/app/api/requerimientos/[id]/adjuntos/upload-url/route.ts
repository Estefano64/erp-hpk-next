// POST /api/requerimientos/[id]/adjuntos/upload-url
// Genera presigned URL para subir un adjunto de un item de requerimiento.
// El path R2 depende de si el requerimiento pertenece a una OT externa o interna:
//   - Externa:  R2Keys.requerimientoAdjunto(otCodigo, reqId)
//   - Interna:  R2Keys.otInternaRequerimientoAdjunto(otInternaCodigo, reqId)
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor, otInternaCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const reqId = Number(id);
  if (!Number.isFinite(reqId) || reqId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Cargar el requerimiento para resolver la OT padre (externa o interna).
  const item = await prisma.oTRepuesto.findUnique({
    where: { id: reqId },
    select: {
      id: true,
      ot_id: true,
      orden_trabajo_interna_id: true,
      orden_trabajo_interna: { select: { id: true, ot: true } },
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Requerimiento no encontrado" }, { status: 404 });
  }

  // Resolver folderPrefix según el tipo de OT padre + validar acceso.
  let folderPrefix: string;
  if (item.ot_id != null) {
    const access = await assertOTAccess(req, item.ot_id);
    if (!access.ok) return access.response;
    folderPrefix = R2Keys.requerimientoAdjunto(otCodigoFor(access.ot), reqId);
  } else if (item.orden_trabajo_interna) {
    // Sin assertOTAccess específico para OT interna todavía — solo validamos sesión.
    const token = await getToken({ req });
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    folderPrefix = R2Keys.otInternaRequerimientoAdjunto(
      otInternaCodigoFor(item.orden_trabajo_interna),
      reqId,
    );
  } else {
    return NextResponse.json({ error: "Requerimiento sin OT asociada" }, { status: 400 });
  }

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
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

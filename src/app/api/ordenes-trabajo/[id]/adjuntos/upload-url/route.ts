// POST /api/ordenes-trabajo/[id]/adjuntos/upload-url
// Genera una presigned URL para subir un adjunto a R2 dentro del namespace de
// la OT. El cliente NO decide el path — lo arma el backend con R2Keys.
//
// Body: { fileName, fileType, fileSize, etapa }
// Devuelve: { uploadUrl, key }
//
// Después de subir a R2, el cliente debe llamar POST /api/ordenes-trabajo/[id]/adjuntos
// con { key, nombre_archivo, tipo_mime, tamano, etapa } para registrar en BD.
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";

type Params = { params: Promise<{ id: string }> };

const ETAPAS_VALIDAS = new Set(["recepcion", "evaluacion", "cotizacion", "termino", "despacho", "facturacion"]);

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = Number(id);

  const access = await assertOTAccess(req, otId);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  const etapa = parsed.body.etapa;
  if (typeof etapa !== "string" || !ETAPAS_VALIDAS.has(etapa)) {
    return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
  }

  try {
    const folderPrefix = R2Keys.otAdjunto(otCodigoFor(access.ot));
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ordenes-trabajo/[id]/adjuntos/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

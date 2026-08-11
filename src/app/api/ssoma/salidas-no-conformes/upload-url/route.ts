// POST /api/ssoma/salidas-no-conformes/upload-url
// Presigned URL para subir una foto de una Salida No Conforme a R2.
// Namespace plano `ssoma/salidas-no-conformes/` — la foto puede subirse antes
// de que exista el registro (se adjunta al crear o al cerrar).
//
// Body: { fileName, fileType, fileSize } → { uploadUrl, key }
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys } from "@/lib/r2";
import { readJsonBody, validateUploadBody } from "@/lib/r2-server";

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "imagenes");
  if (!upload.ok) return upload.response;

  try {
    const result = await generateUploadUrl({
      folderPrefix: R2Keys.ssomaSalidaNoConforme(),
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ssoma/salidas-no-conformes/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

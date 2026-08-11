// POST /api/ssoma/reportes-seguridad/upload-url
// Presigned URL para subir una foto de un Reporte de Seguridad a R2.
// Namespace plano `ssoma/reportes-seguridad/` (como tickets): la foto puede
// subirse antes de que exista el reporte (se registra al crear) o después
// vía POST /api/ssoma/reportes-seguridad/[id]/fotos.
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
      folderPrefix: R2Keys.ssomaReporteSeguridad(),
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ssoma/reportes-seguridad/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

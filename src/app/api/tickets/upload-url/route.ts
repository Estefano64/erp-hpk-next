// POST /api/tickets/upload-url
// Genera una presigned URL para subir una captura (screenshot) de un Ticket a R2.
// Como el ticket aún no existe al momento de subir, el path es el namespace
// genérico `tickets/`. Después de subir, el cliente llama POST /api/tickets
// pasando la `key` como `captura_key`.
//
// Body: { fileName, fileType, fileSize }
// Devuelve: { uploadUrl, key }
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys } from "@/lib/r2";
import { readJsonBody, validateUploadBody } from "@/lib/r2-server";

export async function POST(req: NextRequest) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  // "documentos" admite imágenes y PDFs; suficiente para capturas de pantalla.
  const upload = validateUploadBody(parsed.body, "documentos");
  if (!upload.ok) return upload.response;

  try {
    const result = await generateUploadUrl({
      folderPrefix: R2Keys.ticket(),
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/tickets/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

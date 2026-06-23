// POST /api/ordenes-trabajo/[id]/evaluacion/foto/upload-url
//
// Genera una presigned URL para subir UNA foto de la hoja de evaluación
// técnica a R2 (Cloudflare). Reemplaza el flujo legacy donde las fotos se
// guardaban como base64 inline en `EvaluacionTecnica.datos_formulario`
// (que inflaba el JSON, los backups y el payload de cada GET/PUT).
//
// Path en R2: `R2Keys.otEvaluacion(otCodigo)/fotos/...`
// El cliente NUNCA elige la path — la arma el backend con el código de la OT.
// El nombre final lo agrega `generateUploadUrl` (timestamp + uuid + sanitizado).
//
// Body: { fileName, fileType, fileSize }
// Devuelve: { uploadUrl, key }
//
// Después de subir a R2, el cliente guarda `{ name, r2_key }` dentro de
// `datos_formulario` y persiste la evaluación con el PUT habitual. No hay
// tabla intermedia (todas las fotos viven dentro del JSON de la evaluación).
import { NextResponse, type NextRequest } from "next/server";
import { generateUploadUrl } from "@/lib/r2-helpers";
import { R2Keys, otCodigoFor } from "@/lib/r2";
import { assertOTAccess, readJsonBody, validateUploadBody } from "@/lib/r2-server";
import { parseInt4Safe } from "@/lib/ot-formato";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const otId = parseInt4Safe(id) ?? 0;

  const access = await assertOTAccess(req, otId);
  if (!access.ok) return access.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const upload = validateUploadBody(parsed.body, "imagenes");
  if (!upload.ok) return upload.response;

  try {
    // Subcarpeta "fotos" debajo de la carpeta de evaluaciones de la OT.
    // Mantiene los informes (.docx/.pdf) separados de las fotos.
    const folderPrefix = `${R2Keys.otEvaluacion(otCodigoFor(access.ot))}/fotos`;
    const result = await generateUploadUrl({
      folderPrefix,
      fileName: upload.value.fileName,
      fileType: upload.value.fileType,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/ordenes-trabajo/[id]/evaluacion/foto/upload-url error:", error);
    return NextResponse.json({ error: "Error generando URL de subida" }, { status: 500 });
  }
}

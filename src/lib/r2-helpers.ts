// Helpers para generar URLs firmadas y manejar objetos en R2.
// Las URLs firmadas son la ÚNICA vía de acceso a archivos (no hay acceso público).
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import {
  getR2Client,
  getR2Bucket,
  UPLOAD_URL_EXPIRES_SECONDS,
  DOWNLOAD_URL_EXPIRES_SECONDS,
} from "./r2";

// Sanitiza el filename para uso como último segmento de key en R2.
// Mantiene letras, números, punto, guion y guion bajo. Resto -> "_".
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 200);
}

// Genera URL firmada para PUT. El folderPrefix lo arma el módulo con R2Keys.X(...).
// El cliente NUNCA decide el folderPrefix — siempre viene del backend después de
// validar acceso al recurso padre.
export async function generateUploadUrl(params: {
  folderPrefix: string;
  fileName: string;
  fileType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const safeName = sanitizeFileName(params.fileName);
  const key = `${params.folderPrefix}/${Date.now()}-${randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: params.fileType,
  });

  const uploadUrl = await getSignedUrl(getR2Client(), command, {
    expiresIn: UPLOAD_URL_EXPIRES_SECONDS,
  });

  return { uploadUrl, key };
}

export async function generateDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getR2Bucket(), Key: key });
  return getSignedUrl(getR2Client(), command, { expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS });
}

// Elimina un objeto. Si la key no existe R2 igual devuelve 204 (idempotente).
// Errores reales (red, credenciales) lanzan.
export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

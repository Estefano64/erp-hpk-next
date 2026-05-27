// Helpers cliente para interactuar con R2 vía endpoints presigned.
// Se importa desde componentes "use client".
//
// El cliente NUNCA elige el path en R2. Cada módulo (OT, requerimientos,
// compras, evaluaciones) tiene su propio endpoint upload-url que arma el path
// con R2Keys del lado servidor, después de validar acceso al recurso padre.

import type { R2Resource } from "./r2-authz";

export type { R2Resource };

// Pide una presigned upload URL al endpoint específico del módulo y sube el
// File directo a R2.
// Devuelve la metadata para que el caller registre el adjunto en BD con un
// segundo POST al endpoint del módulo.
//
// Ejemplos:
//   uploadToR2({ file, uploadUrlEndpoint: `/api/ordenes-trabajo/${otId}/adjuntos/upload-url`, extra: { etapa: "recepcion" } })
//   uploadToR2({ file, uploadUrlEndpoint: `/api/compras/${compraId}/guia/upload-url?tipo=guia` })
export async function uploadToR2(params: {
  file: File;
  uploadUrlEndpoint: string;
  extra?: Record<string, unknown>;
  onProgress?: (pct: number) => void;
}): Promise<{ key: string; nombre_archivo: string; tipo_mime: string; tamano: number }> {
  const { file, uploadUrlEndpoint, extra, onProgress } = params;

  const res = await fetch(uploadUrlEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      ...(extra ?? {}),
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "No se pudo obtener URL de subida");
  }
  const { uploadUrl, key } = (await res.json()) as { uploadUrl: string; key: string };

  // XHR para reportar progreso (fetch no expone progreso de upload).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 PUT falló: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Error de red al subir a R2"));
    xhr.send(file);
  });

  return {
    key,
    nombre_archivo: file.name,
    tipo_mime: file.type || "application/octet-stream",
    tamano: file.size,
  };
}

// Pide una presigned download URL para un recurso ya registrado en BD.
export async function getDownloadUrl(params: {
  key: string;
  resource: R2Resource;
  resourceId: number;
}): Promise<string> {
  const res = await fetch("/api/r2/download-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "No se pudo obtener URL de descarga");
  }
  const { downloadUrl } = (await res.json()) as { downloadUrl: string };
  return downloadUrl;
}

// Abre el archivo en una nueva pestaña pidiendo la presigned URL al vuelo.
// Útil para handlers onClick.
export async function openR2File(params: {
  key: string;
  resource: R2Resource;
  resourceId: number;
}): Promise<void> {
  const url = await getDownloadUrl(params);
  window.open(url, "_blank", "noopener,noreferrer");
}

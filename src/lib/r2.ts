// Cliente Cloudflare R2 (compatible S3). Singleton lazy: se instancia la primera
// vez que se usa, no al importar el módulo.
//
// IMPORTANTE: NO leer env vars en el top-level — `next build` evalúa todos los
// módulos de las API routes durante "Collecting page data", y si esto lanza el
// build muere aunque la ruta nunca se ejecute. Por eso la validación de env
// está dentro de getR2Client() / getR2Bucket() — solo falla en runtime cuando
// realmente se necesita R2.
import { S3Client } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable de entorno ${name} no configurada`);
  return v;
}

let _r2: S3Client | null = null;
let _bucket: string | null = null;

export function getR2Client(): S3Client {
  if (_r2) return _r2;
  _r2 = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return _r2;
}

export function getR2Bucket(): string {
  if (_bucket) return _bucket;
  _bucket = requireEnv("R2_BUCKET_NAME");
  return _bucket;
}

// Estructura de carpetas en R2 — todo gira alrededor de la OT.
//
//   hpyk-erp-files/
//   └── ordenes-trabajo/
//       └── <otCodigo>/
//           ├── adjuntos/                  → OtAdjunto
//           ├── evaluaciones/              → EvaluacionTecnica.informe_key
//           ├── requerimientos/<reqId>/    → OTRepuestoAdjunto
//           └── compras/
//               └── <ocCodigo>/
//                   ├── guia/              → Compra.guia_key
//                   └── factura/           → Compra.factura_key
//
//   compras-sueltas/                       → Compra.ot_id == null
//   └── <ocCodigo>/
//       ├── guia/
//       └── factura/
//
// IMPORTANTE: estas funciones devuelven el "folder prefix" (sin filename).
// El filename se agrega al firmar la URL (timestamp+uuid+nombre-sanitizado).
// El cliente nunca arma estos paths — son responsabilidad del backend.
export const R2Keys = {
  otAdjunto: (otCodigo: string) => `ordenes-trabajo/${sanitize(otCodigo)}/adjuntos`,
  otEvaluacion: (otCodigo: string) => `ordenes-trabajo/${sanitize(otCodigo)}/evaluaciones`,
  requerimientoAdjunto: (otCodigo: string, reqId: number) =>
    `ordenes-trabajo/${sanitize(otCodigo)}/requerimientos/${reqId}`,
  compraGuia: (otCodigo: string, ocCodigo: string) =>
    `ordenes-trabajo/${sanitize(otCodigo)}/compras/${sanitize(ocCodigo)}/guia`,
  compraFactura: (otCodigo: string, ocCodigo: string) =>
    `ordenes-trabajo/${sanitize(otCodigo)}/compras/${sanitize(ocCodigo)}/factura`,
  compraSueltaGuia: (ocCodigo: string) => `compras-sueltas/${sanitize(ocCodigo)}/guia`,
  compraSueltaFactura: (ocCodigo: string) => `compras-sueltas/${sanitize(ocCodigo)}/factura`,
  // Capturas de tickets (bugs/mejoras del ERP). No vinculados a OT.
  ticket: () => `tickets`,
  // Adjuntos de OT Interna — mismo patrón que OT Externa pero en otro namespace.
  otInternaAdjunto: (otCodigo: string) => `ot-internas/${sanitize(otCodigo)}/adjuntos`,
} as const;

// Sanitiza un segmento de path para evitar inyección (../, slashes, etc.).
// Mantiene letras, números, punto, guion y guion bajo. Lo demás se reemplaza.
function sanitize(segment: string): string {
  const cleaned = (segment ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  if (cleaned.length === 0) {
    throw new Error("Segmento de path R2 vacío después de sanitizar");
  }
  return cleaned.slice(0, 100);
}

// Devuelve el código legible de una OT (su campo `ot`) o un fallback `OT-{id}`
// cuando el código está vacío.
export function otCodigoFor(ot: { id: number; ot: string | null }): string {
  const codigo = (ot.ot ?? "").trim();
  return codigo.length > 0 ? codigo : `OT-${ot.id}`;
}

// Expiraciones fijas. NO recibir override del caller — los presets están pensados
// para el caso de uso del ERP y subirlos sin necesidad amplía la ventana de robo
// de URLs firmadas.
export const UPLOAD_URL_EXPIRES_SECONDS = 60 * 5;   // 5 minutos
export const DOWNLOAD_URL_EXPIRES_SECONDS = 60 * 10; // 10 minutos

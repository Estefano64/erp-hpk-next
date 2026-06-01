// Utilidades de servidor para endpoints de R2:
//   - assertOTAccess: punto único donde validar que el usuario tenga permiso
//     sobre una OT. HOY solo chequea existencia + sesión activa. Cuando se
//     implemente la matriz de roles (ver docs/AREAS_Y_PERMISOS.txt), agregar
//     acá las reglas por rol — todos los endpoints ya pasan por esta función.
//   - parseUploadBody: extrae y valida el body común de los endpoints upload-url.
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "./prisma";
import { validarArchivo, type CategoriaUpload } from "./file-uploads";

export interface OTSummary {
  id: number;
  // OT externa: number (NNNNYY tras la migración VARCHAR → INTEGER 2026-05-28).
  // OT interna: number (NNNNYY tras la migración a Int el 2026-05-31).
  ot: number | string | null;
}

export type AccessResult =
  | { ok: true; ot: OTSummary }
  | { ok: false; response: NextResponse };

// Verifica sesión + existencia de la OT. Devuelve la OT (id, ot) si OK.
// HOY no aplica filtros por rol — pendiente cuando se complete la matriz de
// permisos. Cualquier endpoint que use R2Keys debe pasar por este helper.
export async function assertOTAccess(
  req: NextRequest,
  otId: number,
): Promise<AccessResult> {
  const token = await getToken({ req });
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (!Number.isFinite(otId) || otId <= 0) {
    return { ok: false, response: NextResponse.json({ error: "OT inválida" }, { status: 400 }) };
  }
  const ot = await prisma.ordenTrabajo.findUnique({
    where: { id: otId },
    select: { id: true, ot: true },
  });
  if (!ot) {
    return { ok: false, response: NextResponse.json({ error: "OT no encontrada" }, { status: 404 }) };
  }
  // TODO: aplicar reglas por rol cuando se complete docs/AREAS_Y_PERMISOS.txt.
  // Ejemplo: if (token.rol === "viewer" && operacionEsEscritura) return 403.
  return { ok: true, ot };
}

// Mismo patrón que assertOTAccess, pero para OT Internas. Valida sesión +
// existencia de la OT y devuelve un OTSummary compatible con otCodigoFor.
export async function assertOTInternaAccess(
  req: NextRequest,
  otId: number,
): Promise<AccessResult> {
  const token = await getToken({ req });
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (!Number.isFinite(otId) || otId <= 0) {
    return { ok: false, response: NextResponse.json({ error: "OT inválida" }, { status: 400 }) };
  }
  const ot = await prisma.ordenTrabajoInterna.findUnique({
    where: { id: otId },
    select: { id: true, ot: true },
  });
  if (!ot) {
    return { ok: false, response: NextResponse.json({ error: "OT no encontrada" }, { status: 404 }) };
  }
  return { ok: true, ot };
}

export interface UploadBodyValid {
  fileName: string;
  fileType: string;
  fileSize: number;
}

// Parsea el body del request a JSON. Devuelve 400 si no es JSON válido.
export async function readJsonBody(
  req: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    if (raw === null || typeof raw !== "object") {
      return { ok: false, response: NextResponse.json({ error: "Body debe ser un objeto JSON" }, { status: 400 }) };
    }
    return { ok: true, body: raw };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}

// Valida los campos comunes de un body de upload-url (fileName, fileType, fileSize)
// + reglas de tipo/tamaño según la categoría. El body se lee con readJsonBody primero.
export function validateUploadBody(
  body: Record<string, unknown>,
  categoria: CategoriaUpload,
): { ok: true; value: UploadBodyValid } | { ok: false; response: NextResponse } {
  const { fileName, fileType, fileSize } = body;
  if (typeof fileName !== "string" || fileName.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "fileName requerido" }, { status: 400 }) };
  }
  if (typeof fileType !== "string" || fileType.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "fileType requerido" }, { status: 400 }) };
  }
  if (typeof fileSize !== "number" || !Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, response: NextResponse.json({ error: "fileSize inválido" }, { status: 400 }) };
  }
  const validacion = validarArchivo(
    { name: fileName, type: fileType, size: fileSize } as File,
    categoria,
  );
  if (!validacion.ok) {
    return { ok: false, response: NextResponse.json({ error: validacion.error }, { status: 400 }) };
  }
  return { ok: true, value: { fileName, fileType, fileSize } };
}
